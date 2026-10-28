import React, { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { GeminiAdapter } from '../services/models/gemini';
import { OpenAIAdapter } from '../services/models/openai';
import { OpenRouterAdapter } from '../services/models/openrouter';
import { Send, Loader2, Database, ShieldAlert, XCircle, AlertTriangle, ChevronRight, Activity, ChevronDown, Cpu, CheckCircle } from 'lucide-react';
import { extractTextFromFile } from '../services/attachmentExtraction';

const PROVIDER_STATUS_URL = '/api/chat/provider-status';
const SUGGESTED_QUESTIONS = [
  "What is minimum wage in India for my type of job?",
  "What should I do if salary is delayed?",
  "Who can get maternity benefits and how to claim?",
  "What are legal working hours and overtime rules?",
  "What records should I keep before filing a complaint?",
];

const StreamingGovernorIndicator = ({ state, isSimulatingLoad, reducedMotion }) => {
   if (state === 'INIT') return null;
   if (state === 'COMPLETE' || state === 'ERROR') return null;
   
   return (
      <div className="flex flex-col gap-2 p-4 bg-obsidian border border-white/10 rounded-xl mb-4 self-start shadow-sm shadow-accent/5 max-w-[85%] font-mono text-xs w-full">
         <div className="flex justify-between items-center text-[10px] text-slate-500 uppercase tracking-widest border-b border-white/5 pb-2 mb-2">
            <span>Live Trace Architecture</span>
            {isSimulatingLoad && <span className={`text-warning ${reducedMotion ? '' : 'animate-pulse'}`}>Load Bounding Active</span>}
         </div>
         <div className="flex items-center gap-1.5 w-full">
             {/* NODE 1: RETRIEVAL */}
             <div className={`px-2 py-1.5 border rounded flex items-center gap-2 transition-all duration-300 ${(state === 'SEARCHING' || state === 'RERANKING' || state === 'STREAMING') ? 'bg-accent/10 border-accent/30 text-accent' : 'bg-black/40 border-white/5 text-slate-600'}`}>
                {state === 'SEARCHING' ? <Loader2 size={12} className={reducedMotion ? '' : 'animate-[spin_1.5s_linear_infinite]'} /> : <Database size={12} />}
                FAISS
             </div>
             
             <ChevronRight size={12} className="text-slate-600 shrink-0" />
             
             {/* NODE 2: RERANKER */}
             <div className={`px-2 py-1.5 border rounded flex items-center gap-2 transition-all duration-300 ${isSimulatingLoad ? 'bg-error/10 border-error/30 text-error line-through' : (state === 'RERANKING' || state === 'STREAMING') ? 'bg-warning/10 border-warning/30 text-warning' : 'bg-black/40 border-white/5 text-slate-600'}`}>
                {state === 'RERANKING' && !isSimulatingLoad ? <Loader2 size={12} className={reducedMotion ? '' : 'animate-[spin_1.5s_linear_infinite]'} /> : <Cpu size={12} />}
                MiniLM
             </div>

             <ChevronRight size={12} className="text-slate-600 shrink-0" />
             
             {/* NODE 3: GENERATION */}
             <div className={`px-2 py-1.5 border rounded flex items-center gap-2 transition-all duration-300 ${state === 'STREAMING' ? 'bg-success/10 border-success/30 text-success' : 'bg-black/40 border-white/5 text-slate-600'}`}>
                {state === 'STREAMING' ? <Loader2 size={12} className={reducedMotion ? '' : 'animate-[spin_1.5s_linear_infinite]'} /> : <CheckCircle size={12} />}
                SSE Adapter
             </div>
         </div>
         
         <div className="text-[10px] text-slate-400 mt-2 italic h-[14px]">
           {state === 'SEARCHING' && "Dense Layer Matrix Extraction..."}
           {state === 'RERANKING' && (isSimulatingLoad ? "Reranker blocked. Thread capacity maxed. Bypassing." : "Cross-Encoder Validating Lexical Array...")}
           {state === 'STREAMING' && "Receiving Async Chunk Stream..."}
         </div>
      </div>
   );
};

export default function Chat() {
  const {
    messages,
    addMessage,
    streamingState,
    setStreamingState,
    error,
    setError,
    updateLastAssistantMessage,
    config,
    logQueryMetrics,
    uiState,
    systemState,
    chatPrefs,
    setChatPrefs,
    applyProfilePreset,
    toggleAnimations,
  } = useAppStore();
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const [expandedTraceId, setExpandedTraceId] = useState(null);
  const [providerStatus, setProviderStatus] = useState({
    checked: false,
    serverGeminiConfigured: false,
    serverOpenrouterConfigured: false,
  });
  const endRef = useRef(null);
  const fileInputRef = useRef(null);

  const scrollToBottom = () => endRef.current?.scrollIntoView({ behavior: uiState.animationsEnabled ? 'smooth' : 'auto' });
  useEffect(() => scrollToBottom(), [messages, streamingState]);

  const resolvedCount = messages.filter((msg) => msg.role === 'assistant' && (msg.meta?.sources?.length || 0) > 0).length;
  const avgCitationCoverage = (() => {
    const assistants = messages.filter((msg) => msg.role === 'assistant');
    if (!assistants.length) return 0;
    const withSources = assistants.filter((msg) => (msg.meta?.sources?.length || 0) > 0).length;
    return Math.round((withSources / assistants.length) * 100);
  })();

  const refreshProviderStatus = async () => {
    try {
      const response = await fetch(PROVIDER_STATUS_URL);
      if (!response.ok) {
        throw new Error(`Provider status failed with status ${response.status}`);
      }

      const payload = await response.json();
      const next = {
        checked: true,
        serverGeminiConfigured: Boolean(payload?.server_gemini_configured),
        serverOpenrouterConfigured: Boolean(payload?.server_openrouter_configured),
      };
      setProviderStatus(next);
      return next;
    } catch {
      const next = {
        checked: true,
        serverGeminiConfigured: false,
        serverOpenrouterConfigured: false,
      };
      setProviderStatus(next);
      return next;
    }
  };

  useEffect(() => {
    if (config.provider === 'gemini' || config.provider === 'openrouter') {
      refreshProviderStatus().catch(() => {});
    }
  }, [config.provider]);

  const handleAttachmentSelect = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    setExtracting(true);
    const extracted = [];

    for (const file of files.slice(0, 4)) {
      const result = await extractTextFromFile(file);
      extracted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        type: file.type || 'file',
        size: file.size || 0,
        extracted_text: result.text,
        status: result.status,
        error: result.error,
      });
    }

    setAttachments((prev) => [...prev, ...extracted].slice(0, 6));
    setExtracting(false);
    event.target.value = '';
  };

  const removeAttachment = (id) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSubmit = async (eOrText) => {
    let queryText = input;
    if (typeof eOrText === 'string') {
       queryText = eOrText;
    } else if (eOrText && eOrText.preventDefault) {
       eOrText.preventDefault();
    }

    if (!queryText.trim() || streamingState === 'STREAMING' || streamingState === 'SEARCHING' || streamingState === 'RERANKING') return;
    
    if (!config.apiKey && config.provider === 'openai') {
      setError("NO_KEY", "OpenAI requires a local API key constraint. Update Settings.");
      return;
    }

    if (!config.apiKey && config.provider === 'gemini') {
      const status = providerStatus.checked ? providerStatus : await refreshProviderStatus();
      if (!status.serverGeminiConfigured) {
        setError("NO_KEY", "Gemini is not configured. Add a client key in Settings or set GEMINI_API_KEY on the server.");
        return;
      }
    }

    if (!config.apiKey && config.provider === 'openrouter') {
      const status = providerStatus.checked ? providerStatus : await refreshProviderStatus();
      if (!status.serverOpenrouterConfigured) {
        setError("NO_KEY", "OpenRouter is not configured. Add a client key in Settings or set OPENROUTER_API_KEY on the server.");
        return;
      }
    }

    const userMsg = { role: 'user', content: queryText };
    addMessage(userMsg);
    setInput('');
    
    setStreamingState('SEARCHING');
    setTimeout(() => { if (useAppStore.getState().streamingState !== 'ERROR') setStreamingState('RERANKING') }, Math.random() * 800 + 400);

    const adapter =
      config.provider === 'openai'
        ? new OpenAIAdapter()
        : config.provider === 'openrouter'
          ? new OpenRouterAdapter()
          : new GeminiAdapter();
    const currentMsgs = [...messages, userMsg];

    addMessage({ role: 'assistant', content: '', meta: null });

    const startTime = performance.now();

    try {
       await adapter.streamResponse(
         currentMsgs,
         config,
         (token) => {
            if (useAppStore.getState().streamingState !== 'STREAMING') setStreamingState('STREAMING');
            updateLastAssistantMessage(token, null)
         },
         (errObj) => { 
            setError("SYS_FAULT", errObj.message || "Adapter failed to bind stream."); 
         },
         (metaInfo) => { 
            const totalMs = performance.now() - startTime;
            logQueryMetrics(totalMs);
            
            // SIMULATED LOAD INJECTION
            let finalMeta = { ...metaInfo, latency: { total_time_ms: totalMs } };
            if (systemState.isSimulatingLoad) {
               finalMeta.generation_notice = "CPU bounded at 82%. Cross-encoder bypassed. Dense vector retrieval passed raw to generator.";
               finalMeta.confidence_label = "low";
            }

            finalMeta.derived_attachments = attachments
              .filter((item) => item.status === 'ready' && String(item.extracted_text || '').trim())
              .map((item) => ({
                name: item.name,
                type: item.type,
                extracted_snippet: String(item.extracted_text || '').slice(0, 220),
              }));
            
            updateLastAssistantMessage('', finalMeta); 
            setStreamingState('COMPLETE'); 
            setAttachments([]);
         }
       ,
       {
         mode: chatPrefs.assistantMode,
         thinking: chatPrefs.thinkingMode,
         attachments: attachments.map((item) => ({
           name: item.name,
           type: item.type,
           size: item.size,
           extracted_text: item.extracted_text,
           extraction_status: item.status,
           extraction_error: item.error,
         })),
         user_profile: {},
       });
    } catch(err) {
       setError("CRIT_FAULT", err.message);
    }
  };

  return (
    <div className="flex flex-col h-full relative max-w-4xl mx-auto w-full">
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.length === 0 ? (
           <div className="flex flex-col items-center justify-center h-full text-center space-y-8 w-full max-w-2xl mx-auto">
              <div className="space-y-4">
                 <div className="w-16 h-16 rounded-full mx-auto bg-white/5 flex items-center justify-center border border-white/10 shadow-[0_0_15px_rgba(83,182,255,0.05)]">
                    <Send size={24} className="text-slate-400" />
                 </div>
                 <p className="text-lg text-paper font-medium">Start Query</p>
                 <p className="text-sm text-slate-400">Plain-language legal guidance for workers, with source citations and confidence signals.</p>
              </div>

              <div className="w-full max-w-md mx-auto grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500">Trust</p>
                  <p className="text-sm text-paper mt-1">Source-Cited</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500">Results</p>
                  <p className="text-sm text-paper mt-1">Worker-First UX</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500">Control</p>
                  <p className="text-sm text-paper mt-1">Mode + Thinking</p>
                </div>
              </div>

              <div className="w-full max-w-md mx-auto grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500">Queries Resolved</p>
                  <p className="text-lg text-paper mt-1">{resolvedCount}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left">
                  <p className="text-[10px] uppercase tracking-widest text-slate-500">Citation Coverage</p>
                  <p className="text-lg text-paper mt-1">{avgCitationCoverage}%</p>
                </div>
              </div>

              {uiState.mode === 'engineer' && (
                 <div className="p-3 border border-dashed border-white/10 rounded-lg text-[10px] font-mono w-full max-w-sm bg-black/20 text-left space-y-1 block mx-auto">
                    <p className="text-slate-600 uppercase tracking-widest mb-2 border-b border-white/5 pb-1">[SYSTEM_READY]</p>
                    <p>ENGINEER_MODE: <span className="text-success">TRUE</span></p>
                    <p>TARGET: <span className="text-accent">{config.modelName}</span></p>
                    <p>THERMAL: <span className={systemState.isSimulatingLoad ? `text-error ${uiState.animationsEnabled ? 'animate-pulse' : ''}` : 'text-success'}>{systemState.isSimulatingLoad ? '82% LOAD SHEDDING' : 'NORMAL'}</span></p>
                 </div>
              )}

              <div className="w-full space-y-3 pt-4">
                 <p className="text-[10px] tracking-widest uppercase text-slate-500 font-mono text-left w-full max-w-md mx-auto">Suggested Questions:</p>
                 <div className="flex flex-col gap-2 w-full max-w-md mx-auto">
                    {SUGGESTED_QUESTIONS.map((q, idx) => (
                       <button
                          key={idx}
                          onClick={() => handleSubmit(q)}
                          className="w-full text-left p-3 border border-white/5 bg-white/[0.02] hover:bg-accent/10 hover:border-accent/30 rounded-xl text-sm text-slate-300 transition duration-300 group flex items-center justify-between"
                       >
                          {q}
                          <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 text-accent transition" />
                       </button>
                    ))}
                 </div>
              </div>
           </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-6 py-4 transition-all duration-300 ${msg.role === 'user' ? 'bg-accent/10 border border-accent/20 text-paper shadow-[0_4px_20px_rgba(83,182,255,0.05)]' : 'bg-white/[0.02] border border-white/10 text-slate-300'}`}>
                
                {/* LAYER 1: Core Payload */}
                <div
                  className={`prose prose-invert max-w-none break-words whitespace-pre-wrap leading-relaxed ${
                    msg.role === 'assistant'
                      ? 'font-sans text-sm'
                      : uiState.mode === 'engineer'
                        ? 'font-mono text-xs'
                        : 'font-sans text-sm'
                  }`}
                >
                  {msg.content || (msg.role==='assistant' && streamingState !== 'STREAMING' ? <span className={`${uiState.animationsEnabled ? 'animate-[pulse_1s_ease-in-out_infinite]' : ''} opacity-50 italic`}>Establishing SSE connection...</span> : '')}
                </div>
                
                {/* LAYER 2 & 3: Metadata & Telemetry */}
                {msg.meta && (
                  <div className={`mt-5 pt-4 flex gap-2 flex-wrap items-center ${uiState.mode === 'engineer' ? 'border-t border-dashed border-white/10' : ''}`}>
                     {msg.meta.derived_attachments && msg.meta.derived_attachments.length > 0 && (
                       <div className="w-full rounded-xl border border-accent/30 bg-accent/10 p-3">
                          <span className="text-[10px] uppercase tracking-widest text-accent font-mono">Derived from attachment</span>
                          <div className="mt-2 flex flex-col gap-2">
                            {msg.meta.derived_attachments.map((item, idx) => (
                              <div key={`${item.name}-${idx}`} className="rounded-lg border border-white/10 bg-black/20 p-2">
                                <p className="text-xs text-slate-200">{item.name}</p>
                                <p className="text-[11px] text-slate-400 mt-1 line-clamp-3">{item.extracted_snippet}</p>
                              </div>
                            ))}
                          </div>
                       </div>
                     )}
                     
                     {msg.meta.confidence_label && (
                       <span className={`px-2 py-1 text-[10px] font-mono border rounded uppercase flex items-center gap-1 ${
                         msg.meta.confidence_label === 'high' ? 'bg-success/10 text-success border-success/20' : 
                         msg.meta.confidence_label === 'medium' ? 'bg-accent/10 text-accent border-accent/20' : 
                         'bg-warning/10 text-warning border-warning/20'
                       }`}>
                         CONF: {msg.meta.confidence_label}
                       </span>
                     )}
                     
                     {msg.meta.sources && msg.meta.sources.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap w-full md:w-auto">
                           {msg.meta.sources.map((src, k) => (
                             <span key={k} className="px-1.5 py-0.5 bg-white/5 text-slate-300 border border-white/10 rounded overflow-hidden text-[10px] truncate max-w-[150px] font-mono">
                               {src.act} § {src.section}
                             </span>
                           ))}
                        </div>
                     )}

                     {msg.meta.generation_notice && (
                       <div className="w-full mt-2 p-2 bg-error/10 border border-error/50 text-error text-xs rounded flex flex-col gap-1 shadow-[0_0_15px_rgba(255,77,77,0.1)]">
                          <span className="flex items-center gap-1 font-semibold text-[10px] uppercase font-mono"><AlertTriangle size={12}/> Fallback Defense Activated</span>
                          <span className={uiState.mode === 'engineer' ? 'font-mono text-[10px] text-red-200' : 'text-red-200'}>{msg.meta.generation_notice}</span>
                       </div>
                     )}

                     {/* TIERED ENGINEER MODE (LAYER 2 & 3) */}
                     {uiState.mode === 'engineer' && (
                        <div className="w-full mt-3 pt-3 border-t border-white/5 flex flex-col gap-2 bg-black/20 p-4 rounded-xl border border-black text-[10px] font-mono text-slate-400">
                           {/* TIER 1 ENGINEER: Overview */}
                           <div className="flex justify-between items-center pb-2 border-b border-white/5">
                              <span>Target Binding:</span>
                              <span className="text-slate-300">[{config.modelName}] @ {(msg.meta.latency?.total_time_ms/1000).toFixed(3)}s</span>
                           </div>
                           
                           {/* TIER 2 ENGINEER: Deep Inspect UI */}
                           <div className="mt-2">
                              <button 
                                 onClick={() => setExpandedTraceId(expandedTraceId === msg.id ? null : msg.id)}
                                 className="flex items-center gap-1.5 text-accent hover:text-white transition uppercase tracking-widest text-[9px] bg-accent/5 px-2 py-1 rounded"
                              >
                                 <ChevronDown size={10} className={`transform transition-transform ${expandedTraceId === msg.id ? 'rotate-180' : ''}`} />
                                 {expandedTraceId === msg.id ? 'Close Trace' : 'View Deep Inspect'}
                              </button>
                              
                              <div className={`overflow-hidden transition-all duration-500 ease-in-out ${expandedTraceId === msg.id ? 'max-h-[500px] opacity-100 mt-4' : 'max-h-0 opacity-0 mt-0'}`}>
                                 <div className="space-y-4 p-3 bg-obsidian rounded border border-white/5 overflow-y-auto max-h-[400px]">
                                    <div>
                                       <span className="text-slate-600 mb-1 block uppercase">Cross-Encoder Memory Array</span>
                                       {msg.meta.meta?.top_rerank_scores ? msg.meta.meta.top_rerank_scores.map((score, rs) => (
                                          <div key={rs} className="flex justify-between items-center text-slate-300 border-b border-white/5 py-1">
                                             <span>Vector_{rs}</span>
                                             <span className={score > 0.8 ? 'text-success' : 'text-warning'}>{score.toFixed(4)}</span>
                                          </div>
                                       )) : <div className="text-error">Array Bypassed (Load Shedding Active)</div>}
                                    </div>
                                    <div>
                                       <span className="text-slate-600 mb-1 block uppercase">Sanitized Generator Prompt</span>
                                       <div className="text-[9px] text-slate-500 whitespace-pre-wrap font-mono p-2 bg-black rounded">
                                          [CONTEXT LENGTH: {msg.meta.meta?.retrieved_chunks || 'N/A'} chunks]{'\n'}
                                          {msg.meta.sources ? msg.meta.sources.map(s => s.snippet.substring(0, 50) + "...").join('\n') : 'No contexts passed.'}
                                       </div>
                                    </div>
                                 </div>
                              </div>
                           </div>
                        </div>
                     )}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        
        <StreamingGovernorIndicator state={streamingState} isSimulatingLoad={systemState.isSimulatingLoad} reducedMotion={!uiState.animationsEnabled} />

        {config.provider === 'gemini' && !config.apiKey && providerStatus.checked && providerStatus.serverGeminiConfigured && (
          <div className="mb-4 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-slate-200">
            Server-side Gemini key detected. Local client key is optional for chat in this environment.
          </div>
        )}

        {config.provider === 'openrouter' && !config.apiKey && providerStatus.checked && providerStatus.serverOpenrouterConfigured && (
          <div className="mb-4 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-slate-200">
            Server-side OpenRouter key detected. Local client key is optional for chat in this environment.
          </div>
        )}

        {messages.length > 0 && (
          <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-[85%]">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-slate-500">Queries Resolved</p>
              <p className="text-xl text-paper mt-1">{resolvedCount}</p>
            </div>
            <div className="rounded-xl border border-accent/25 bg-accent/10 px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-accent">Citation Coverage</p>
              <p className="text-xl text-paper mt-1">{avgCitationCoverage}%</p>
            </div>
          </div>
        )}
        
        {streamingState === 'ERROR' && error && (
           <div className={`flex items-start gap-3 p-4 bg-error/10 border border-error/20 rounded-xl max-w-[85%] ${uiState.animationsEnabled ? 'animate-[pulse_1s_ease-out_1]' : ''}`}>
              <XCircle size={18} className="text-error shrink-0 mt-0.5" />
              <div>
                 <p className="text-xs font-mono text-error font-bold mb-1 tracking-widest uppercase">ERR_CODE: {error.code}</p>
                 <p className="text-sm text-red-100">{error.message}</p>
                 <p className="text-[10px] text-red-400/70 mt-2 font-mono uppercase tracking-widest">Process terminated. Connection context severed.</p>
              </div>
           </div>
        )}
        <div ref={endRef} />
      </div>

      <div className={`p-6 pt-2 select-none z-10 ${uiState.mode === 'engineer' ? 'font-mono' : 'font-sans'}`}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl border border-white/15 bg-white/5 p-1">
            {['worker', 'hr', 'lawyer'].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => applyProfilePreset(preset)}
                className={`px-2.5 py-1 text-[11px] rounded-lg uppercase tracking-widest transition ${chatPrefs.profilePreset === preset ? 'bg-accent/20 text-accent border border-accent/30' : 'text-slate-300 hover:bg-white/10 border border-transparent'}`}
              >
                {preset}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setChatPrefs({ assistantMode: chatPrefs.assistantMode === 'lawyer' ? 'normal' : 'lawyer' })}
            className="px-3 py-1.5 rounded-xl border border-white/15 text-xs text-slate-200 bg-white/5 hover:bg-white/10 transition"
          >
            Mode: {chatPrefs.assistantMode === 'lawyer' ? 'Lawyer' : 'Normal'}
          </button>
          <button
            type="button"
            onClick={() => setChatPrefs({ thinkingMode: chatPrefs.thinkingMode === 'on' ? 'off' : 'on' })}
            className="px-3 py-1.5 rounded-xl border border-white/15 text-xs text-slate-200 bg-white/5 hover:bg-white/10 transition"
          >
            Thinking: {chatPrefs.thinkingMode === 'on' ? 'On' : 'Off'}
          </button>
          <button
            type="button"
            onClick={toggleAnimations}
            className="px-3 py-1.5 rounded-xl border border-white/15 text-xs text-slate-200 bg-white/5 hover:bg-white/10 transition"
          >
            Motion: {uiState.animationsEnabled ? 'On' : 'Reduced'}
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 rounded-xl border border-accent/30 text-xs text-accent bg-accent/10 hover:bg-accent/20 transition"
          >
            Attach Photo/File
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept="image/*,.pdf,.txt,.md,.json,.csv,.xml"
            onChange={handleAttachmentSelect}
          />
          {extracting && <span className="text-xs text-warning">Extracting text...</span>}
        </div>

        {attachments.length > 0 && (
          <div className="mb-3 flex flex-col gap-2">
            {attachments.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2">
                <div className="min-w-0">
                  <p className="text-xs text-slate-200 truncate">{item.name}</p>
                  <p className="text-[11px] text-slate-400">
                    {item.status === 'ready' ? `Text extracted (${item.extracted_text?.length || 0} chars)` : item.error || 'Pending extraction'}
                  </p>
                  {item.status === 'ready' && item.extracted_text && (
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2">{item.extracted_text.slice(0, 160)}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeAttachment(item.id)}
                  className="text-[11px] px-2 py-1 rounded border border-white/15 text-slate-300 hover:bg-white/10"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="relative flex items-center group">
           <textarea 
             value={input}
             onChange={(e) => setInput(e.target.value)}
             onFocus={(e) => e.target.parentElement.classList.add('scale-[1.01]', 'shadow-[0_0_30px_rgba(83,182,255,0.05)')}
             onBlur={(e) => e.target.parentElement.classList.remove('scale-[1.01]', 'shadow-[0_0_30px_rgba(83,182,255,0.05)')}
             onKeyDown={(e) => {
               if (e.key === 'Enter' && !e.shiftKey) {
                 e.preventDefault();
                 handleSubmit();
               }
             }}
             placeholder={uiState.mode === 'product' ? "Start your query about Indian labor law..." : ">> [WAITING] _ Execute lexical query"}
             className={`w-full bg-[#0F1524]/80 backdrop-blur-md border rounded-2xl py-4 pl-5 pr-14 ${uiState.mode === 'engineer' ? 'text-xs' : 'text-sm'} text-paper focus:outline-none resize-none overflow-hidden h-[54px] shadow-sm transition-all duration-300 ${streamingState === 'COMPLETE' ? 'border-accent/50 shadow-[0_0_15px_rgba(83,182,255,0.05)]' : 'border-white/10 hover:border-white/20'}`}
             rows={1}
           />
           <button 
             type="submit"
             disabled={!input.trim() || streamingState === 'STREAMING' || streamingState === 'SEARCHING' || streamingState === 'RERANKING'}
             className="absolute right-3 p-2 bg-white/5 text-accent hover:bg-accent/20 hover:text-white rounded-xl active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
           >
             {(streamingState === 'STREAMING' || streamingState === 'SEARCHING' || streamingState === 'RERANKING') ? <Loader2 size={18} className={`${uiState.animationsEnabled ? 'animate-[spin_1s_linear_infinite]' : ''} text-slate-400`} /> : <Send size={18} />}
           </button>
        </form>
        {uiState.mode === 'engineer' && (
           <div className="text-center mt-3 flex items-center justify-center gap-4 border-t border-white/5 pt-2">
              <span className="text-[10px] text-slate-500 font-mono flex items-center gap-2 uppercase tracking-widest">
                <span className={`w-1.5 h-1.5 rounded-full bg-success ${uiState.animationsEnabled ? 'animate-[pulse_2s_ease-in-out_infinite]' : ''}`}></span>
                SOCKET: {config.provider}
              </span>
           </div>
        )}
      </div>
    </div>
  );
}
