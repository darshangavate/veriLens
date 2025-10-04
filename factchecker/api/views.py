import os, requests, json
import pytesseract
from PIL import Image
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
from rest_framework.decorators import api_view
from rest_framework.response import Response

# tell pytesseract where the exe is
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

API_KEY = os.getenv("GEMINI_API_KEY") or "AIzaSyDIC-3dJA7VcFkeSw6wm6HjGe7CtLdgwb8"
BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
MODEL_NAME = "gemini-2.5-pro"


# -------- Utility Functions --------
def clean_json(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    return text.strip()

def extract_text_from_image(file) -> str:
    """Extract text from uploaded image using Tesseract OCR"""
    path = default_storage.save("temp_upload.png", ContentFile(file.read()))
    img = Image.open(default_storage.path(path))
    text = pytesseract.image_to_string(img)
    default_storage.delete(path)  # cleanup temp file
    return text.strip()


# -------- Gemini API Wrappers --------
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
Evaluate this statement:
\"{statement}\"

Return JSON: {{"score": <0-100>, "explanation": "<short reasoning>"}}
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
            return {"score": None, "explanation": raw}
    return {"score": None, "explanation": r.text}


# -------- API Endpoint --------
@api_view(["POST"])
def analyze(request):
    text = request.data.get("statement", "")

    # 🆕 If no text, check for uploaded image
    if not text and "image" in request.FILES:
        try:
            text = extract_text_from_image(request.FILES["image"])
        except Exception as e:
            return Response({"error": f"OCR failed: {str(e)}"}, status=400)

    if not text:
        return Response({"error": "No input provided"}, status=400)

    classification = classify_post(text)
    response = {"type": classification["type"], "reason": classification["reason"]}
    if classification["type"] == "claim":
        response.update(fact_check(text))
    return Response(response)
