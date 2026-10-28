import { useMemo, useState } from "react";
import { Eye, EyeOff, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import Button from "./ui/button";

function StatusBadge({ status }) {
  const mapping = {
    "not-set": { label: "Not set", classes: "border-warn/50 bg-warn/10 text-warn" },
    saved: { label: "Saved", classes: "border-mint/50 bg-mint/10 text-mint" },
    invalid: { label: "Invalid", classes: "border-danger/50 bg-danger/10 text-danger" },
  };

  const config = mapping[status] || mapping["not-set"];

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${config.classes}`}>
      {config.label}
    </span>
  );
}

export default function GeminiKeyCard({ gemini, onVerify, title = "Gemini API Key Setup" }) {
  const [draftKey, setDraftKey] = useState(gemini.apiKey || "");
  const [showKey, setShowKey] = useState(false);
  const [verifyState, setVerifyState] = useState({ loading: false, message: "" });

  const helper = useMemo(
    () =>
      gemini.status === "invalid"
        ? "Current key appears invalid. Save a new key and verify again."
        : "Your key stays in this browser only and is never stored on server.",
    [gemini.status]
  );

  const handleSave = () => {
    const saved = gemini.saveKey(draftKey);
    setDraftKey(saved);
    setVerifyState({ loading: false, message: saved ? "Key saved locally." : "Key cleared." });
  };

  const handleClear = () => {
    setDraftKey("");
    gemini.clearKey();
    setVerifyState({ loading: false, message: "Key cleared from this browser." });
  };

  const handleVerify = async () => {
    setVerifyState({ loading: true, message: "Verifying with backend..." });
    const result = await onVerify?.(draftKey);
    setVerifyState({ loading: false, message: result?.message || "Verification completed." });
  };

  return (
    <section className="glass-card rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Required Step</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-100">{title}</h2>
        </div>
        <StatusBadge status={gemini.status} />
      </div>

      <p className="text-sm text-slate-300">
        AdhikarAI uses your Gemini key for model calls when model is set to Gemini. Get your key from Google AI Studio.
      </p>

      <div className="mt-4 rounded-xl border border-stroke bg-slate-950/45 p-3">
        <label className="mb-2 block text-xs uppercase tracking-wide text-slate-400">Gemini API Key</label>
        <div className="flex gap-2">
          <input
            type={showKey ? "text" : "password"}
            value={draftKey}
            onChange={(event) => setDraftKey(event.target.value)}
            placeholder="Paste your Gemini key"
            className="w-full rounded-xl border border-stroke bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent/70"
          />
          <Button type="button" variant="outline" onClick={() => setShowKey((prev) => !prev)}>
            {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" onClick={handleSave}>
          <KeyRound size={14} className="mr-1" />
          Save
        </Button>
        <Button type="button" variant="outline" onClick={handleVerify} disabled={!draftKey.trim() || verifyState.loading}>
          <ShieldCheck size={14} className="mr-1" />
          {verifyState.loading ? "Verifying..." : "Verify"}
        </Button>
        <Button type="button" variant="ghost" onClick={handleClear}>
          <Trash2 size={14} className="mr-1" />
          Clear key
        </Button>
      </div>

      <p className="mt-3 text-xs text-slate-400">{helper}</p>
      {verifyState.message ? <p className="mt-2 text-xs text-slate-300">{verifyState.message}</p> : null}
      <p className="mt-2 text-xs text-slate-400">Current key: {gemini.maskedKey}</p>
    </section>
  );
}
