import { motion } from "framer-motion";
import { ChevronDown, FileText, Scale } from "lucide-react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { useState } from "react";

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightSnippet(text, terms = []) {
  const filtered = terms.map((item) => String(item || "").trim()).filter(Boolean);
  if (!filtered.length) {
    return [text];
  }
  const pattern = filtered.map(escapeRegex).join("|");
  return String(text).split(new RegExp(`(${pattern})`, "gi"));
}

export default function SourcePanel({ sources = [], highlightTerms = [] }) {
  const [open, setOpen] = useState(false);
  if (!sources.length) return null;

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className="mt-3">
      <Collapsible.Trigger className="flex w-full items-center justify-between rounded-lg border border-stroke bg-white/5 px-3 py-2 text-sm text-slate-200 hover:bg-white/10">
        <span className="inline-flex items-center gap-2">
          <Scale size={14} />
          Sources ({sources.length})
        </span>
        <ChevronDown size={16} className={open ? "rotate-180 transition" : "transition"} />
      </Collapsible.Trigger>
      <Collapsible.Content asChild>
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className="mt-2 space-y-2"
        >
          {sources.map((src, idx) => (
            <div key={`${src.act}-${src.section}-${idx}`} className="rounded-lg border border-stroke bg-slate-900/45 p-3">
              <div className="mb-1 inline-flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
                <FileText size={12} />
                {src.act} · {src.section}
              </div>
              <p className="text-sm text-slate-200/90">
                {highlightSnippet(src.snippet, highlightTerms).map((part, index) => {
                  const match = highlightTerms.some((term) => part.toLowerCase() === String(term).toLowerCase());
                  if (!match) {
                    return <span key={`${src.section}-${index}`}>{part}</span>;
                  }
                  return (
                    <mark key={`${src.section}-${index}`} className="rounded bg-accent/25 px-0.5 text-slate-100">
                      {part}
                    </mark>
                  );
                })}
              </p>
            </div>
          ))}
        </motion.div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
