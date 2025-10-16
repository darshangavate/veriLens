import os, json, faiss, numpy as np
from sentence_transformers import SentenceTransformer

META_PATH  = os.getenv("META_PATH", "meta.json")
INDEX_PATH = os.getenv("INDEX_PATH", "index.faiss")

# Load meta + FAISS
with open(META_PATH, "r", encoding="utf-8") as f:
    META = json.load(f)
index = faiss.read_index(INDEX_PATH)
index_dim = index.d  # <— actual index dimension

# Choose model that matches index dim (or override with RAG_MODEL)
MODEL_NAME = os.getenv("RAG_MODEL")
if not MODEL_NAME:
    if index_dim == 384:
        MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
    elif index_dim == 768:
        MODEL_NAME = "sentence-transformers/multi-qa-mpnet-base-dot-v1"
    elif index_dim == 1024:
        MODEL_NAME = "intfloat/e5-large-v2"  # common 1024-dim
    else:
        raise RuntimeError(f"Unknown index dim {index_dim}. Set RAG_MODEL env var to the model used for indexing.")

print(f"[info] index dim={index_dim} → using embedder: {MODEL_NAME}")
model = SentenceTransformer(MODEL_NAME)

def embed(texts):
    vecs = model.encode(texts, convert_to_numpy=True, normalize_embeddings=True).astype("float32")
    # sanity check (avoid the FAISS assert)
    if vecs.shape[1] != index_dim:
        raise RuntimeError(f"Embedder dim {vecs.shape[1]} != index dim {index_dim}. "
                           f"Set RAG_MODEL to the correct model used for indexing.")
    return vecs

def search(query: str, k: int = 5):
    q = embed([query])
    k = min(k, index.ntotal) if index.ntotal > 0 else 0
    if k == 0: return []
    D, I = index.search(q, k)
    hits = []
    for score, idx in zip(D[0], I[0]):
        if int(idx) < 0: continue
        m = META[idx]
        hits.append({
            "score": float(score),
            "url": m.get("url"),
            "title": m.get("title") or m.get("url"),
            "snippet": (m.get("snippet") or "")[:500]
        })
    return hits
