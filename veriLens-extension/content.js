// veriLens — content script (button-triggered analysis + smart text extraction + caching)

console.log("[veriLens] content script loaded");

const SELECTOR = "article, [role='article']";          // posts on most socials
const VL_ATTR  = "data-verilens";                      // mark our injected nodes
const CACHE    = new Map();                            // key -> result (avoid repeat calls)
const seen     = new WeakSet();

// optional: popup can broadcast "analyze all visible posts"
window.addEventListener("verilens-analyze-all", () => {
  document.querySelectorAll(SELECTOR).forEach(analyzeElement);
});

// observe dynamic feed changes
const observer = new MutationObserver(scan);
observer.observe(document.documentElement, { childList: true, subtree: true });
scan();

// ---------- scan & wire each post ----------
function scan() {
  document.querySelectorAll(SELECTOR).forEach((el) => {
    if (seen.has(el)) return;
    seen.add(el);

    addAnalyzeButton(el, () => analyzeElement(el));
  });
}

// ---------- UI helpers ----------
function make(tag, className, html) {
  const n = document.createElement(tag);
  n.setAttribute(VL_ATTR, "1");        // so we can ignore during extraction
  n.setAttribute("aria-hidden", "true");
  if (className) n.className = className;
  if (html != null) n.innerHTML = html;
  return n;
}

function addAnalyzeButton(container, onClick) {
  let btn = container.querySelector(":scope .verilens-btn");
  if (btn) return btn;
  btn = make("button", "verilens-btn", "Analyze");
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  container.style.position ||= "relative";
  container.appendChild(btn);
  return btn;
}

function ensureTip(container) {
  let tip = container.querySelector(":scope .verilens-tip");
  if (tip) return tip;
  tip = make("div", "verilens-tip", `<div class="vl-body">Pending analysis…</div>`);
  container.appendChild(tip);
  return tip;
}

function setTip(tip, html) {
  tip.querySelector(".vl-body").innerHTML = html;
}

// ---------- main analyze flow ----------
async function analyzeElement(el) {
  const tip = ensureTip(el);
  setTip(tip, "Analyzing…");

  // prefer caption/description; fall back to image OCR only if needed
  const text = getPostText(el);
  const key  = text && text.length >= 30 ? `text:${hash(text)}` : `img:${getFirstImage(el) || "none"}`;

  // cache hit?
  if (CACHE.has(key)) {
    setTip(tip, renderResult(CACHE.get(key)));
    return;
  }

  let result;
  try {
    if (text && text.length >= 30) {
      result = await chrome.runtime.sendMessage({ type: "ANALYZE_TEXT", text });
    } else {
      const imgUrl = getFirstImage(el);
      if (!imgUrl) {
        setTip(tip, "No text or image found.");
        return;
      }
      // backend should support image_url; if not, switch background to blob upload
      result = await chrome.runtime.sendMessage({ type: "ANALYZE_IMAGE_URL", imageUrl: imgUrl });
    }
  } catch (err) {
    setTip(tip, "Extension messaging failed.");
    return;
  }

  if (result?.error) {
    setTip(tip, "Error: " + escapeHtml(result.error));
    return;
  }

  CACHE.set(key, result);
  setTip(tip, renderResult(result));
}

// ---------- render ----------
function renderResult(res) {
  const score = Number.isFinite(Number(res.score)) ? Number(res.score) : null;
  const type  = res.type || "unknown";
  const reason = res.reason || "";
  let expl = res.explanation || "";

  // pretty explanation (keep JSON pretty if it is JSON)
  try { expl = JSON.stringify(JSON.parse(expl), null, 2); } catch {}

  const scoreClass =
    score == null ? "score-none"
    : score >= 80 ? "score-green"
    : score >= 50 ? "score-yellow"
    : "score-red";

  return `
    <div class="vl-head">
      <div class="vl-type"><b>Type:</b> ${escapeHtml(type)}</div>
      <div class="vl-score ${scoreClass}">
        <span class="vl-score-label">Credibility:</span>
        <span class="vl-score-val">${score != null ? score : "—"}/100</span>
      </div>
    </div>

    ${reason ? `<div class="vl-reason">${escapeHtml(reason)}</div>` : ""}

    ${type === "claim" && expl
      ? `<div class="vl-expl-panel"><pre class="vl-expl">${escapeHtml(expl)}</pre></div>`
      : ""
    }
  `;
}


// ---------- text extraction (smart, ignores our UI) ----------
function getPostText(root) {
  // work on a clone so we can strip without touching the page
  const clone = root.cloneNode(true);

  // remove our injected nodes and non-content elements
  clone.querySelectorAll(`[${VL_ATTR}],script,style,noscript`).forEach(n => n.remove());

  // per-site heuristics: try likely caption areas first
  const candidates = [];

  // Instagram (varies a lot)
  candidates.push(...clone.querySelectorAll(
    [
      "header ~ div span",                 // common caption text
      "ul li div div span",                // alt path via list layout
      "[data-testid='post-caption']",
      "[data-testid='post-comment-root'] span"
    ].join(",")
  ));

  // Twitter/X
  candidates.push(...clone.querySelectorAll(
    "div[data-testid='tweetText'], [data-testid='tweet'] div[lang]"
  ));

  // Facebook
  candidates.push(...clone.querySelectorAll(
    "div[role='article'] [data-ad-preview='message'], div[role='article'] div[dir='auto'] span"
  ));

  // pick biggest plausible block (length-based; filters UI noise)
  let best = "";
  const seen = new Set();

  function pushText(t) {
    if (!t) return;
    const s = normalizeText(t);
    if (s.length < 20) return;       // too short for a claim/caption
    if (isNoise(s)) return;          // filters "Analyze", "Analyzing…"
    if (seen.has(s)) return;
    seen.add(s);
    if (s.length > best.length) best = s;
  }

  candidates.forEach(el => pushText(el.innerText));
  if (!best) pushText(clone.innerText);   // final fallback after cleanup

  return best.trim();
}

function normalizeText(s) {
  return s.replace(/\s+/g, " ").trim();
}

function isNoise(s) {
  // ignore our button/tooltip text or generic short labels
  return /^analy[sz]e(\s|$)/i.test(s) ||
         /^analy[sz]ing/i.test(s)     ||
         /^pending analysis/i.test(s);
}

// ---------- other helpers ----------
function getFirstImage(el) {
  const img = el.querySelector("img");
  return img?.currentSrc || img?.src || null;
}

function escapeHtml(s) {
  return String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// tiny non-crypto hash to cache text keys
function hash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
