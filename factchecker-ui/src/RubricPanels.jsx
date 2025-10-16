import React, {useEffect, useMemo, useRef, useState} from "react";

const API_BASE  = process.env.REACT_APP_API_BASE || "http://127.0.0.1:8000";
const TRUST_URL = process.env.PUBLIC_URL + "/author_trust.csv";

const scoreColor = (n=0) => n>=80?"text-green-400":n>=50?"text-yellow-400":"text-red-500";
const bandLabel  = (n=0) => n>=80?"Reliable":n>=50?"Mixed":"Low";

const Pill = ({level}) => (
  <span className={
    "px-2 py-0.5 rounded-full text-[11px] border " +
    (level==="high" ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" :
     level==="med"  ? "bg-amber-500/10 text-amber-300 border-amber-500/30" :
                      "bg-rose-500/10 text-rose-300 border-rose-500/30")
  }>{level}</span>
);

const safeHost = (u) => { try { return new URL(u).host; } catch { return u; } };

// ---------- Evidence ----------
// ---------- Evidence ----------
function Evidence({items, onRefetch, fetching}) {
    return (
      <div className="grid gap-2 min-w-0"> {/* ← allow grid child shrink */}
        <div className="flex items-center justify-between mb-1 min-w-0">
          <div className="font-semibold text-white truncate">Evidence sources</div>
          {!!onRefetch && (
            <button
              onClick={onRefetch}
              className="text-xs px-2 py-1 rounded-md bg-white/5 border border-white/10 text-gray-300 hover:text-white shrink-0"
              disabled={fetching}
            >
              {fetching? "Searching…" : "Refresh"}
            </button>
          )}
        </div>
  
        {(!items || items.length===0) && (
          <p className="text-xs text-gray-400">No sources yet.</p>
        )}
  
        {(items||[]).map((it,i)=>(
          <div key={i} className="flex items-center gap-2 min-w-0">
            <a
              className="flex-1 min-w-0 block overflow-hidden text-ellipsis whitespace-nowrap text-cyan-300 hover:underline"
              href={it.url}
              target="_blank"
              rel="noreferrer"
              title={it.title || it.url}
            >
              {it.title || safeHost(it.url)}
            </a>
            <div className="shrink-0">
              <Pill level={it.match||"low"} />
            </div>
          </div>
        ))}
      </div>
    );
  }
  
// ---------- Image integrity ----------
function ImageIntegrity({meta}) {
  const m = meta || { deepfake:false, has_exif:false, ocr_chars:0, faces:0 };
  const pass = m.deepfake===false && (m.has_exif || (m.ocr_chars??0)>10 || (m.faces??0)>0);
  const label = pass ? "pass" : "warn";
  const cls = "px-2 py-0.5 rounded-full text-[11px] border " + (pass
    ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
    : "bg-amber-500/10 text-amber-300 border-amber-500/30");
  return (
    <>
      <div className="flex items-center justify-between">
        <div>Integrity: <span className={cls}>{label}</span></div>
        <div>Deepfake: <b>{m.deepfake===false?"no":"possible"}</b></div>
      </div>
      <div className="h-px bg-white/10 my-2" />
      <div className="text-gray-400 text-sm">
        EXIF: {m.has_exif?"present":"missing"} • OCR chars: {m.ocr_chars||0} • Faces: {m.faces||0}
      </div>
    </>
  );
}

// ---------- Combiner (no author for now) ----------
function combine(modelScore, integrityPass){
  const imgScore = integrityPass ? 80 : 55;
  const model    = Number.isFinite(+modelScore) ? +modelScore : 60;
  return Math.round(0.7*model + 0.3*imgScore);
}

// ---- tiny SWR-style cache (query -> items) ----
const SRC_CACHE = new Map();

function deriveQuery(result, claim) {
  const q = (claim || result?.caption_norm || result?.caption_raw || "").trim();
  return q.slice(0, 240);
}

async function fetchSources(q, signal) {
  if (!q) return [];
  // Retry x2 (total 3 tries) with short backoff
  let attempt = 0, lastErr;
  while (attempt < 3) {
    try {
      const url = `${API_BASE}/api/sources/?q=${encodeURIComponent(q)}`;
      const r = await fetch(url, { signal });
      const data = await r.json().catch(() => ([]));
      const items = Array.isArray(data) ? data : (data.items || []);
      return items;
    } catch (e) {
      lastErr = e;
      await new Promise(r => setTimeout(r, 250 * (attempt+1)));
      attempt++;
    }
  }
  throw lastErr || new Error("fetch failed");
}

// --- helpers to read scores safely ---
function getModelScore(r) {
    const cands = [r?.score, r?.model_score, r?.model?.score, r?.verdict?.score];
    const hit = cands.find(v => Number.isFinite(+v));
    return hit != null ? +hit : null; // null if we truly don't have one
  }
  
  function getIntegrity(meta) {
    if (!meta) return null; // unknown → neutral later
    const deepfake = meta.deepfake;
    const exif = !!meta.has_exif;
    const ocr = Number(meta.ocr_chars) || 0;
    const faces = Number(meta.faces) || 0;
  
    // If explicitly deepfake=true, fail fast
    if (deepfake === true) return false;
  
    // Strong positive signals
    if (deepfake === false && (exif || ocr > 10 || faces > 0)) return true;
  
    // Some signals but not certain
    if (exif || ocr > 10 || faces > 0) return "weak";
  
    // No signals either way
    return null;
  }
  
  function mapIntegrityToImgScore(integrity) {
    // tune these numbers if you like
    if (integrity === true) return 80;
    if (integrity === "weak") return 70;
    if (integrity === false) return 55;
    return 65; // null/unknown → neutral, avoids constant 59
  }
  
  function combineScores(modelScore, imgScore, wModel = 0.7) {
    const m = Number.isFinite(modelScore) ? modelScore : 60; // still keep a fallback
    return Math.round(wModel * m + (1 - wModel) * imgScore);
  }
  

export default function RubricPanels({ result, claim }) {
  const [sources, setSources]   = useState(result?.evidence || []);
  const [fetching, setFetching] = useState(false);
  const modelScore   = getModelScore(result);
  // image integrity + final score
  const integrityPass = (result?.image_checks?.deepfake===false) ||
                        (result?.image_checks?.has_exif) ||
                        ((result?.image_checks?.ocr_chars||0)>10);
  const integrity    = getIntegrity(result?.image_checks);
  const imgScore     = mapIntegrityToImgScore(integrity);
  const final        = combineScores(modelScore, imgScore, 0.7);

  console.debug("Verdict inputs", { modelScore, integrity, imgScore, final });


  // derive normalized query whenever inputs change
  const query = useMemo(() => deriveQuery(result, claim), [result, claim]);

  // keep sources from backend payload immediately
  useEffect(() => {
    setSources(result?.evidence || []);
  }, [result]);

  // SWR: if query changes, show cached immediately (if present), then refresh
  const inflight = useRef(null);

  useEffect(() => {
    if (!query) return;

    // show cached first (if any)
    if (SRC_CACHE.has(query)) {
      setSources(SRC_CACHE.get(query));
    }

    // abort any previous
    inflight.current?.abort?.();
    const ctrl = new AbortController();
    inflight.current = ctrl;

    (async () => {
      try {
        setFetching(true);
        const items = await fetchSources(query, ctrl.signal);
        SRC_CACHE.set(query, items);
        setSources(items);
      } catch (_e) {
        // if network fails and we had nothing, keep whatever we had (backend or cache)
      } finally {
        if (!ctrl.signal.aborted) setFetching(false);
      }
    })();

    return () => ctrl.abort();
  }, [query]);

  // manual refresh button reuses same flow
  async function refetch(){
    if (!query) return;
    inflight.current?.abort?.();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    try{
      setFetching(true);
      const items = await fetchSources(query, ctrl.signal);
      SRC_CACHE.set(query, items);
      setSources(items);
    }catch(_){
      /* silent for demo */
    }finally{
      if (!ctrl.signal.aborted) setFetching(false);
    }
  }

  return (
    <div className="grid gap-3 min-w-0">

      {/* Verdict header */}
        <div className="rounded-lg bg-gray-800 border border-gray-700 p-3 min-w-0 overflow-hidden">        <div className="flex items-center justify-between">
          <div className="text-white font-semibold">Verdict</div>
          <div className={`text-lg font-bold ${scoreColor(final)}`}>
            {final}/100 <span className="text-gray-300 text-sm ml-1">({bandLabel(final)})</span>
          </div>
        </div>
        <p className="mt-1 text-xs text-gray-400">
          Combined from model score + image integrity (no author factor in this demo).
        </p>
      </div>

    {/* Evidence */}
    <div className="rounded-lg bg-gray-800 border border-gray-700 p-3 min-w-0 overflow-hidden">
      <Evidence items={sources} onRefetch={refetch} fetching={fetching} />
    </div>

    {/* Image integrity */}
    <div className="rounded-lg bg-gray-800 border border-gray-700 p-3 min-w-0 overflow-hidden">
      <div className="font-semibold text-white mb-2">Image integrity</div>
      <ImageIntegrity meta={result?.image_checks} />
    </div>
    </div>
  );
}
