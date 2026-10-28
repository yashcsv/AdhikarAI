import { motion } from "framer-motion";

const dotColor = {
  pending: "bg-slate-500",
  running: "bg-accent",
  done: "bg-mint",
  error: "bg-danger",
};

function Stage({ name, data }) {
  const status = data?.status || "pending";
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex min-w-[130px] items-center gap-2 rounded-lg border border-stroke bg-white/5 px-3 py-2"
    >
      <span className={`h-2.5 w-2.5 rounded-full ${dotColor[status] || dotColor.pending}`} />
      <div className="leading-tight">
        <p className="text-xs uppercase tracking-wide text-slate-300">{name}</p>
        <p className="text-xs text-slate-400">
          {status === "done" ? `${Math.round(Number(data?.latency || 0))}ms` : status}
        </p>
      </div>
    </motion.div>
  );
}

export default function PipelineBar({ pipeline }) {
  const p = pipeline || {};
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Stage name="Retrieval" data={p.retrieval} />
      <span className="text-slate-500">→</span>
      <Stage name="Rerank" data={p.rerank} />
      <span className="text-slate-500">→</span>
      <Stage name="Generation" data={p.generation} />
    </div>
  );
}
