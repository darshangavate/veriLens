# views.py
import os, requests, json
import pytesseract
from PIL import Image
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from rest_framework.decorators import api_view
from rest_framework.response import Response
from io import BytesIO
import time

pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

API_KEY = os.getenv("GEMINI_API_KEY") or "AIzaSyAtC6HhN5ni2UH-3kqpPrtnhVn2Qtr4ToY"
BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
MODEL_NAME = "gemini-2.5-pro"

def clean_json(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    return text.strip()

def extract_text_from_image(file) -> str:
    path = default_storage.save("temp_upload.png", ContentFile(file.read()))
    img = Image.open(default_storage.path(path))
    text = pytesseract.image_to_string(img)
    default_storage.delete(path)
    return text.strip()

def extract_text_from_url(image_url: str) -> str:
    """NEW: OCR by URL (backend fetches the image)."""
    r = requests.get(image_url, timeout=10)
    r.raise_for_status()
    img = Image.open(BytesIO(r.content))
    return pytesseract.image_to_string(img).strip()

@api_view(["POST"])
def extract_text(request):
    image_url = request.data.get("image_url")
    if "image" in request.FILES:
        try:
            return Response({"text": extract_text_from_image(request.FILES["image"])})
        except Exception as e:
            return Response({"error": str(e)}, status=400)
    if image_url:
        try:
            return Response({"text": extract_text_from_url(image_url)})
        except Exception as e:
            return Response({"error": str(e)}, status=400)
    return Response({"error": "No image or image_url provided"}, status=400)

def classify_post(text: str) -> dict:
    payload = {
        "contents": [{
            "parts": [{
                "text": f"""
Classify this Instagram post into:
- claim
- question
- meme/sarcasm

Post: "{text}"

Return JSON: {{"type": "<claim|question|meme/sarcasm>", "reason": "<short explanation>"}}
"""
            }]
        }]
    }
    endpoint = f"{BASE_URL}/models/{MODEL_NAME}:generateContent?key={API_KEY}"
    r = requests.post(endpoint, headers={"Content-Type": "application/json"}, json=payload)
    if r.ok:
        raw = r.json()["candidates"][0]["content"]["parts"][0]["text"]
        try:
            return json.loads(clean_json(raw))
        except:
            return {"type": "unknown", "reason": raw}
    return {"type": "error", "reason": r.text}

def fact_check(statement: str) -> dict:
    payload = {
        "contents": [{
            "parts": [{
                "text": f"""
Evaluate this statement factually and give a confidence score.

Statement: \"{statement}\"

Return JSON strictly in this format:
{{
  "score": <0-100>,
  "explanation": "<short reasoning>"
}}
"""
            }]
        }]
    }
    endpoint = f"{BASE_URL}/models/{MODEL_NAME}:generateContent?key={API_KEY}"
    try:
        for _ in range(2):
            r = requests.post(endpoint, headers={"Content-Type": "application/json"}, json=payload)
            if r.ok:
                break
            if r.status_code == 503:
                time.sleep(2)
        else:
            return {"score": None, "explanation": "Gemini temporarily overloaded. Please retry."}
        raw = r.json()["candidates"][0]["content"]["parts"][0]["text"]
        try:
            return json.loads(clean_json(raw))
        except:
            return {"score": None, "explanation": f"Failed to parse model response: {raw}"}
    except Exception as e:
        return {"score": None, "explanation": f"Request error: {e}"}

@api_view(["POST"])
def analyze(request):
    # Text from various fields (JSON)
    text = (
        request.data.get("statement")
        or request.data.get("caption_norm")
        or request.data.get("caption_raw")
        or ""
    )

    # Pull image_url if provided directly, or from media[0].url
    image_url = request.data.get("image_url")
    if not image_url:
        try:
            media = request.data.get("media") or []
            if isinstance(media, list) and media and isinstance(media[0], dict):
                image_url = media[0].get("url")
        except Exception:
            image_url = None

    # Flags from JSON (optional)
    force_ocr = bool(request.data.get("force_ocr"))
    ocr_hint = request.data.get("ocr_hint")

    # 1) If no text, try OCR from upload OR URL
    if not text:
        if "image" in request.FILES:
            try:
                text = extract_text_from_image(request.FILES["image"])
            except Exception as e:
                return Response({"error": f"OCR failed: {str(e)}"}, status=400)
        elif image_url:
            try:
                text = extract_text_from_url(image_url)
            except Exception as e:
                return Response({"error": f"OCR failed (url): {str(e)}"}, status=400)

    # 2) If short text or forced, try OCR fallback (prefer URL if present)
    if (len(text.strip()) < 60 or force_ocr) and (("image" in request.FILES) or image_url):
        try:
            ocr_text = (extract_text_from_image(request.FILES["image"])
                        if "image" in request.FILES else
                        extract_text_from_url(image_url))
            if len(ocr_text) > len(text):
                text = ocr_text
        except Exception as e:
            # soft fail — keep whatever text we had
            pass

    # 3) Final safety check
    if not text:
        return Response({"error": "No input provided"}, status=400)

    # 4) Classify + (maybe) fact check
    classification = classify_post(text)
    response = {
        "type": classification.get("type"),
        "reason": classification.get("reason"),
        "used_ocr": len(text.strip()) < 200,
        "ocr_hint": ocr_hint,
    }
    if classification.get("type") == "claim":
        response.update(fact_check(text))
    return Response(response)

# views.py
import requests
from urllib.parse import quote
from django.http import JsonResponse
from django.views.decorators.http import require_GET

CSE_KEY = "AIzaSyDNlfh8PbAF10dukHMnhzwM-gGCKGe3zg4"
CSE_ID  = "30a38ecb891f74503"  # restrict to news, fact-checkers if you like

@require_GET
def sources(request):
    q = request.GET.get("q","").strip()
    items = []

    # 1) Wikipedia
    try:
        w = requests.get(f"https://en.wikipedia.org/w/api.php?action=opensearch&format=json&search={quote(q)}", timeout=5).json()
        if len(w)>=4 and w[3]:
            items.append({"title":"Wikipedia: "+w[1][0], "url": w[3][0], "match":"med"})
    except: pass

    # 2) Fact-checkers via CSE (or Bing)
    try:
        r = requests.get(
            "https://www.googleapis.com/customsearch/v1",
            params={"key": CSE_KEY, "cx": CSE_ID, "q": q},
            timeout=6
        ).json()
        for it in (r.get("items") or [])[:5]:
            url = it.get("link"); title = it.get("title")
            host = requests.utils.urlparse(url).netloc
            level = "high" if any(host.endswith(t) for t in ["politifact.com","snopes.com","apnews.com","factcheck.org",".gov",".edu"]) else "med"
            items.append({"title": title, "url": url, "match": level})
    except: pass

    # Ensure unique & capped
    seen=set(); dedup=[]
    for it in items:
        if it["url"] in seen: continue
        seen.add(it["url"]); dedup.append(it)
        if len(dedup)>=6: break

    return JsonResponse(dedup, safe=False)
