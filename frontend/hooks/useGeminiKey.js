import { useCallback, useEffect, useMemo, useState } from "react";

const GEMINI_KEY_STORAGE_KEY = "adhikarai_gemini_api_key_v1";
const GEMINI_KEY_STATUS_STORAGE_KEY = "adhikarai_gemini_api_key_status_v1";

function loadStoredKey() {
  if (typeof window === "undefined") return "";
  return String(localStorage.getItem(GEMINI_KEY_STORAGE_KEY) || "").trim();
}

function loadStoredStatus() {
  if (typeof window === "undefined") return "not-set";
  const value = String(localStorage.getItem(GEMINI_KEY_STATUS_STORAGE_KEY) || "").trim();
  if (value === "saved" || value === "invalid" || value === "not-set") {
    return value;
  }
  return "not-set";
}

export function maskGeminiKey(value = "") {
  const key = String(value || "").trim();
  if (!key) return "Not set";
  if (key.length <= 10) return `${key.slice(0, 2)}••••${key.slice(-2)}`;
  return `${key.slice(0, 6)}•••••••••••••${key.slice(-4)}`;
}

export function useGeminiKey() {
  const [apiKey, setApiKey] = useState(() => loadStoredKey());
  const [status, setStatusState] = useState(() => loadStoredStatus());

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (apiKey) {
      localStorage.setItem(GEMINI_KEY_STORAGE_KEY, apiKey);
    } else {
      localStorage.removeItem(GEMINI_KEY_STORAGE_KEY);
    }
  }, [apiKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(GEMINI_KEY_STATUS_STORAGE_KEY, status);
  }, [status]);

  const saveKey = useCallback((value) => {
    const nextKey = String(value || "").trim();
    setApiKey(nextKey);
    setStatusState(nextKey ? "saved" : "not-set");
    return nextKey;
  }, []);

  const clearKey = useCallback(() => {
    setApiKey("");
    setStatusState("not-set");
  }, []);

  const setStatus = useCallback((value) => {
    if (value !== "saved" && value !== "invalid" && value !== "not-set") return;
    setStatusState(value);
  }, []);

  const maskedKey = useMemo(() => maskGeminiKey(apiKey), [apiKey]);

  return {
    apiKey,
    maskedKey,
    status,
    saveKey,
    clearKey,
    setStatus,
  };
}
