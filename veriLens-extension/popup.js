// ===== DOM =====
const $ = (s) => document.querySelector(s);

const scoreCard  = $("#score-card");
const empty      = $("#empty");
const scoreVal   = $("#score-val");
const scoreLabel = $("#score-label");
const typeBadge  = $("#type-badge");
const reasonEl   = $("#reason");
const detailsEl  = $("#details");
const explEl     = $("#explanation");
const postMeta   = $("#post-meta");
const copyBtn    = $("#copy-expl");
const analyzeBtn = $("#analyze-page");

// ===== Wire actions =====
analyzeBtn?.addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs?.length) return;
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => window.dispatchEvent(new CustomEvent("verilens-analyze-all")),
    });
    // optional: close popup after triggering
    window.close?.();
  });
});

copyBtn?.addEventListener("click", async () => {
  try {
    const text = explEl?.textContent || "";
    await navigator.clipboard.writeText(text);
    const old = copyBtn.textContent;
    copyBtn.textContent = "Copied!";
    setTimeout(() => (copyBtn.textContent = old), 1200);
  } catch {
    alert("Copy failed");
  }
});

// ===== Init =====
init();

async function init() {
  // Label (in case markup changes)
  scoreLabel.textContent = "Credibility";

  // Pull the latest result the content script saved
  const { lastResult } = await chrome.storage.local.get("lastResult");
  if (!lastResult) {
    showEmpty();
    return;
  }
  render(lastResult);
}

// ===== Rendering =====
function render(res) {
  empty.hidden = true;
  scoreCard.hidden = false;

  // --- score value + ring ---
  const score = toNum(res.score, null);
  scoreVal.textContent = score == null ? "—" : String(score);

  const ring = scoreCard.querySelector(".score-ring");
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const deg = score == null ? 0 : clamp(score, 0, 100) * 3.6;

  ring.style.setProperty("--deg", `${deg}deg`);
  ring.classList.remove("ring-green", "ring-yellow", "ring-red");
  if (score == null) {
    // leave ring as track color
  } else if (score >= 80) {
    ring.classList.add("ring-green");
  } else if (score >= 50) {
    ring.classList.add("ring-yellow");
  } else {
    ring.classList.add("ring-red");
  }

  // --- type badge ---
  const type = (res.type || "unknown").toLowerCase();
  typeBadge.textContent = type;
  typeBadge.classList.remove("claim", "image", "unknown");
  if (type === "claim") typeBadge.classList.add("claim");
  else if (type === "image") typeBadge.classList.add("image");
  else typeBadge.classList.add("unknown");

  // --- reason ---
  reasonEl.textContent = res.reason || "";

  // --- explanation (claim only) ---
  if (type === "claim" && res.explanation) {
    let text = res.explanation;
    try {
      // pretty-print JSON if it is JSON
      text = JSON.stringify(JSON.parse(text), null, 2);
    } catch (_) {
      // keep as-is
    }
    explEl.textContent = text;
    detailsEl.hidden = false;
  } else {
    detailsEl.hidden = true;
    explEl.textContent = "";
  }

  // --- post meta (origin + time) ---
  const host = safeHost(res.url);
  const when = res.ts ? new Date(res.ts).toLocaleString() : "";
  postMeta.textContent = [host, when].filter(Boolean).join("  •  ");
}

function showEmpty() {
  empty.hidden = false;
  scoreCard.hidden = true;
}

// ===== Utils =====
function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function safeHost(url) {
  try {
    return url ? new URL(url).hostname : "";
  } catch {
    return "";
  }
}
