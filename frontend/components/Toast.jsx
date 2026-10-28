import { AnimatePresence, motion } from "framer-motion";

export default function Toast({ visible, message }) {
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 18 }}
          className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-stroke bg-slate-900/90 px-4 py-2 text-sm text-slate-100 shadow-glass"
        >
          {message}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
