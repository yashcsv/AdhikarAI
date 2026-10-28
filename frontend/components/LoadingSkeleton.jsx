import { motion } from "framer-motion";

export default function LoadingSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-start"
    >
      <div className="glass-card max-w-3xl rounded-2xl border p-4">
        <div className="mb-3 h-3 w-28 rounded-full bg-slate-700/70" />
        <div className="space-y-2">
          <div className="h-3 w-[92%] rounded-full bg-shimmer" />
          <div className="h-3 w-[84%] rounded-full bg-shimmer" />
          <div className="h-3 w-[68%] rounded-full bg-shimmer" />
        </div>
      </div>
    </motion.div>
  );
}
