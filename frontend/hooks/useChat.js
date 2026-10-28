import { useCallback, useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { useStream } from "./useStream";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
const SESSIONS_STORAGE_KEY = "adhikarai_sessions_v1";
const MAX_SESSIONS = 20;
const MIN_CONFIDENCE = 0.65;
const MAX_CONFIDENCE = 0.93;

function makeSession(title = "New Session") {
  return {
    id: crypto.randomUUID(),
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
  };
}

function loadSessions() {
  if (typeof window === "undefined") {
    return [makeSession()];
  }
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [makeSession()];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return [makeSession()];
    return parsed.slice(0, MAX_SESSIONS);
  } catch {
    return [makeSession()];
  }
}

function estimateTokens(text = "") {
  const words = String(text).trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words * 1.3));
}

function extractEvidenceKeywords(query = "") {
  return String(query)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 5)
    .slice(0, 6);
}

function getConfidenceRealityLabel(confidence, keywordScore) {
  if (confidence > 0.8 && keywordScore < 0.3) return "overconfident";
  if (confidence < 0.4 && keywordScore > 0.7) return "underconfident";
  return "aligned";
}

function isGeminiAuthNotice(message = "") {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("authentication failed") ||
    text.includes("unauthorized") ||
    text.includes("permission denied") ||
    text.includes("invalid api key") ||
    text.includes("401") ||
    text.includes("403")
  );
}

function sanitizeHeaderValue(value = "") {
  const clean = String(value || "").trim();
  if (!clean) return "";
  if (clean.includes("\r") || clean.includes("\n")) return "";
  return clean;
}

function clampConfidence(value) {
  const raw = Number(value);
  const safe = Number.isFinite(raw) ? raw : MIN_CONFIDENCE;
  return Math.max(MIN_CONFIDENCE, Math.min(MAX_CONFIDENCE, safe));
}

export function useChat(options = {}) {
  const {
    geminiApiKey = "",
    mailFromEmail = "",
    onRequireGeminiSetup,
    onGeminiAuthError,
    onGeminiRequestSuccess,
  } = options;
  const [initialSessions] = useState(() => loadSessions());
  const [sessions, setSessions] = useState(initialSessions);
  const [activeSessionId, setActiveSessionId] = useState(() => initialSessions[0]?.id || makeSession().id);
  const [loading, setLoading] = useState(false);
  const [showSources, setShowSources] = useState(true);
  const [showDebug, setShowDebug] = useState(true);
  const [topK, setTopK] = useState(7);
  const [alpha, setAlpha] = useState(0.6);
  const [model, setModel] = useState("gemini");
  const [responseMode, setResponseMode] = useState("detailed");
  const [roleMode, setRoleMode] = useState("lawyer");
  const [chatSearch, setChatSearch] = useState("");
  const [features, setFeatures] = useState({
    query_rewrite: true,
    multi_query: false,
    evaluation_mode: false,
  });
  const [error, setError] = useState(null);
  const [lastQuery, setLastQuery] = useState("");
  const [lastUploadStatus, setLastUploadStatus] = useState(null);

  const { streamChat, stop, pause, resume, isPaused, isStreaming } = useStream();

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) || sessions[0] || makeSession(),
    [activeSessionId, sessions]
  );

  const messages = activeSession?.messages || [];

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  }, [sessions]);

  const updateActiveSession = useCallback(
    (updater) => {
      setSessions((prev) =>
        prev.map((session) => {
          if (session.id !== activeSessionId) return session;
          const nextSession = typeof updater === "function" ? updater(session) : { ...session, ...updater };
          return {
            ...nextSession,
            updatedAt: Date.now(),
          };
        })
      );
    },
    [activeSessionId]
  );

  const setMessages = useCallback(
    (updater) => {
      updateActiveSession((session) => ({
        ...session,
        messages: typeof updater === "function" ? updater(session.messages || []) : updater,
      }));
    },
    [updateActiveSession]
  );

  const createSession = useCallback(() => {
    const newSession = makeSession();
    setSessions((prev) => [newSession, ...prev].slice(0, MAX_SESSIONS));
    setActiveSessionId(newSession.id);
    setError(null);
    return newSession.id;
  }, []);

  const deleteSession = useCallback(
    (sessionId) => {
      const fallbackSession = makeSession();
      setSessions((prev) => {
        const next = prev.filter((item) => item.id !== sessionId);
        return next.length ? next : [fallbackSession];
      });
      setActiveSessionId((prevActiveId) => {
        if (prevActiveId !== sessionId) return prevActiveId;
        const fallback = sessions.find((item) => item.id !== sessionId);
        return fallback?.id || fallbackSession.id;
      });
    },
    [sessions]
  );

  const renameActiveSessionFromQuery = useCallback(
    (queryText) => {
      const title = queryText.trim().slice(0, 48) || "New Session";
      updateActiveSession((session) => {
        if (session.messages?.length) return session;
        return { ...session, title };
      });
    },
    [updateActiveSession]
  );

  const sendMessage = useCallback(
    async (query, { forceEli5 = false } = {}) => {
      const text = query.trim();
      if (!text || loading) return;

      if (model === "gemini" && !String(geminiApiKey || "").trim()) {
        setError("Gemini API key is required. Open Setup and save your key.");
        onRequireGeminiSetup?.();
        return;
      }

      setError(null);
      setLastQuery(text);
      renameActiveSessionFromQuery(text);

      const conversationMemory = [...messages]
        .slice(-8)
        .map((msg) => ({ role: msg.role, content: msg.content }));

      const userMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
      };

      const aiMessageId = crypto.randomUUID();
      const aiMessage = {
        id: aiMessageId,
        role: "assistant",
        content: "",
        user_query: text,
        evidence_keywords: extractEvidenceKeywords(text),
        sources: [],
        confidence: 0,
        confidence_label: "low",
        pipeline: {
          retrieval: { status: "running", latency: 0 },
          rerank: { status: "pending", latency: 0 },
          generation: { status: "pending", latency: 0 },
        },
        observability: {
          totalLatency: 0,
          retrievedChunks: topK,
          rerankScores: [],
          denseSparseTop: [],
          hallucination: false,
          tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
          generationNotice: "",
          confidenceReality: "pending",
          evaluation: null,
        },
      };

      setMessages((prev) => [...prev, userMessage, aiMessage]);
      setLoading(true);

      const reqStart = performance.now();

      try {
        await streamChat({
          headers: geminiApiKey ? { "X-Gemini-API-Key": geminiApiKey } : {},
          body: {
            session_id: activeSessionId,
            query: text,
            conversation_memory: conversationMemory,
            mode: roleMode === "lawyer" ? "lawyer" : "normal",
            thinking: responseMode === "detailed" ? "on" : "off",
            attachments: [],
            user_profile: {},
            top_k: topK,
            alpha,
            role_mode: roleMode,
            model,
            response_mode: responseMode,
            eli5: forceEli5,
            features: {
              ...features,
              show_debug: showDebug,
            },
          },
          onDelta: (token) => {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === aiMessageId
                  ? {
                      ...msg,
                      content: `${msg.content}${token}`,
                      pipeline: {
                        ...msg.pipeline,
                        retrieval: { ...msg.pipeline.retrieval, status: "done" },
                        rerank: { ...msg.pipeline.rerank, status: "done" },
                        generation: { ...msg.pipeline.generation, status: "running" },
                      },
                    }
                  : msg
              )
            );
          },
          onFinal: (finalPayload) => {
            const totalLatency = performance.now() - reqStart;

            setMessages((prev) =>
              prev.map((msg) => {
                if (msg.id !== aiMessageId) return msg;

                const answer = finalPayload.answer || msg.content;
                const sources = finalPayload.sources || [];
                const confidence = clampConfidence(finalPayload.confidence);
                const confidenceLabel = finalPayload.confidence_label || "low";
                const promptTokens = estimateTokens(text);
                const completionTokens = estimateTokens(answer);
                const totalTokens = promptTokens + completionTokens;
                const estimatedCostUsd = model === "gemini" ? (totalTokens / 1000) * 0.00025 : 0;
                const keywordScore = Number(finalPayload?.meta?.evaluation?.keyword_score || 0);
                const generationNotice = String(finalPayload?.meta?.generation_notice || "").toLowerCase();

                if (isGeminiAuthNotice(generationNotice)) {
                  onGeminiAuthError?.();
                } else if (model === "gemini") {
                  onGeminiRequestSuccess?.();
                }

                return {
                  ...msg,
                  content: answer,
                  sources,
                  confidence,
                  confidence_label: confidenceLabel,
                  meta: finalPayload?.meta || {},
                  pipeline: {
                    retrieval: {
                      status: "done",
                      latency: Number(finalPayload?.latency?.retrieval_time_ms || 120),
                    },
                    rerank: {
                      status: "done",
                      latency: Number(finalPayload?.latency?.rerank_time_ms || 80),
                    },
                    generation: {
                      status: "done",
                      latency: Number(finalPayload?.latency?.generation_time_ms || totalLatency),
                    },
                  },
                  observability: {
                    totalLatency,
                    retrievedChunks: Number(finalPayload?.meta?.retrieved_chunks || sources.length || topK),
                    rerankScores: finalPayload?.meta?.top_rerank_scores || [],
                    denseSparseTop: finalPayload?.meta?.dense_sparse_top || [],
                    hallucination: Boolean(finalPayload?.meta?.hallucination),
                    tokenUsage: {
                      promptTokens,
                      completionTokens,
                      totalTokens,
                      estimatedCostUsd,
                    },
                    generationNotice: finalPayload?.meta?.generation_notice || "",
                    confidenceReality: getConfidenceRealityLabel(confidence, keywordScore),
                    evaluation: finalPayload?.meta?.evaluation || null,
                  },
                };
              })
            );
          },
          onSession: (sessionId) => {
            if (!sessionId) return;
            setActiveSessionId(sessionId);
          },
          onError: async () => {
            try {
              const response = await fetch(`${API_URL}/chat`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(geminiApiKey ? { "X-Gemini-API-Key": geminiApiKey } : {}),
                },
                body: JSON.stringify({
                  session_id: activeSessionId,
                  query: text,
                  conversation_memory: conversationMemory,
                  mode: roleMode === "lawyer" ? "lawyer" : "normal",
                  thinking: responseMode === "detailed" ? "on" : "off",
                  attachments: [],
                  user_profile: {},
                  top_k: topK,
                  alpha,
                  role_mode: roleMode,
                  model,
                  response_mode: responseMode,
                  eli5: forceEli5,
                  features: {
                    ...features,
                    show_debug: showDebug,
                  },
                }),
              });
              if (!response.ok) throw new Error(`Fallback chat failed with status ${response.status}`);
              const payload = await response.json();
              const fallbackNotice = String(payload?.meta?.generation_notice || "").toLowerCase();
              if (isGeminiAuthNotice(fallbackNotice)) {
                onGeminiAuthError?.();
              } else if (model === "gemini") {
                onGeminiRequestSuccess?.();
              }

              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === aiMessageId
                    ? {
                        ...msg,
                        content: payload.answer || "No response.",
                        sources: payload.sources || [],
                        confidence: clampConfidence(payload.confidence),
                        confidence_label: payload.confidence_label || "low",
                        meta: payload?.meta || {},
                        observability: {
                          ...(msg.observability || {}),
                          generationNotice: payload?.meta?.generation_notice || "",
                        },
                      }
                    : msg
                )
              );
            } catch {
              setError("Something went wrong. Try again.");
            }
          },
        });
      } finally {
        setLoading(false);
      }
    },
    [
      activeSessionId,
      alpha,
      features,
      geminiApiKey,
      loading,
      messages,
      model,
      onGeminiAuthError,
      onGeminiRequestSuccess,
      onRequireGeminiSetup,
      renameActiveSessionFromQuery,
      roleMode,
      responseMode,
      showDebug,
      streamChat,
      topK,
      setMessages,
    ]
  );

  const stopGeneration = useCallback(() => {
    stop();
    setLoading(false);
  }, [stop]);

  const pauseGeneration = useCallback(async () => {
    try {
      await pause(activeSessionId);
    } catch {
      setError("Could not pause generation.");
    }
  }, [activeSessionId, pause]);

  const resumeGeneration = useCallback(async () => {
    try {
      await resume(activeSessionId);
    } catch {
      setError("Could not resume generation.");
    }
  }, [activeSessionId, resume]);

  const lastAssistantMessage = useMemo(
    () => [...messages].reverse().find((msg) => msg.role === "assistant") || null,
    [messages]
  );

  const retryLastQuery = useCallback(async () => {
    if (!lastQuery || loading) return;
    await sendMessage(lastQuery);
  }, [lastQuery, loading, sendMessage]);

  const handleSuggestedPrompt = useCallback(
    async (prompt, { sendDirectly = true } = {}) => {
      if (!prompt) return;
      if (sendDirectly) {
        await sendMessage(prompt);
      }
    },
    [sendMessage]
  );

  const runQuickEvaluation = useCallback(async () => {
    const target = [...messages].reverse().find((msg) => msg.role === "assistant" && msg.content?.trim());
    if (!target) return;

    try {
      const response = await fetch(`${API_URL}/chat/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: target.user_query || lastQuery,
          answer: target.content,
          context_chunks: target.sources || [],
          confidence: Number(target.confidence || 0),
        }),
      });
      if (!response.ok) throw new Error("Evaluation failed");
      const payload = await response.json();

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== target.id) return msg;
          return {
            ...msg,
            observability: {
              ...(msg.observability || {}),
              hallucination: Boolean(payload.hallucination),
              confidenceReality: payload.confidence_reality,
              evaluation: {
                keyword_score: payload.keyword_score,
                hallucination: payload.hallucination,
              },
            },
          };
        })
      );
    } catch {
      setError("Quick evaluation failed. Try again.");
    }
  }, [lastQuery, messages, setMessages]);

  const uploadPdf = useCallback(
    async (file) => {
      if (!file) return;
      setLastUploadStatus(null);
      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(`${API_URL}/chat/upload?session_id=${encodeURIComponent(activeSessionId)}`, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          throw new Error(`Upload failed with status ${response.status}`);
        }
        const payload = await response.json();
        setLastUploadStatus(`Uploaded: ${payload.chunks_added} chunks indexed for this session.`);
      } catch {
        setLastUploadStatus("Upload failed. Please use a PDF under 5MB.");
      }
    },
    [activeSessionId]
  );

  const requestEli5ForLast = useCallback(
    async (assistantMessage = null) => {
      const targetQuery = assistantMessage?.user_query || lastAssistantMessage?.user_query;
      if (!targetQuery) return;
      await sendMessage(targetQuery, { forceEli5: true });
    },
    [lastAssistantMessage, sendMessage]
  );

  const downloadLastAnswerPdf = useCallback(() => {
    const target = [...messages].reverse().find((msg) => msg.role === "assistant");
    if (!target) return;

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 48;
    const maxWidth = 500;
    let y = 56;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("AdhikarAI Legal Response", margin, y);
    y += 26;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    const metaLine = `Confidence: ${(Number(target.confidence || 0) * 100).toFixed(1)}% | Label: ${target.confidence_label || "low"}`;
    doc.text(metaLine, margin, y);
    y += 20;

    doc.setFontSize(12);
    const paragraphs = String(target.content || "").split("\n");
    for (const line of paragraphs) {
      const wrapped = doc.splitTextToSize(line || " ", maxWidth);
      for (const item of wrapped) {
        if (y > 770) {
          doc.addPage();
          y = 56;
        }
        doc.text(item, margin, y);
        y += 16;
      }
    }

    if ((target.sources || []).length) {
      y += 10;
      if (y > 750) {
        doc.addPage();
        y = 56;
      }
      doc.setFont("helvetica", "bold");
      doc.text("Sources", margin, y);
      y += 18;
      doc.setFont("helvetica", "normal");
      for (const src of target.sources.slice(0, 10)) {
        const srcLine = `- ${src.act || "Unknown Act"} (${src.section || "Unknown Section"})`;
        const wrapped = doc.splitTextToSize(srcLine, maxWidth);
        for (const item of wrapped) {
          if (y > 770) {
            doc.addPage();
            y = 56;
          }
          doc.text(item, margin, y);
          y += 14;
        }
      }
    }

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    doc.save(`adhikarai-response-${stamp}.pdf`);
  }, [messages]);

  const sendLastAnswerEmail = useCallback(
    async (toEmail) => {
      const recipient = String(toEmail || "").trim();
      if (!recipient) {
        setError("Enter recipient email first.");
        return;
      }

      const target = [...messages].reverse().find((msg) => msg.role === "assistant");
      if (!target) {
        setError("No assistant response available to email.");
        return;
      }

      const linkedQuery = target.user_query || lastQuery || "AdhikarAI response";
      const safeFromEmail = sanitizeHeaderValue(mailFromEmail);
      const response = await fetch(`${API_URL}/chat/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(safeFromEmail ? { "X-Mail-From-Email": safeFromEmail } : {}),
        },
        body: JSON.stringify({
          to_email: recipient,
          subject: `AdhikarAI Legal Brief: ${String(linkedQuery).slice(0, 70)}`,
          query: linkedQuery,
          answer: target.content || "",
          sources: target.sources || [],
          meta: {
            response_mode: target?.meta?.response_mode || responseMode,
            generation_notice: target?.observability?.generationNotice || "",
            confidence_label: target.confidence_label || "low",
          },
        }),
      });

      if (!response.ok) {
        let message = `Email failed with status ${response.status}`;
        try {
          const payload = await response.json();
          message = payload?.detail || message;
        } catch {
          // Keep default error text.
        }
        throw new Error(message);
      }

      const payload = await response.json();
      setLastUploadStatus(payload?.message || `Email sent to ${recipient}`);
      setError(null);
    },
    [lastQuery, mailFromEmail, messages, responseMode]
  );

  const toggleFeature = useCallback((name) => {
    setFeatures((prev) => ({ ...prev, [name]: !prev[name] }));
  }, []);

  const searchMatches = useMemo(() => {
    const needle = chatSearch.trim().toLowerCase();
    if (!needle) return 0;
    return messages.filter((msg) => String(msg.content || "").toLowerCase().includes(needle)).length;
  }, [chatSearch, messages]);

  return {
    sessions,
    activeSessionId,
    setActiveSessionId,
    createSession,
    deleteSession,
    activeSession,
    messages,
    loading,
    isStreaming,
    isPaused,
    showSources,
    setShowSources,
    showDebug,
    setShowDebug,
    topK,
    setTopK,
    alpha,
    setAlpha,
    model,
    setModel,
    responseMode,
    setResponseMode,
    roleMode,
    setRoleMode,
    features,
    toggleFeature,
    chatSearch,
    setChatSearch,
    searchMatches,
    error,
    setError,
    lastUploadStatus,
    sendMessage,
    stop: stopGeneration,
    pauseGeneration,
    resumeGeneration,
    retryLastQuery,
    handleSuggestedPrompt,
    runQuickEvaluation,
    requestEli5ForLast,
    uploadPdf,
    downloadLastAnswerPdf,
    sendLastAnswerEmail,
    lastAssistantMessage,
  };
}
