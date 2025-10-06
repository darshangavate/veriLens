import React, { useState, useRef, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link, NavLink } from "react-router-dom";


// ===== Links (edit these) =====
const LINKS = {
  chrome: "https://chrome.google.com/webstore/detail/TODO_CHROME_ID",   // real URL later
  firefox: "https://addons.mozilla.org/en-US/firefox/addon/TODO_SLUG",  // real URL later
  edge: "https://microsoftedge.microsoft.com/addons/detail/TODO_EDGE_ID",
  github: "https://github.com/darshangavate/veriLens",
  docs: "#",            // later: your docs site
  privacy: "#privacy",  // in-page anchor for now (or /privacy if you add routing)
  terms: "#terms",      // in-page anchor for now
};

function Contributors({ show, onClose, owner = "darshangavate", repo = "veriLens" }) {
  const [crew, setCrew] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  // Fetch contributors (and enrich a few with followers)
  React.useEffect(() => {
    if (!show) return;
    const ctrl = new AbortController();
    const run = async () => {
      setLoading(true);
      setError("");
      try {
        // 1) contributors for the repo
        const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contributors`, {
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error("Failed to fetch contributors");
        const list = await res.json();

        // 2) enrich the TOP 6 with followers (to keep it light)
        const top = list.slice(0, 6);
        const enriched = await Promise.all(
          top.map(async (c) => {
            try {
              const u = await fetch(`https://api.github.com/users/${c.login}`, { signal: ctrl.signal });
              if (!u.ok) return c;
              const ujson = await u.json();
              return { ...c, followers: ujson.followers, name: ujson.name || c.login };
            } catch {
              return c;
            }
          })
        );

        // merge enriched top back with the rest
        const rest = list.slice(6);
        setCrew([...enriched, ...rest]);
      } catch (e) {
        setError("Couldn’t load contributors right now.");
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    run();
    return () => ctrl.abort();
  }, [show, owner, repo]);

  // Close on ESC
  React.useEffect(() => {
    if (!show) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show, onClose]);

  if (!show) return null;

  // Tiny badge helper
  const badge = (n) => {
    if (n >= 50) return { label: "Core", class: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" };
    if (n >= 20) return { label: "Major", class: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" };
    if (n >= 5) return { label: "Active", class: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30" };
    return { label: "Contributor", class: "bg-gray-500/15 text-gray-300 border-gray-500/30" };
  };

  // Loading skeleton card
  const Skeleton = () => (
    <li className="flex items-center gap-4 rounded-xl border border-gray-800 bg-gray-800/50 p-4">
      <div className="w-12 h-12 rounded-full bg-gray-700 animate-pulse" />
      <div className="flex-1">
        <div className="h-3 w-32 bg-gray-700 rounded animate-pulse" />
        <div className="mt-2 h-3 w-20 bg-gray-700 rounded animate-pulse" />
      </div>
    </li>
  );

  return (
    <section
      className="fixed inset-0 z-[80] grid place-items-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => {
        // close when clicking backdrop (not the card)
        if (e.target === e.currentTarget) onClose?.();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Contributors"
    >
      <div className="w-[min(860px,92vw)] rounded-2xl bg-gradient-to-br from-gray-950 to-gray-900 border border-white/10 shadow-[0_10px_60px_rgba(0,0,0,.5)] relative">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-400" />
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
          </div>
          <h3 className="absolute left-1/2 -translate-x-1/2 text-white font-semibold">
            VeriLens Crew
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white px-2 py-1 rounded-md bg-white/5 border border-white/10"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          <p className="text-gray-400 text-sm text-center">
            Powered by <a className="text-cyan-400 hover:underline" href={`https://github.com/${owner}/${repo}`} target="_blank" rel="noreferrer">GitHub</a>.  
            Thanks to everyone who’s pushed VeriLens forward.
          </p>

          {/* States */}
          {error && (
            <div className="mt-6 text-center text-red-400">{error}</div>
          )}

          {/* Grid */}
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} />)
              : crew.map((c) => {
                  const b = badge(c.contributions || 0);
                  return (
                    <li
                      key={c.id || c.login}
                      className="group rounded-xl border border-gray-800 bg-gray-900/60 hover:bg-gray-900/80 transition p-4"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={c.avatar_url}
                          alt={c.login}
                          className="w-12 h-12 rounded-full border border-gray-700"
                          loading="lazy"
                        />
                        <div className="flex-1 min-w-0">
                          <a
                            href={c.html_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-white font-medium hover:underline truncate"
                            title={c.login}
                          >
                            {c.name || c.login}
                          </a>
                          <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                            <span className="truncate">{c.login}</span>
                            <span>•</span>
                            <span>{c.contributions ?? 0} commits</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] ${b.class}`}
                          title="Badge based on contributions"
                        >
                          {b.label}
                        </span>
                        {typeof c.followers === "number" && (
                          <span className="text-[11px] text-gray-400">
                            Followers: <span className="text-gray-300">{c.followers}</span>
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
          </ul>

          {/* Footer */}
          <div className="mt-6 flex flex-col items-center gap-2 border-t border-white/10 pt-4">
            <div className="text-xs text-gray-500 text-center">
              Want to be on this wall?{" "}
              <a
                href={`https://github.com/${owner}/${repo}`}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-400 hover:underline"
              >
                Contribute on GitHub →
              </a>
            </div>
            <div className="text-[11px] text-gray-500">
              Press <kbd className="px-1 py-0.5 bg-white/10 rounded border border-white/20">Esc</kbd> or click outside to close.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** ---------- Shared helpers ---------- */
const getScoreColor = (score) => {
  if (score >= 80) return "text-green-400";
  if (score >= 50) return "text-yellow-400";
  return "text-red-500";
};

/** ---------- Mockup panel (floating OR embedded) ---------- */
function MockupPanel({ embedded = false }) {
  const [statement, setStatement] = useState("");
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [minimized, setMinimized] = useState(false);

  // position + drag state (used only when NOT embedded)
  const [pos, setPos] = useState({ x: 24, y: 24 });
  const startRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(false);

  useEffect(() => {
    if (embedded) return;
    const handleResize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setPos((p) => ({
        x: Math.min(Math.max(12, p.x), vw - 320),
        y: Math.min(Math.max(12, p.y), vh - 420),
      }));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [embedded]);

  const onPointerDown = (e) => {
    if (embedded) return;
    draggingRef.current = true;
    const pointer = e.touches ? e.touches[0] : e;
    startRef.current = {
      x: pointer.clientX - pos.x,
      y: pointer.clientY - pos.y,
    };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("touchmove", onPointerMove, { passive: false });
    document.addEventListener("touchend", onPointerUp);
  };

  const onPointerMove = (e) => {
    if (embedded || !draggingRef.current) return;
    const pointer = e.touches ? e.touches[0] : e;
    const nx = pointer.clientX - startRef.current.x;
    const ny = pointer.clientY - startRef.current.y;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = 320;
    const height = minimized ? 56 : 420;
    const clampedX = Math.min(Math.max(8, nx), vw - width - 8);
    const clampedY = Math.min(Math.max(8, ny), vh - height - 8);
    setPos({ x: clampedX, y: clampedY });

    if (e.cancelable) e.preventDefault();
  };

  const onPointerUp = () => {
    if (embedded) return;
    draggingRef.current = false;
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("touchmove", onPointerMove);
    document.removeEventListener("touchend", onPointerUp);

    const vw = window.innerWidth;
    const leftSnap = 16;
    const rightSnap = vw - 336;
    setPos((p) => ({ x: p.x < vw / 2 ? leftSnap : rightSnap, y: p.y }));
  };

  const handleFileChange = (file) => {
    if (file) {
      setImage(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      if (statement) formData.append("statement", statement);
      if (image) formData.append("image", image);

      const response = await fetch("http://127.0.0.1:8000/api/analyze/", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error("Error:", error);
      setResult({ error: "Failed to connect to backend" });
    } finally {
      setLoading(false);
    }
  };

  const panelClasses =
    "rounded-xl bg-gray-900/80 backdrop-blur border border-gray-700 shadow-2xl";

  return (
    <div
      className={
        embedded
          ? "w-full max-w-md"
          : "fixed z-50 w-[320px] select-none"
      }
      style={embedded ? undefined : { left: pos.x, top: pos.y }}
      role="dialog"
      aria-label="VeriLens Quick Check"
    >
      {/* Header / drag handle (click-to-drag only when floating) */}
      <div
        onMouseDown={onPointerDown}
        onTouchStart={onPointerDown}
        className={`flex items-center justify-between rounded-t-xl ${panelClasses} px-3 py-2 ${
          embedded ? "" : ""
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-400" />
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
          <p className="ml-2 text-gray-200 text-sm font-medium">VeriLens</p>
        </div>
        {!embedded && (
          <button
            onClick={() => setMinimized((m) => !m)}
            className="text-xs text-gray-300 hover:text-white px-2 py-1 rounded-md bg-gray-800/70"
            aria-label={minimized ? "Expand" : "Minimize"}
          >
            {minimized ? "Expand" : "Minimize"}
          </button>
        )}
      </div>

      {/* Body */}
      {(!minimized || embedded) && (
        <div
          className={`rounded-b-xl ${panelClasses} border-t-0 p-3 ${
            embedded ? "" : ""
          }`}
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="text"
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="Enter a claim…"
              className="px-3 py-2 rounded-lg bg-gray-800 text-gray-100 border border-gray-700 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
            <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-cyan-500 rounded-lg cursor-pointer bg-gray-800/50 hover:bg-gray-800 transition">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files[0])}
              />
              {preview ? (
                <img
                  src={preview}
                  alt="Preview"
                  className="h-24 object-contain rounded-md"
                />
              ) : (
                <div className="flex flex-col items-center text-gray-400">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="w-8 h-8 mb-1 text-cyan-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7 16V4m10 12V4m-5 8V4"
                    />
                  </svg>
                  <p className="text-xs">Click to upload or drag & drop</p>
                </div>
              )}
            </label>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition-all"
              disabled={loading}
            >
              {loading ? "Analyzing…" : "Check"}
            </button>
          </form>

          {/* Result */}
          {loading && (
            <p className="mt-3 text-center text-cyan-300 animate-pulse text-sm">
              Analyzing claim...
            </p>
          )}

          {result && (
            <div className="mt-3 p-3 rounded-lg bg-gray-800 border border-gray-700">
              {result.error ? (
                <p className="text-red-400 text-sm font-semibold">
                  {result.error}
                </p>
              ) : result.type === "claim" ? (
                <>
                  <h3
                    className={`text-lg font-bold mb-1 ${getScoreColor(
                      result.score ?? 0
                    )}`}
                  >
                    Score: {result.score ?? 0}/100
                  </h3>
                  <pre className="text-gray-300 whitespace-pre-wrap text-xs max-h-40 overflow-auto">
                    {(() => {
                      try {
                        const parsed = JSON.parse(result.explanation);
                        if (parsed.error?.message) {
                          return `Error: ${parsed.error.message}`;
                        }
                        return JSON.stringify(parsed, null, 2);
                      } catch {
                        return result.explanation;
                      }
                    })()}
                  </pre>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold mb-1 text-cyan-400">
                    Type: {result.type}
                  </h3>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    {result.reason}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Put this component above Hero(), same file (App.js)
function HeroClaimPlayground() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const examples = [
    "Coffee dehydrates you",
    "The Great Wall of China is visible from space",
    "Lightning never strikes the same place twice",
    "Humans use only 10% of their brains",
  ];

  const runExample = async (text) => {
    setLoading(true);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("statement", text);
      const res = await fetch("http://127.0.0.1:8000/api/analyze/", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setResult({ error: "Failed to connect to backend" });
    } finally {
      setLoading(false);
    }
  };

  const scoreColor = (n=0) =>
    n >= 80 ? "text-green-400" : n >= 50 ? "text-yellow-400" : "text-red-500";

  return (
    <div className="rounded-2xl bg-gray-900/70 border border-gray-800 p-4">
      <h3 className="text-cyan-300 font-semibold text-center">Try quick examples</h3>

      <div className="mt-3 flex flex-wrap gap-2 justify-center">
        {examples.map((ex) => (
          <button
            key={ex}
            onClick={() => runExample(ex)}
            className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-200 text-sm border border-white/10"
          >
            {ex}
          </button>
        ))}
      </div>

      {loading && (
        <p className="mt-4 text-center text-cyan-300 text-sm animate-pulse">
          Checking credibility…
        </p>
      )}

      {result && (
        <div className="mt-4 rounded-lg bg-gray-800 border border-gray-700 p-3">
          {result.error ? (
            <p className="text-red-400 text-sm font-semibold">{result.error}</p>
          ) : result.type === "claim" ? (
            <>
              <div className={`text-base font-bold ${scoreColor(result.score ?? 0)}`}>
                Score: {result.score ?? 0}/100
              </div>
              <div className="mt-1 text-xs text-gray-300 max-h-28 overflow-auto whitespace-pre-wrap">
                {(() => {
                  try {
                    const parsed = JSON.parse(result.explanation);
                    if (parsed.error?.message) return `Error: ${parsed.error.message}`;
                    return JSON.stringify(parsed, null, 2);
                  } catch {
                    return result.explanation;
                  }
                })()}
              </div>
            </>
          ) : (
            <>
              <div className="text-base font-bold text-cyan-400">Type: {result.type}</div>
              <p className="text-xs text-gray-300 mt-1">{result.reason}</p>
            </>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] text-gray-400 text-center">
        Examples run the same backend route used by the extension.
      </p>
    </div>
  );
}

/** ---------- Landing page sections ---------- */
function Hero() {
  return (
    <section className="relative pt-24 pb-28">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-gray-950 via-black to-gray-900" />
      <div
        className="absolute inset-0 -z-10 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, #06b6d4 0%, transparent 25%), radial-gradient(circle at 80% 10%, #22d3ee 0%, transparent 20%), radial-gradient(circle at 40% 80%, #38bdf8 0%, transparent 20%)",
        }}
      />
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 text-xs font-medium">
              Browser Extension
            </span>
            <h1 className="mt-4 text-4xl md:text-5xl font-extrabold tracking-tight text-white">
              See the truth <span className="text-cyan-400">as you browse</span>
            </h1>
            <p className="mt-4 text-gray-300 text-lg">
              VeriLens fact-checks text and images instantly—highlight a claim,
              click, and get a credibility score with transparent reasoning.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href={LINKS.chrome || "#install"}           // falls back to #install if not published yet
                target={LINKS.chrome ? "_blank" : undefined}
                rel={LINKS.chrome ? "noreferrer" : undefined}
                className="px-5 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold shadow-lg shadow-cyan-500/20"
                aria-label="Add VeriLens to Chrome"
              >
                Add to Chrome
              </a>

              {/* scrolls to Product Preview section */}
              <a
                href="#preview"
                className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold border border-white/20"
              >
                See product
              </a>

              <a
                href={LINKS.github}
                className="text-gray-400 hover:text-white underline underline-offset-4"
                target="_blank"
                rel="noreferrer"
              >
                View on GitHub
              </a>
            </div>

            <div className="mt-6 flex items-center gap-4 text-sm text-gray-400">
              <span>Free</span>
              <span>•</span>
              <span>No tracking</span>
              <span>•</span>
              <span>Open-source core</span>
            </div>
          </div>

          {/* Static hero visual; the LIVE panel is available below & as floating */}
          <div className="relative">
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-2 shadow-2xl">
              <div className="rounded-xl overflow-hidden bg-gradient-to-br from-gray-800 to-gray-900">
                <HeroClaimPlayground /> {/* ← live, but lighter than full mockup */}
              </div>
            </div>
            <div className="absolute -inset-6 -z-10 blur-3xl bg-cyan-500/10 rounded-full" />
          </div>

        </div>
      </div>
    </section>
  );
}

function Features() {
  const items = [
    { title: "Text + Image Analysis", desc: "Paste a claim or upload a screenshot. We parse, verify, and score." },
    { title: "Credibility Score", desc: "Clear 0–100 score with color-coded confidence." },
    { title: "Transparent Reasoning", desc: "See explanations and (when available) supporting sources." },
    { title: "Private by Design", desc: "No tracking; configurable data retention; open-source core." },
  ];
  return (
    <section className="py-16 bg-gray-950 border-t border-gray-800" id="features">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">Why VeriLens</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {items.map((it) => (
            <div key={it.title} className="rounded-xl bg-gray-900/70 border border-gray-800 p-5">
              <h3 className="text-white font-semibold">{it.title}</h3>
              <p className="text-gray-400 text-sm mt-2">{it.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** ---------- NEW: Product Preview section with tabs ---------- */
function ProductPreview() {
  const [tab, setTab] = useState("live"); // 'live' | 'shots'
  const screenshots = [
    { src: `${process.env.PUBLIC_URL}/screenshots/img1.png`, caption: "Enter a claim and click Check" },
    { src: `${process.env.PUBLIC_URL}/screenshots/img2.png`, caption: "Instant credibility score" },
    { src: `${process.env.PUBLIC_URL}/screenshots/img3.png`, caption: "Detailed explanations" },
    { src: `${process.env.PUBLIC_URL}/screenshots/img4.png`, caption: "Handles errors gracefully" },
  ];

  return (
    <section className="py-20 bg-black border-t border-gray-800" id="preview">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex items-center justify-between gap-4 mb-6">
          <h2 className="text-2xl md:text-3xl font-bold text-white">
            Product Preview
          </h2>
          <div className="flex rounded-lg border border-gray-800 bg-gray-900/70 p-1">
            <button
              onClick={() => setTab("live")}
              className={`px-4 py-2 text-sm rounded-md ${
                tab === "live" ? "bg-cyan-600 text-white" : "text-gray-300"
              }`}
            >
              Live demo
            </button>
            <button
              onClick={() => setTab("shots")}
              className={`px-4 py-2 text-sm rounded-md ${
                tab === "shots" ? "bg-cyan-600 text-white" : "text-gray-300"
              }`}
            >
              Screenshots
            </button>
          </div>
        </div>

        {tab === "live" ? (
          <div className="grid lg:grid-cols-2 gap-8 items-start">
            {/* Embedded, fully functional panel */}
            <div className="order-2 lg:order-1">
              <MockupPanel embedded />
            </div>

            {/* Explainer beside it */}
            <div className="order-1 lg:order-2">
              <div className="rounded-2xl bg-gray-900/70 border border-gray-800 p-6">
                <h3 className="text-white font-semibold">Try it right here</h3>
                <p className="text-gray-400 text-sm mt-2">
                  Paste a claim or drop a screenshot. The embedded panel runs the
                  same flow as the extension: analyze → score → explanation.
                </p>
                <ul className="mt-4 space-y-2 text-gray-300 text-sm list-disc list-inside">
                  <li>0–100 credibility score with color coding</li>
                  <li>Explanations and error handling included</li>
                  <li>No tracking; requests used only for analysis</li>
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {screenshots.map((shot, i) => (
              <figure
                key={i}
                className="rounded-xl bg-gray-900/70 border border-gray-800 p-3 hover:scale-[1.02] transition transform"
              >
                <img
                  src={shot.src}
                  alt={shot.caption}
                  className="rounded-lg shadow-lg object-cover"
                />
                <figcaption className="mt-2 text-gray-400 text-sm text-center">
                  {shot.caption}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: 1, t: "Highlight a claim", d: "Select text or drop an image with text." },
    { n: 2, t: "Analyze", d: "VeriLens checks credibility using text + vision." },
    { n: 3, t: "Decide faster", d: "Get a score and explanation in seconds." },
  ];
  return (
    <section className="py-20 bg-black" id="how">
      <div className="max-w-6xl mx-auto px-6">
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">How it works</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {steps.map((s) => (
            <div key={s.n} className="rounded-2xl border border-gray-800 bg-gray-900/70 p-6">
              <div className="text-cyan-300 text-sm font-semibold">Step {s.n}</div>
              <div className="mt-2 text-white font-semibold">{s.t}</div>
              <p className="text-gray-400 text-sm mt-2">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Trust() {
  return (
    <section className="py-16 bg-gray-950 border-t border-gray-800" id="install">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-white">Privacy & Transparency</h2>
            <ul className="mt-4 space-y-2 text-gray-300 text-sm list-disc list-inside">
              <li>No tracking or ads.</li>
              <li>Inputs sent only to analyze your request.</li>
              <li>Open-source core – community auditable.</li>
              <li>Model limitations disclosed; you stay in control.</li>
            </ul>
          </div>
          <div className="rounded-2xl bg-gray-900/70 border border-gray-800 p-6">
            <h3 className="text-white font-semibold">Get the Extension</h3>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href={LINKS.chrome || "#"}
                  target={LINKS.chrome ? "_blank" : undefined}
                  rel={LINKS.chrome ? "noreferrer" : undefined}
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold"
                >
                  Add to Chrome
                </a>
                <a
                  href={LINKS.firefox || "#"}
                  target={LINKS.firefox ? "_blank" : undefined}
                  rel={LINKS.firefox ? "noreferrer" : undefined}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white border border-white/20"
                >
                  Firefox
                </a>
                <a
                  href={LINKS.edge || "#"}
                  target={LINKS.edge ? "_blank" : undefined}
                  rel={LINKS.edge ? "noreferrer" : undefined}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white border border-white/20"
                >
                  Edge
                </a>
              </div>

            <p className="mt-3 text-gray-400 text-xs">
              By installing, you agree to our terms & privacy policy.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="py-10 bg-black border-t border-gray-800">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <p className="text-gray-500 text-sm">© {new Date().getFullYear()} VeriLens</p>
          <div className="flex items-center gap-4 text-sm">
            <a className="text-gray-400 hover:text-white" href={LINKS.github} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a className="text-gray-400 hover:text-white" href="#features">Features</a>
            <a className="text-gray-400 hover:text-white" href="#how">How it works</a>
            <a className="text-gray-400 hover:text-white" href="#preview">Product</a>
            <a className="text-gray-400 hover:text-white" href="#install">Install</a>
            <a className="text-gray-400 hover:text-white" href={LINKS.privacy}>Privacy</a>
            <a className="text-gray-400 hover:text-white" href={LINKS.terms}>Terms</a>
          </div>
      </div>
    </footer>
  );
}

/** ---------- App ---------- */
export default function App() {

  const [showCrew, setShowCrew] = useState(false);
  const clickTimeout = useRef(null);
  const [mobileOpen, setMobileOpen] = useState(false);


  const handleLogoClick = () => {
    if (clickTimeout.current) {
      // double click detected
      clearTimeout(clickTimeout.current);
      clickTimeout.current = null;
      setShowCrew(true); // open contributors modal
    } else {
      // first click → wait to see if it becomes a double
      clickTimeout.current = setTimeout(() => {
        // if no second click within 300ms, treat as single click
        window.location.href = "/"; // redirect to homepage
        clickTimeout.current = null;
      }, 300);
    }
  };


  return (
    <div className="min-h-screen text-white">
    <nav className="fixed top-0 inset-x-0 z-50 bg-gray-900/60 backdrop-blur-md border-b border-white/10">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        
        {/* Logo (single click = home, double click = contributors) */}
        <button onClick={handleLogoClick} className="flex items-center gap-2 cursor-pointer">
          <img
            src={`${process.env.PUBLIC_URL}/logoL.png`}   // logo with wordmark baked in
            alt="VeriLens logo"
            className="h-10 w-auto drop-shadow-[0_0_6px_rgba(34,211,238,0.6)]"
          />
        </button>

        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-8 text-sm font-medium">
          <a href="#features" className="text-gray-300 hover:text-cyan-400 transition">Features</a>
          <a href="#how" className="text-gray-300 hover:text-cyan-400 transition">How it works</a>
          <a href="#preview" className="text-gray-300 hover:text-cyan-400 transition">Product</a>
          <a href="#install" className="text-gray-300 hover:text-cyan-400 transition">Install</a>
          <a href={LINKS.github} target="_blank" rel="noreferrer" 
            className="text-gray-300 hover:text-cyan-400 transition">GitHub</a>
        </div>

        {/* Mobile hamburger */}
        <div className="md:hidden">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="text-gray-300 hover:text-cyan-400 focus:outline-none"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none"
              viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/10 bg-gray-900/95 backdrop-blur-md px-6 py-4 space-y-3">
          <a href="#features" className="block text-gray-300 hover:text-cyan-400">Features</a>
          <a href="#how" className="block text-gray-300 hover:text-cyan-400">How it works</a>
          <a href="#preview" className="block text-gray-300 hover:text-cyan-400">Product</a>
          <a href="#install" className="block text-gray-300 hover:text-cyan-400">Install</a>
          <a href={LINKS.github} target="_blank" rel="noreferrer" className="block text-gray-300 hover:text-cyan-400">GitHub</a>
        </div>
      )}
    </nav>



      <Hero />
      <Features />
      <HowItWorks />
      <ProductPreview /> {/* NEW: section with Live Demo & Screenshots tabs */}
      <Trust />
      <Footer />
      <MockupPanel/>

      {/* Keep the floating panel too (desktop users love this). Remove if you want only embedded */}
      <Contributors
        show={showCrew}
        onClose={() => setShowCrew(false)}
        owner="darshangavate"
        repo="veriLens"
      />
    </div>
  );
}
