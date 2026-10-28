import React from 'react';
import { useAppStore } from '../store/useAppStore';
import { Network, Search, Layers, ChevronRight } from 'lucide-react';

export default function ChatDetails() {
  const { messages } = useAppStore();

  const assistantMessages = messages.filter(m => m.role === 'assistant' && !!m.meta);

  return (
    <div className="p-10 max-w-6xl mx-auto w-full pb-32 font-mono">
       <div className="border-b border-warning/20 pb-8 mb-12">
          <h1 className="text-3xl font-semibold tracking-tight text-paper mb-3">TELEMETRY_LOGS</h1>
          <p className="text-slate-400 text-sm max-w-2xl leading-relaxed">
            The standard UI abstracts hallucination mechanics. This terminal explicitly exposes the literal semantic thresholds, raw FAISS dense bounds, and computed Cross-Encoder arrays generating the prompt contexts.
          </p>
       </div>

       {assistantMessages.length === 0 ? (
         <div className="p-12 border border-dashed border-white/10 rounded-3xl flex flex-col items-center justify-center text-center space-y-4 text-slate-500 bg-white/[0.01]">
            <Search size={32} className="text-slate-600 mb-2" />
            <p className="text-sm max-w-md uppercase tracking-widest text-slate-600">Trace Log Empty. Execute a semantic query to populate vectors.</p>
         </div>
       ) : (
         <div className="space-y-16">
         {assistantMessages.map((msg, i) => (
           <div key={i} className="relative">
              <div className="absolute -left-6 top-0 bottom-0 w-px bg-white/10"></div>
              <div className="absolute -left-[29px] top-4 w-3 h-3 rounded-full bg-obsidian border-2 border-accent"></div>
              
              <h3 className="text-xs uppercase tracking-widest text-accent mb-6">Execution Vector Trace: #{msg.id.split('-')[0]}</h3>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                 <div className="p-4 bg-white/[0.02] rounded-xl border border-white/5 shadow-sm">
                    <div className="flex items-center gap-2 mb-2 opacity-60"><Network size={14}/> <p className="text-[10px] tracking-widest uppercase text-paper">Generation Adapter</p></div>
                    <p className="text-lg font-medium text-slate-200">{msg.meta.meta?.provider || 'Gemini Local Tunnel'}</p>
                 </div>
                 <div className="p-4 bg-white/[0.02] rounded-xl border border-white/5 shadow-sm">
                    <div className="flex items-center gap-2 mb-2 opacity-60"><Layers size={14}/> <p className="text-[10px] tracking-widest uppercase text-paper">FAISS Nodes Pinned</p></div>
                    <p className="text-lg font-medium text-slate-200">{msg.meta.meta?.retrieved_chunks || (msg.meta.sources ? msg.meta.sources.length : 0)}</p>
                 </div>
                 <div className="p-4 bg-white/[0.02] rounded-xl border border-white/5 shadow-sm">
                    <div className="flex items-center gap-2 mb-2 opacity-60"><Search size={14}/> <p className="text-[10px] tracking-widest uppercase text-paper">Mean Confidence</p></div>
                    <p className={`text-lg ${msg.meta.confidence_label === 'high' ? 'text-success' : 'text-warning'}`}>{msg.meta.confidence_label ? msg.meta.confidence_label.toUpperCase() : 'N/A'}</p>
                 </div>
                 <div className="p-4 bg-white/[0.02] rounded-xl border border-white/5 shadow-sm">
                    <div className="flex items-center gap-2 mb-2 opacity-60"><ChevronRight size={14}/> <p className="text-[10px] tracking-widest uppercase text-paper">Stream Latency</p></div>
                    <p className="text-lg text-paper">{msg.meta.latency?.total_time_ms ? (msg.meta.latency.total_time_ms/1000).toFixed(3) : 'ERR'}s</p>
                 </div>
              </div>

              {msg.meta.meta?.top_rerank_scores && (
                <div className="space-y-4">
                  <h4 className="text-[10px] uppercase text-slate-500 mb-2 tracking-widest">Cross-Encoder Memory Array (Top-K Passed Context)</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                     {msg.meta.meta.top_rerank_scores.map((score, index) => (
                        <div key={index} className="flex flex-col p-4 bg-black/40 border border-accent/10 rounded-lg">
                           <div className="flex justify-between items-center mb-2">
                              <span className="text-[10px] text-slate-500">Chunk Reference [{index}]</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ${score > 0.8 ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>
                                Score: {score.toFixed(4)}
                              </span>
                           </div>
                           <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                             {msg.meta.sources && msg.meta.sources[index] ? msg.meta.sources[index].snippet : '[Lexical fragment isolated]'}
                           </p>
                        </div>
                     ))}
                  </div>
                </div>
              )}
           </div>
         ))}
         </div>
       )}
    </div>
  );
}
