const DEBUG = true;

async function igExpandMore(root) {
  // read baseline caption length
  const before = (extractIgCaption(root) || "").length;

  // click all likely "more" buttons inside this post
  const btns = Array.from(root.querySelectorAll('div[role="button"], button, a'))
    .filter(b => /\b(see more|show more|more|…\s*more)\b/i.test((b.innerText || "").trim()));
  btns.forEach(b => b.click());

  // if no buttons, nothing to expand => complete
  if (!btns.length) return true;

  // wait up to ~600ms for the caption to grow
  const t0 = Date.now();
  let grown = false;
  while (Date.now() - t0 < 600) {
    await new Promise(r => setTimeout(r, 120));
    const after = (extractIgCaption(root) || "").length;
    if (after > before) { grown = true; break; }
  }

  // also consider case where the button disappeared
  const anyMoreLeft = Array.from(root.querySelectorAll('div[role="button"], button, a'))
    .some(b => /\b(see more|show more|more|…\s*more)\b/i.test((b.innerText || "").trim()));

  return grown || !anyMoreLeft;
}




function getPostIds(root) {
  // canonical post URL/id
  const link = root.querySelector("a[href*='/p/'], a[href*='/reel/']");
  let url = link?.href || null;
  if (url) {
    const m = url.match(/https?:\/\/[^/]+\/(p|reel)\/([^/?#]+)/);
    if (m) url = `https://www.instagram.com/${m[1]}/${m[2]}/`;
  }
  const m2 = url ? url.match(/\/(p|reel)\/([^\/?#]+)/) : null;
  const post_id = m2 ? m2[2] : null;

  let owner_id = null;

  // a) clean "/username/" link in header
  const headerLinks = Array.from(root.querySelectorAll("header a[href^='/']"));
  const ownerLink = headerLinks.find(a => /^\/(?!p\/|reel\/)[A-Za-z0-9._]+\/?$/.test(a.getAttribute("href") || ""));
  if (ownerLink) {
    owner_id = (ownerLink.getAttribute("href") || "").replace(/\//g, "");
  }

  // b) role/link variant near header (some skins)
  if (!owner_id) {
    const a = root.querySelector("header [role='link'][href^='/']:not([href*='/p/']):not([href*='/reel/'])");
    if (a) owner_id = (a.getAttribute("href") || "").replace(/\//g, "");
  }

  // c) generic in-post username link (first non-post link)
  if (!owner_id) {
    const a = root.querySelector("a[href^='/']:not([href*='/p/']):not([href*='/reel/'])");
    if (a) owner_id = (a.getAttribute("href") || "").replace(/\//g, "");
  }

  // d) avatar alt text "<name>'s profile picture"
  if (!owner_id) {
    const avatar = root.querySelector("header img[alt$=\"'s profile picture\"], header img[alt$='’s profile picture']");
    const alt = avatar?.getAttribute("alt") || "";
    const mm = alt.match(/^(.+?)['’]s profile picture$/i);
    if (mm) owner_id = mm[1].replace(/\s+/g, "");
  }

  return { url, post_id, owner_id };
}




function getAllImages(root) {
  const imgs = Array.from(root.querySelectorAll("img"))
  .filter(img =>
    !img.closest(`[${VL_ATTR}]`) &&
    !(img.alt && /profile picture$/i.test(img.alt)) &&
    (img.naturalWidth >= 180 && img.naturalHeight >= 120)
  );


  return imgs.map((img, idx) => {
    const url = img.currentSrc || img.src || null;
    return {
      idx,
      type: "image",
      url,
      w: img.naturalWidth || img.width || null,
      h: img.naturalHeight || img.height || null,
      hash_pseudo: url ? hash(url) : null,
      is_seen: !!img.complete
    };
  });
}

function hasMoreIn(root) {
  return !!Array.from(root.querySelectorAll("button, a"))
    .find(b => /^(more|…\s*more)$/i.test((b.innerText || "").trim()));
}


function normalizeCaption(text) {
  if (!text) return { raw: "", norm: "", len: 0 };
  const raw = text;
  // keep emojis/mentions/hashtags but collapse whitespace
  const norm = raw.replace(/\s+/g, " ").trim();
  return { raw, norm, len: norm.length };
}

function buildCaptureId({ post_id, media }) {
  // stable id: post_id if present, else hash of image urls
  if (post_id) return `ig:${post_id}`;
  const key = media.map(m => m.url).join("|");
  return `ig:anon:${hash(key)}`;
}


async function extractPostPayload(el) {
  // try expand “more” (best effort)
const expandedOk = await igExpandMore(el);

  const caption = getPostText(el);
  const { raw, norm, len } = normalizeCaption(caption);
  const ids = getPostIds(el);
  const media = getAllImages(el);

  const hasVideo = !!el.querySelector("video");
  const payload = {
    capture_id: null,               // fill below
    platform: "instagram",
    url: ids.url,
    post_id: ids.post_id,
    owner_id: ids.owner_id,
    caption_raw: raw,
    caption_norm: norm,
    caption_len: len,
    caption_complete: expandedOk,
    caption_lang: null,             // optional: add a detector later
    media,
    image_count: media.length,
    has_video: hasVideo,
    partial_capture: media.length === 0,
    ts_captured: Date.now()
  };

  payload.capture_id = buildCaptureId(payload);
  return payload;
}



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
  if (tag !== "button" && tag !== "a" && tag !== "input") {
  n.setAttribute("aria-hidden", "true");
  }
  if (className) n.className = className;
  if (html != null) n.innerHTML = html;
  return n;
}

function addAnalyzeButton(container, onClick) {
  let btn = container.querySelector(":scope .verilens-btn");
  if (btn) return btn;
btn = make("button", "verilens-btn", "Analyze");
btn.type = "button";
btn.setAttribute("aria-label", "Analyze with veriLens");
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
  tip.setAttribute("role", "status");
tip.setAttribute("aria-live", "polite");

  container.appendChild(tip);
  return tip;
}

function setTip(tip, html) {
  tip.querySelector(".vl-body").innerHTML = html;
}

// ---------- main analyze flow ----------
async function analyzeElement(el) {
  const tip = ensureTip(el);
  setTip(tip, "Capturing…");

  const payload = await extractPostPayload(el);

  if (DEBUG) {
console.groupCollapsed(`[veriLens] extraction ${payload.capture_id}`);
console.log({
  url: payload.url,
  post_id: payload.post_id,
  owner_id: payload.owner_id,
  caption_len: payload.caption_len,
  caption_complete: payload.caption_complete,
  caption_preview:  payload.caption_norm,
});
if (payload.media?.length) console.table(payload.media);
console.groupEnd();

  }

  // show a quick summary in-UI for now
  setTip(tip, `
    <div><b>Captured:</b> ${payload.image_count} image(s)${payload.has_video ? " + video" : ""}</div>
    <div><b>Caption:</b> ${payload.caption_len} chars (${payload.caption_complete ? "complete" : "possibly truncated"})</div>
  `);

    // ---------- send to backend ----------
  try {
    const resp = await fetch("http://localhost:8000/api/analyze/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    if (DEBUG) {
      console.log("[veriLens] backend response:", data);
    }

    // Render backend result in the tooltip
    const html = renderResult(data);
    setTip(tip, html);

  } catch (err) {
    console.error("[veriLens] backend error:", err);
    setTip(tip, `<div class="vl-body">⚠️ Error: ${escapeHtml(err.message)}</div>`);
  }

  // (We can re-enable backend calls later.)
  return;
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

function stripIgUiNoise(text) {
  if (!text) return "";
  let s = text;

  // remove common chrome around posts
  s = s.replace(/\b(Verified|More Options)\b/gi, "");
  s = s.replace(/\b(Like|Comment|Share|Save)\b/gi, "");
  s = s.replace(/\bView all\s+\d+\s+comments?\b/gi, "");
  s = s.replace(/\b\d[\d,.\s]*\blikes\b/gi, "");
  s = s.replace(/\s{2,}/g, " ");
  // trailing “… more” / “see more” / “more”
s = s.replace(/\s*(?:…\s*more|\bsee more\b|\bshow more\b|\bmore\b)\s*$/i, "");
s = s.replace(/\bSee translation\b/gi, "");
s = s.replace(/^\s*[@#][\w._-]+\s*$/gim, "");


  return s.trim();
}

function extractIgCaption(root) {
  // caption spans tend to be near header and have dir="auto"
  const spans = Array.from(root.querySelectorAll(
    [
      "[data-testid='post-caption'] span[dir='auto']",
      "ul li div div span[dir='auto']",
      "header ~ div span[dir='auto']",
      "article span[dir='auto']",
      // extra: many layouts put caption here, right after username block
      "header + div span[dir='auto']"
    ].join(",")
  )).filter(el =>
    !el.closest(`[${VL_ATTR}]`) &&
    !el.closest("button, a")
  );

  let best = "";
  for (const el of spans) {
    let t = stripIgUiNoise(el.innerText || "");
    // ignore pure UI or hashtags-only lines
    if (!t) continue;
    if (/^[@#][\w._-]+$/.test(t)) continue;
    if (/\b(likes?|view all \d+ comments?)\b/i.test(t)) continue;

    // accept short but meaningful captions (≥ 6 chars)
    if (t.length >= 6 && t.length > best.length) best = t;

    // stop early if we got a decent chunk
    if (best.length >= 90) break;
  }
  return best;
}


// ---------- text extraction (smart, ignores our UI) ----------
function getPostText(root) {
  // If this looks like an IG post, try the IG-specific path first.
  const looksIG = !!root.querySelector("a[href*='/p/'], a[href*='/reel/']");
  if (looksIG) {
    const t = extractIgCaption(root);
    if (t) return t;
  }

  // Fallback: generic cross-site extraction (your original approach).
  const clone = root.cloneNode(true);
  clone.querySelectorAll(`[${VL_ATTR}],script,style,noscript`).forEach(n => n.remove());

  const candidates = [];
  candidates.push(...clone.querySelectorAll(
    [
      "header ~ div span",
      "ul li div div span",
      "[data-testid='post-caption']",
      "[data-testid='post-comment-root'] span"
    ].join(",")
  ));
  candidates.push(...clone.querySelectorAll("div[data-testid='tweetText'], [data-testid='tweet'] div[lang]"));
  candidates.push(...clone.querySelectorAll("div[role='article'] [data-ad-preview='message'], div[role='article'] div[dir='auto'] span"));

  let best = "";
  const seen = new Set();
  function pushText(t) {
    if (!t) return;
    const s = normalizeText(stripIgUiNoise(t));
    if (s.length < 20) return;
    if (isNoise(s)) return;
    if (seen.has(s)) return;
    seen.add(s);
    if (s.length > best.length) best = s;
  }
  candidates.forEach(el => pushText(el.innerText));
  if (!best) pushText(clone.innerText);

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
