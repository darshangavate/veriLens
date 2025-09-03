import os, requests, json
from rest_framework.decorators import api_view
from rest_framework.response import Response

API_KEY = os.getenv("GEMINI_API_KEY") or "AIzaSyCQG6_35SWD9t2Hz0Wh-hATJpj-rPvuGpg"
BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
MODEL_NAME = "gemini-2.5-pro"

def clean_json(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
    return text.strip()

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
        try: return json.loads(clean_json(raw))
        except: return {"type": "unknown", "reason": raw}
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
        try: return json.loads(clean_json(raw))
        except: return {"score": None, "explanation": raw}
    return {"score": None, "explanation": r.text}

@api_view(["POST"])
def analyze(request):
    text = request.data.get("statement", "")
    if not text:
        return Response({"error": "No text"}, status=400)
    classification = classify_post(text)
    response = {"type": classification["type"], "reason": classification["reason"]}
    if classification["type"] == "claim":
        response.update(fact_check(text))
    return Response(response)
