import { useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import MessageBubble from "./MessageBubble";
import LoadingSkeleton from "./LoadingSkeleton";
import Button from "./ui/button";

export default function ChatWindow({ messages, showSources, showDebug, loading, error, onRetry, searchTerm = "", onEli5 }) {
  const endRef = useRef(null);
  const lastAssistant = [...messages].reverse().find((msg) => msg.role === "assistant");
  const showLoadingSkeleton = Boolean(loading && (!lastAssistant || !lastAssistant.content));

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  return (
    <div className="glass-card h-[64vh] overflow-y-auto rounded-2xl border p-4 md:h-[70vh]">
      {messages.length === 0 ? (
        <div className="mt-20 text-center text-slate-400">
          <p className="text-lg font-medium text-slate-200">AdhikarAI is ready.</p>
          <p className="mt-1 text-sm">Ask legal questions to see retrieval, rerank, and generation in action.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                showSources={showSources}
                showDebug={showDebug}
                searchTerm={searchTerm}
                onEli5={onEli5}
              />
            ))}
            {showLoadingSkeleton ? <LoadingSkeleton key="loading-skeleton" /> : null}
          </AnimatePresence>

          {error ? (
            <div className="rounded-xl border border-danger/60 bg-danger/15 p-3 text-sm text-danger">
              <p>{error}</p>
              <div className="mt-2">
                <Button type="button" size="sm" variant="outline" onClick={onRetry}>
                  Retry
                </Button>
              </div>
            </div>
          ) : null}

          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}
