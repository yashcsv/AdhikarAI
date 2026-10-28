import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAppStore = create(
  persist(
    (set) => ({
      // --- CHAT PERSONALIZATION PRESETS ---
      chatPrefs: {
        profilePreset: 'worker', // worker | hr | lawyer
        assistantMode: 'normal', // normal | lawyer
        thinkingMode: 'off', // on | off
      },
      setChatPrefs: (updates) =>
        set((state) => ({ chatPrefs: { ...state.chatPrefs, ...updates } })),
      applyProfilePreset: (preset) =>
        set((state) => {
          const value = String(preset || '').toLowerCase();
          if (value === 'lawyer') {
            return {
              chatPrefs: {
                ...state.chatPrefs,
                profilePreset: 'lawyer',
                assistantMode: 'lawyer',
                thinkingMode: 'on',
              },
            };
          }
          if (value === 'hr') {
            return {
              chatPrefs: {
                ...state.chatPrefs,
                profilePreset: 'hr',
                assistantMode: 'normal',
                thinkingMode: 'on',
              },
            };
          }
          return {
            chatPrefs: {
              ...state.chatPrefs,
              profilePreset: 'worker',
              assistantMode: 'normal',
              thinkingMode: 'off',
            },
          };
        }),

      // --- MODEL CONFIG STATE ---
      config: {
        provider: 'gemini',
        modelName: 'gemini-1.5-pro',
        temperature: 0.6,
        maxTokens: 2000,
        apiKey: '', // Client-side execution bound
      },
      setConfig: (updates) =>
        set((state) => ({ config: { ...state.config, ...updates } })),

      // --- CHAT STATE ---
      session_id: crypto.randomUUID(),
      messages: [],
      // INIT | SEARCHING | RERANKING | STREAMING | COMPLETE | ERROR
      streamingState: 'INIT', 
      error: null,
      
      resetSession: () => 
        set(() => ({ 
          session_id: crypto.randomUUID(), 
          messages: [], 
          error: null, 
          streamingState: 'INIT' 
        })),
        
      addMessage: (msg) => 
        set((state) => ({ 
          messages: [...state.messages, { ...msg, id: crypto.randomUUID() }] 
        })),
        
      updateLastAssistantMessage: (deltaText, metaDelta = null) =>
        set((state) => {
          const msgs = [...state.messages];
          if (msgs.length === 0 || msgs[msgs.length - 1].role !== 'assistant') return state;
          
          const lastMsg = msgs[msgs.length - 1];
          lastMsg.content += deltaText;
          if (metaDelta) {
            if (typeof metaDelta.answer === 'string' && metaDelta.answer.trim()) {
              lastMsg.content = metaDelta.answer;
            }
            lastMsg.meta = { ...lastMsg.meta, ...metaDelta };
          }
          return { messages: msgs };
        }),
        
      setStreamingState: (stateParam) => set({ streamingState: stateParam }),
      setError: (errCode, errMessage) => set({ error: { code: errCode, message: errMessage }, streamingState: 'ERROR' }),

      // --- UI METRICS & ANIMATION CONSTRAINTS ---
      uiState: {
        mode: 'product', // 'product' | 'engineer'
        animationsEnabled: typeof window !== 'undefined' ? (navigator.hardwareConcurrency > 4 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) : true,
      },
      setAnimations: (isEnabled) => set((state) => ({ uiState: { ...state.uiState, animationsEnabled: isEnabled } })),
      toggleAnimations: () => set((state) => ({ uiState: { ...state.uiState, animationsEnabled: !state.uiState.animationsEnabled } })),
      toggleMode: () => set((state) => ({ uiState: { ...state.uiState, mode: state.uiState.mode === 'product' ? 'engineer' : 'product' } })),
      
      // --- SYSTEM HARDWARE BOUNDS (Differentiator logic) ---
      systemState: {
         isSimulatingLoad: false,
      },
      toggleSimulateLoad: () => set((state) => ({ systemState: { isSimulatingLoad: !state.systemState.isSimulatingLoad } })),

      // Global app telemetry (persisted)
      telemetry: {
         totalQueries: 0,
         avgLatencyMs: 0,
      },
      logQueryMetrics: (latencyMs) => 
        set((state) => {
           const newTotal = state.telemetry.totalQueries + 1;
           const newAvg = ((state.telemetry.avgLatencyMs * (state.telemetry.totalQueries || 0)) + latencyMs) / newTotal;
           return { telemetry: { totalQueries: newTotal, avgLatencyMs: newAvg }};
        })
    }),
    {
      name: 'adhikarai-store-v4',
      partialize: (state) => ({
        config: state.config,
        telemetry: state.telemetry,
        uiState: { mode: state.uiState.mode, animationsEnabled: state.uiState.animationsEnabled },
        chatPrefs: state.chatPrefs,
      }), 
    }
  )
);
