import React, { useState } from "react";

function App() {
  const [statement, setStatement] = useState("");
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

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
    }
    setLoading(false);
  };

  const handleFileChange = (file) => {
    if (file) {
      setImage(file);
      setPreview(URL.createObjectURL(file));
    }
  };

  const getScoreColor = (score) => {
    if (score >= 80) return "text-green-400";
    if (score >= 50) return "text-yellow-400";
    return "text-red-500";
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-black p-6">
      <div className="w-full max-w-2xl bg-gray-900/80 backdrop-blur-lg rounded-xl shadow-2xl p-8 border border-gray-700">
        <h1 className="text-4xl font-extrabold text-center mb-6 text-cyan-400 tracking-wide">
          Current Progress (proto)
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Text input */}
          <input
            type="text"
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            placeholder="Enter a claim..."
            className="px-4 py-3 rounded-lg bg-gray-800 text-gray-100 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />

          {/* Image upload */}
          <label
            className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-cyan-500 rounded-lg cursor-pointer bg-gray-800/50 hover:bg-gray-800 transition"
          >
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
                className="h-36 object-contain rounded-md"
              />
            ) : (
              <div className="flex flex-col items-center text-gray-400">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-10 h-10 mb-2 text-cyan-400"
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
                <p className="text-sm">Click to upload or drag & drop</p>
                <p className="text-xs text-gray-500">PNG, JPG up to 5MB</p>
              </div>
            )}
          </label>

          {/* Submit button */}
          <button
            type="submit"
            className="px-6 py-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition-all"
          >
            Check
          </button>
        </form>

        {/* Loading indicator */}
        {loading && (
          <p className="mt-6 text-center text-cyan-300 animate-pulse">
            Analyzing claim...
          </p>
        )}

        {/* Result */}
        {result && (
          <div className="mt-8 p-6 rounded-lg bg-gray-800 border border-gray-700">
            {result.error ? (
              <p className="text-red-400 font-semibold">{result.error}</p>
            ) : (
              <>
                {result.type === "claim" ? (
                  <>
                    <h3
                      className={`text-2xl font-bold mb-2 ${getScoreColor(
                        result.score ?? 0
                      )}`}
                    >
                      Credibility Score: {result.score ?? 0}/100
                    </h3>
                    <pre className="text-gray-300 whitespace-pre-wrap text-sm">
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
                    <h3 className="text-2xl font-bold mb-2 text-cyan-400">
                      Type: {result.type}
                    </h3>
                    <p className="text-gray-300 leading-relaxed">
                      {result.reason}
                    </p>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
