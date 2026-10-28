import { useEffect, useState } from "react";
import FromEmailCard from "../components/FromEmailCard";
import GeminiKeyCard from "../components/GeminiKeyCard";
import { useChatContext } from "../hooks/chat-context";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

export default function SetupPage() {
  const { gemini, mailFrom, verifyGeminiKey } = useChatContext();
  const [health, setHealth] = useState({ loading: true, ok: false, message: "Checking backend..." });

  useEffect(() => {
    let mounted = true;

    async function checkHealth() {
      try {
        const response = await fetch(`${API_URL}/health`);
        const payload = await response.json();
        if (!mounted) return;
        setHealth({ loading: false, ok: response.ok, message: payload?.status === "ok" ? "Backend is healthy." : "Health check failed." });
      } catch {
        if (!mounted) return;
        setHealth({ loading: false, ok: false, message: "Backend is unreachable. Start API server and retry." });
      }
    }

    checkHealth();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <GeminiKeyCard gemini={gemini} onVerify={verifyGeminiKey} title="Gemini API Key (Required for Gemini mode)" />
      <FromEmailCard mailFrom={mailFrom} title="Sender Email for Mail Feature" />

      <section className="glass-card rounded-2xl p-5">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Environment</p>
        <h2 className="mt-1 text-xl font-semibold text-slate-100">Connection & API Info</h2>

        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-xl border border-stroke bg-white/5 p-3 text-sm text-slate-300">
            <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">API Base URL</p>
            <p>{API_URL}</p>
          </div>
          <div className="rounded-xl border border-stroke bg-white/5 p-3 text-sm text-slate-300">
            <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">Health</p>
            <p className={health.ok ? "text-mint" : "text-warn"}>{health.loading ? "Checking..." : health.message}</p>
          </div>
        </div>

        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-300">
          <li>Paste your Gemini API key and click Save.</li>
          <li>Click Verify to confirm the key works with backend.</li>
          <li>Switch to Chat and start asking legal questions.</li>
        </ol>
      </section>
    </div>
  );
}
