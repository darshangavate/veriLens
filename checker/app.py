# backend.py
import os
import requests
import json
from fastapi import FastAPI
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware

API_KEY = os.getenv("GEMINI_API_KEY") or "YOUR_API_KEY"
BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
MODEL_NAME = "gemini-2.5-pro"

app = FastAPI()

# Allow React frontend to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # in dev, allow all
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PostInput(BaseModel):
    text: str

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
Classify this Instagram post into one of the categories:
- claim
- question
- meme/sarcasm

Post: "{text}"

Return strictly in JSON:
{{"type": "<claim|question|meme/sarcasm>", "reason": "<short explanation>"}}
"""
            }]
        }]
    }

    endpoint = f"{BASE_URL}/models/{MODEL_NAME}:generateContent?key={API_KEY}"
    resp = requests.post(endpoint, headers={"Content-Type": "application/json"}, json=payload)

    if resp.ok:
        try:
            raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
            return json.loads(clean_json(raw))
        except Exception as e:
            return {"type": "unknown", "reason": f"Parse error: {e}"}
    return {"type": "error", "reason": resp.text}

def fact_check(statement: str) -> dict:
    payload = {
        "contents": [{
            "parts": [{
                "text": f"""
Evaluate the truthfulness of this statement:
\"{statement}\"

Return strictly in JSON:
{{"score": <0–100>, "explanation": "<short reasoning>"}}
"""
            }]
        }]
    }

    endpoint = f"{BASE_URL}/models/{MODEL_NAME}:generateContent?key={API_KEY}"
    resp = requests.post(endpoint, headers={"Content-Type": "application/json"}, json=payload)

    if resp.ok:
        try:
            raw = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
            return json.loads(clean_json(raw))
        except Exception as e:
            return {"score": None, "explanation": f"Parse error: {e}"}
    return {"score": None, "explanation": resp.text}

@app.post("/analyze")
def analyze_post(post: PostInput):
    classification = classify_post(post.text)
    response = {"type": classification["type"], "reason": classification["reason"]}

    if classification["type"] == "claim":
        fc = fact_check(post.text)
        response.update(fc)

    return response
