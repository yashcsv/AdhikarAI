import { useCallback, useRef, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

function tryParseJson(payload) {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export function useStream() {
  const abortRef = useRef(null);
  const sessionIdRef = useRef(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const control = useCallback(async (action, sessionIdArg) => {
    const sessionId = sessionIdArg || sessionIdRef.current;
    if (!sessionId) return null;

    const response = await fetch(`${API_URL}/chat/control/${sessionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });

    if (!response.ok) {
      throw new Error(`Control action '${action}' failed with status ${response.status}`);
    }

    return response.json();
  }, []);

  const stop = useCallback(() => {
    const pendingSession = sessionIdRef.current;
    if (pendingSession) {
      control("stop", pendingSession).catch(() => {
        // Abort still ensures local stream termination even if control call fails.
      });
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsPaused(false);
    setIsStreaming(false);
  }, [control]);

  const pause = useCallback(async (sessionIdArg) => {
    const payload = await control("pause", sessionIdArg);
    setIsPaused(true);
    return payload;
  }, [control]);

  const resume = useCallback(async (sessionIdArg) => {
    const payload = await control("resume", sessionIdArg);
    setIsPaused(false);
    return payload;
  }, [control]);

  const streamChat = useCallback(
    async ({ body, headers = {}, onDelta, onFinal, onError, onSession }) => {
      stop();
      const controller = new AbortController();
      abortRef.current = controller;
      sessionIdRef.current = body?.session_id || null;
      if (sessionIdRef.current) {
        onSession?.(sessionIdRef.current);
      }
      setIsStreaming(true);
      setIsPaused(false);

      try {
        const response = await fetch(`${API_URL}/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Stream failed with status ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;

            const normalized = line.startsWith("data:") ? line.slice(5).trim() : line;
            const parsed = tryParseJson(normalized);
            if (!parsed) continue;

            if (parsed.type === "delta") {
              onDelta?.(parsed.text || "");
            }
            if (parsed.type === "final") {
              const finalPayload = parsed.response || {};
              const finalSessionId = finalPayload?.meta?.session_id;
              if (finalSessionId) {
                sessionIdRef.current = finalSessionId;
                onSession?.(finalSessionId);
              }
              onFinal?.(finalPayload);
            }
          }
        }
      } catch (error) {
        if (error.name !== "AbortError") {
          onError?.(error);
        }
      } finally {
        abortRef.current = null;
        setIsStreaming(false);
        setIsPaused(false);
      }
    },
    [stop]
  );

  return { streamChat, stop, pause, resume, isPaused, isStreaming };
}
