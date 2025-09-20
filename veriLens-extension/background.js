// veriLens background – bridges content <-> backend
const API_ANALYZE = "http://127.0.0.1:8000/api/analyze/";
const API_EXTRACT = "http://127.0.0.1:8000/api/extract_text/"; // NEW

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "ANALYZE_TEXT") {
    analyzeText(msg.text).then(sendResponse);
    return true;
  }
  if (msg?.type === "ANALYZE_IMAGE_URL") {
    analyzeImageUrl(msg.imageUrl).then(sendResponse);
    return true;
  }
  if (msg?.type === "OCR_IMAGE_URL") {          // NEW: get OCR text only
    ocrImageUrl(msg.imageUrl).then(sendResponse);
    return true;
  }
});

async function analyzeText(text) {
  try {
    const fd = new FormData();
    fd.append("statement", text);
    const r = await fetch(API_ANALYZE, { method: "POST", body: fd });
    return await r.json();
  } catch (e) {
    return { error: String(e) };
  }
}

async function analyzeImageUrl(imageUrl) {
  try {
    const fd = new FormData();
    fd.append("image_url", imageUrl);
    const r = await fetch(API_ANALYZE, { method: "POST", body: fd });
    return await r.json();
  } catch (e) {
    return { error: String(e) };
  }
}

async function ocrImageUrl(imageUrl) {
  try {
    const fd = new FormData();
    fd.append("image_url", imageUrl);
    const r = await fetch(API_EXTRACT, { method: "POST", body: fd });
    return await r.json(); // { text: "..." }
  } catch (e) {
    return { error: String(e) };
  }
}
