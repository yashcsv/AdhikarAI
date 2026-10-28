import { motion } from "framer-motion";
import { Bot, Copy, Lightbulb, User } from "lucide-react";
import { useState } from "react";
import ConfidenceBadge from "./ConfidenceBadge";
import PipelineBar from "./PipelineBar";
import SourcePanel from "./SourcePanel";
import ObservabilityPanel from "./ObservabilityPanel";
import Button from "./ui/button";
import Toast from "./Toast";

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedText({ text, term }) {
  if (!term) return <>{text}</>;
  const escaped = escapeRegex(term.trim());
  if (!escaped) return <>{text}</>;
  const parts = String(text).split(new RegExp(`(${escaped})`, "gi"));
  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === term.toLowerCase() ? (
          <mark key={`${part}-${index}`} className="rounded bg-accent/30 px-0.5 text-slate-100">
            {part}
          </mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </>
  );
}

function StructuredAnswer({ text, term }) {
  const headings = new Set([
    "Direct Answer",
    "Key Legal Basis",
    "Jurisdiction Note",
    "Next Action",
    "Executive Summary",
    "Applicable Legal Position",
    "Primary Supporting Provisions",
    "Risk and Interpretation Caveat",
    "Compliance Controls Checklist",
    "Referenced Sources",
  ]);

  const blocks = String(text || "")
    .split(/\n\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  const hasStructuredHeadings = blocks.some((block) => headings.has(block.split("\n")[0]?.trim()));
  if (!hasStructuredHeadings) {
    return (
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
        <HighlightedText text={text || "..."} term={term} />
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {blocks.map((block, index) => {
        const lines = block.split("\n");
        const firstLine = lines[0]?.trim() || "";
        const bodyLines = lines.slice(1);
        const isHeadingBlock = headings.has(firstLine);
        const contentLines = isHeadingBlock ? bodyLines : lines;
        const hasBullets = contentLines.some((line) => line.trim().startsWith("- "));
        const hasNumbers = contentLines.some((line) => /^\d+\.\s/.test(line.trim()));

        return (
          <div key={`block-${index}`} className="rounded-lg border border-stroke/70 bg-white/5 p-2">
            {isHeadingBlock ? <p className="mb-1 text-xs uppercase tracking-wide text-accent/90">{firstLine}</p> : null}
            {hasBullets ? (
              <ul className="space-y-1 pl-4 text-sm leading-relaxed text-slate-100">
                {contentLines
                  .filter((line) => line.trim())
                  .map((line, lineIndex) => (
                    <li key={`bullet-${index}-${lineIndex}`}>
                      <HighlightedText text={line.replace(/^\s*-\s*/, "")} term={term} />
                    </li>
                  ))}
              </ul>
            ) : hasNumbers ? (
              <ol className="space-y-1 pl-4 text-sm leading-relaxed text-slate-100">
                {contentLines
                  .filter((line) => line.trim())
                  .map((line, lineIndex) => (
                    <li key={`num-${index}-${lineIndex}`}>
                      <HighlightedText text={line.replace(/^\s*\d+\.\s*/, "")} term={term} />
                    </li>
                  ))}
              </ol>
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-100">
                <HighlightedText text={contentLines.join("\n") || firstLine} term={term} />
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function MessageBubble({ message, showSources, showDebug, searchTerm = "", onEli5 }) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const [showWhy, setShowWhy] = useState(false);

  const onCopy = async () => {
    if (!message?.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can fail in insecure contexts; silently ignore to keep UX smooth.
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div className={`max-w-3xl rounded-2xl border p-4 ${isUser ? "border-accent/40 bg-accent/10" : "glass-card"}`}>
        <div className="mb-2 inline-flex items-center gap-2 text-xs uppercase tracking-wider text-slate-300">
          {isUser ? <User size={13} /> : <Bot size={13} />}
          {isUser ? "You" : "AdhikarAI"}
        </div>

        <StructuredAnswer text={message.content || "..."} term={searchTerm} />

        {!isUser && (
          <div className="mt-3">
            <ConfidenceBadge confidence={message.confidence} label={message.confidence_label} />

            {message?.observability?.generationNotice ? (
              <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-100">
                {message.observability.generationNotice}
              </div>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={onCopy}>
                <Copy size={14} className="mr-1" />
                Copy
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowWhy((prev) => !prev)}>
                <Lightbulb size={14} className="mr-1" />
                Why this answer?
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => onEli5?.(message)}>
                ELI5
              </Button>
            </div>

            {showDebug && <PipelineBar pipeline={message.pipeline} />}
            {showDebug && <ObservabilityPanel observability={message.observability} />}
            {showWhy ? (
              <div className="mt-3 rounded-xl border border-stroke bg-white/5 p-2">
                <p className="mb-1 px-1 text-xs uppercase tracking-wide text-slate-400">Explainability</p>
                <SourcePanel sources={message.sources} highlightTerms={message.evidence_keywords || []} />
              </div>
            ) : null}
            {showSources && !showWhy ? <SourcePanel sources={message.sources} highlightTerms={message.evidence_keywords || []} /> : null}
          </div>
        )}
      </div>

      {!isUser ? <Toast visible={copied} message="Copied!" /> : null}
    </motion.div>
  );
}
