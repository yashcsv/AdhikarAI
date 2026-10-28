import { Activity, AlertTriangle, BarChart3, Clock3 } from "lucide-react";

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-stroke bg-white/5 p-3">
      <div className="mb-1 inline-flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
        <Icon size={13} />
        {label}
      </div>
      <p className="text-sm font-medium text-slate-100">{value}</p>
    </div>
  );
}

export default function ObservabilityPanel({ observability }) {
  if (!observability) return null;

  const rerankTop = (observability.rerankScores || []).slice(0, 3);
  const scoreRows = (observability.denseSparseTop || []).slice(0, 3);
  const tokenUsage = observability.tokenUsage || {};
  return (
    <div className="mt-3 space-y-2">
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <Stat icon={Clock3} label="Total Latency" value={`${Math.round(observability.totalLatency || 0)}ms`} />
        <Stat icon={BarChart3} label="Retrieved Chunks" value={String(observability.retrievedChunks || 0)} />
        <Stat
          icon={Activity}
          label="Top Rerank Scores"
          value={rerankTop.length ? rerankTop.map((v) => Number(v).toFixed(3)).join(" · ") : "n/a"}
        />
        <Stat
          icon={AlertTriangle}
          label="Hallucination Flag"
          value={observability.hallucination ? "Flagged" : "Clear"}
        />
      </div>

      <div className="rounded-xl border border-stroke bg-white/5 p-3">
        <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">Token and Cost Estimate</p>
        <p className="text-sm text-slate-100">
          Prompt {tokenUsage.promptTokens || 0} · Completion {tokenUsage.completionTokens || 0} · Total {tokenUsage.totalTokens || 0}
        </p>
        <p className="text-xs text-slate-300">Estimated Cost: ${Number(tokenUsage.estimatedCostUsd || 0).toFixed(6)}</p>
      </div>

      <div className="rounded-xl border border-stroke bg-white/5 p-3">
        <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">Confidence vs Reality</p>
        <p className="text-sm text-slate-100">{observability.confidenceReality || "pending"}</p>
        {observability.evaluation ? (
          <p className="text-xs text-slate-300">
            Keyword Score: {Number(observability.evaluation.keyword_score || 0).toFixed(2)}
          </p>
        ) : null}
      </div>

      {scoreRows.length ? (
        <div className="rounded-xl border border-stroke bg-white/5 p-3">
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Hybrid Score View</p>
          <div className="space-y-2">
            {scoreRows.map((row, index) => (
              <div key={`score-${index}`} className="text-xs text-slate-200">
                <p className="mb-1">Chunk {index + 1}</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded bg-slate-950/55 px-2 py-1">Dense: {Number(row.dense_score || 0).toFixed(3)}</div>
                  <div className="rounded bg-slate-950/55 px-2 py-1">Sparse: {Number(row.sparse_score || 0).toFixed(3)}</div>
                  <div className="rounded bg-slate-950/55 px-2 py-1">Final: {Number(row.final_score || 0).toFixed(3)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
