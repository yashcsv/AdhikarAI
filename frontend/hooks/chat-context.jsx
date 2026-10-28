import { createContext, useContext, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useChat } from "./useChat";
import { useFromEmail } from "./useFromEmail";
import { useGeminiKey } from "./useGeminiKey";

const ChatContext = createContext(null);

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

function isGeminiAuthFailure(message = "") {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("authentication failed") ||
    text.includes("unauthorized") ||
    text.includes("permission denied") ||
    text.includes("invalid api key") ||
    text.includes("403") ||
    text.includes("401")
  );
}

export function ChatProvider({ children }) {
  const navigate = useNavigate();
  const gemini = useGeminiKey();
  const mailFrom = useFromEmail();

  const chat = useChat({
    geminiApiKey: gemini.apiKey,
    mailFromEmail: mailFrom.fromEmail,
    onRequireGeminiSetup: () => navigate("/setup"),
    onGeminiAuthError: () => gemini.setStatus("invalid"),
    onGeminiRequestSuccess: () => {
      if (gemini.apiKey) gemini.setStatus("saved");
    },
  });

  const verifyGeminiKey = async (keyArg) => {
    const key = String(keyArg || gemini.apiKey || "").trim();
    if (!key) {
      gemini.setStatus("not-set");
      return { valid: false, message: "Gemini API key is required." };
    }

    try {
      const response = await fetch(`${API_URL}/chat/verify-key`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Gemini-API-Key": key,
        },
      });
      const payload = await response.json();
      const valid = Boolean(payload?.valid);
      if (valid) {
        gemini.setStatus("saved");
      } else if (isGeminiAuthFailure(payload?.message)) {
        gemini.setStatus("invalid");
      } else if (gemini.apiKey) {
        gemini.setStatus("saved");
      } else {
        gemini.setStatus("not-set");
      }
      return {
        valid,
        message: payload?.message || (valid ? "Gemini API key is valid." : "Gemini API key is invalid."),
      };
    } catch {
      if (gemini.apiKey) {
        gemini.setStatus("saved");
      }
      return { valid: false, message: "Verification unavailable right now. Please try again." };
    }
  };

  const needsGeminiKey = chat.model === "gemini" && !gemini.apiKey;

  const value = useMemo(
    () => ({
      ...chat,
      gemini,
      mailFrom,
      needsGeminiKey,
      verifyGeminiKey,
    }),
    [chat, gemini, mailFrom, needsGeminiKey]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used inside ChatProvider");
  }
  return context;
}
