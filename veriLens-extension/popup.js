const $ = (s)=>document.querySelector(s);

const scoreCard = $("#score-card");
const empty     = $("#empty");
const scoreVal  = $("#score-val");
const scoreLabel= $("#score-label");
const typeBadge = $("#type-badge");
const reasonEl  = $("#reason");
const detailsEl = $("#details");
const explEl    = $("#explanation");
const postMeta  = $("#post-meta");

document.getElementById("analyze-page").addEventListener("click", () => {
  chrome.tabs.query({active:true,currentWindow:true}, tabs => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: () => window.dispatchEvent(new CustomEvent("verilens-analyze-all"))
    });
    window.close(); // optional: close popup after triggering
  });
});

init();

async function init(){
  // Pull the latest result the content script saved
  const { lastResult } = await chrome.storage.local.get("lastResult");
  if (!lastResult) {
    showEmpty();
    return;
  }
  render(lastResult);
}

function render(res){
  empty.hidden = true;
  scoreCard.hidden = false;

  // score prominence
  const score = Number(res.score ?? 0);
  scoreVal.textContent = Number.isFinite(score) ? score : "—";

  // ring color & fill fraction
  const deg = Math.max(0, Math.min(100, score)) * 3.6;
  const ring = scoreCard.querySelector(".score-ring");
  ring.classList.remove("ring-green","ring-yellow","ring-red");
  ring.style.setProperty("--deg", `${deg}deg`);
  if (score >= 80) ring.classList.add("ring-green");
  else if (score >= 50) ring.classList.add("ring-yellow");
  else ring.classList.add("ring-red");

  // meta
  typeBadge.textContent = res.type ? res.type : "unknown";
  reasonEl.textContent  = res.reason || "";

  // explanation (only for claim)
  if (res.type === "claim" && res.explanation){
    let text = res.explanation;
    try { text = JSON.stringify(JSON.parse(text), null, 2); } catch {}
    explEl.textContent = text;
    detailsEl.hidden = false;
  } else {
    detailsEl.hidden = true;
  }

  // post origin/time if present
  const when = res.ts ? new Date(res.ts).toLocaleString() : "";
  postMeta.textContent = `${res.url ? new URL(res.url).hostname : ""} ${when}`.trim();
}

function showEmpty(){
  empty.hidden = false;
  scoreCard.hidden = true;
}
