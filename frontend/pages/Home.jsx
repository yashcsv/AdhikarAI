import React, { useState, useEffect } from 'react';
import { Database, Zap, FileSearch, ArrowRight, ServerCrash, Cpu, CheckCircle2, FlaskConical, AlertTriangle, Play } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

const SystemSnapshot = () => {
   const [step, setStep] = useState(0);
   useEffect(() => {
      const timers = [
         setTimeout(() => setStep(1), 1200), // Types query
         setTimeout(() => setStep(2), 2500), // Reranks
         setTimeout(() => setStep(3), 3200)  // Completes
      ];
      return () => timers.forEach(clearTimeout);
   }, []);

   return (
      <div className="mb-10 w-full max-w-2xl bg-[#05050A] border border-white/10 rounded-xl p-5 shadow-[0_0_30px_rgba(83,182,255,0.03)] font-mono text-xs overflow-hidden h-[120px] relative">
         <div className="absolute top-0 left-0 h-1 bg-accent/20 w-full">
            <div className={`h-full bg-accent transition-all ease-out duration-[3200ms] ${step > 0 ? 'w-full' : 'w-0'}`} />
         </div>
         <div className="flex justify-between items-center mb-3">
             <span className="text-slate-500 uppercase tracking-widest flex items-center gap-2"><Play size={10} className="text-accent" /> Live System Snapshot</span>
             {step >= 3 ? <span className="text-success">[COMPLETED]</span> : <span className="text-accent animate-pulse">[EXECUTING]</span>}
         </div>
         
         <div className="flex flex-col gap-2">
            <div className="flex gap-2">
               <span className="text-accent">{'>'} Query: </span>
               <span className="text-paper">{step >= 1 ? '"What are the termination rules?"' : <span className="animate-ping w-1 h-3 bg-accent inline-block" />}</span>
            </div>
            
            {step >= 2 && (
               <div className="flex gap-2 text-slate-400">
                  <span className="text-warning">{'>'} Validation: </span>
                  <span>MiniLM Rerank Threshold Passed (0.84)</span>
               </div>
            )}

            {step >= 3 && (
               <div className="flex justify-between items-end border-t border-white/5 pt-2 mt-1">
                  <div className="flex gap-2 text-slate-400">
                     <span className="text-success">{'>'} Payload: </span>
                     <span>Grounding established (Industrial Disputes Act, § 25F)</span>
                  </div>
                  <span className="text-[10px] text-slate-500 bg-white/5 px-1.5 py-0.5 rounded">1.14s</span>
               </div>
            )}
         </div>
      </div>
   );
};

const InteractiveArchitecture = () => {
   const [activeNode, setActiveNode] = useState(null);
   const { systemState } = useAppStore();

   const nodes = [
     { id: 'query', label: 'User Query', icon: Zap, status: 'Active', desc: 'Raw input parsed and sanitized.' },
     { id: 'retrieval', label: 'FAISS Dense Search', icon: Database, status: 'RAM Heavy', desc: 'Loads 300MB similarity matrix to retrieve top 50 fragments.' },
     { id: 'rerank', label: 'MiniLM-L6 Cross-Encoder', icon: Cpu, status: 'Bottleneck', desc: 'Runs sequential interference. Bypassed automatically if CPU > 80%.' },
     { id: 'generation', label: 'Any-Model Adapter', icon: CheckCircle2, status: 'I/O Bound', desc: 'Final context pushed via SSE. Supports partial stream recovery.' }
   ];

   return (
     <div className="bg-[#0B101E] border border-white/5 rounded-3xl p-8 overflow-hidden relative group font-sans">
       <div className={`absolute inset-0 bg-gradient-to-br ${systemState.isSimulatingLoad ? 'from-error/5' : 'from-accent/5'} to-transparent opacity-0 group-hover:opacity-100 transition duration-700`}></div>
       <h3 className="text-xl font-medium text-paper mb-8 relative z-10 flex items-center justify-between">
          <span className="flex items-center gap-3">
             <Database size={20} className="text-accent" />
             Interactive System Pipeline
          </span>
       </h3>
       
       <div className="flex flex-col md:flex-row items-center justify-between gap-4 relative z-10">
         {nodes.map((node, idx) => (
            <React.Fragment key={node.id}>
               <div 
                  onMouseEnter={() => setActiveNode(node.id)}
                  onMouseLeave={() => setActiveNode(null)}
                  className={`flex-1 p-4 rounded-xl border transition-all cursor-crosshair duration-300 w-full ${(node.id === 'rerank' && systemState.isSimulatingLoad) ? 'bg-error/10 border-error/50 shadow-[0_0_20px_rgba(255,77,77,0.15)] line-through opacity-80' : activeNode === node.id ? 'bg-accent/10 border-accent/50 shadow-[0_0_20px_rgba(83,182,255,0.15)]' : 'bg-white/[0.02] border-white/10 opacity-70 hover:opacity-100'}`}
               >
                  <div className="flex justify-between items-start mb-3">
                     <node.icon size={20} className={node.id === 'rerank' && systemState.isSimulatingLoad ? 'text-error' : activeNode === node.id ? 'text-accent' : 'text-slate-400'} />
                     <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${node.status === 'Bottleneck' ? 'bg-error/20 text-error' : 'bg-black/30 text-slate-400'} ${(node.id === 'rerank' && systemState.isSimulatingLoad) ? 'animate-pulse' : ''}`}>
                        {node.id === 'rerank' && systemState.isSimulatingLoad ? 'BYPASSED' : node.status}
                     </span>
                  </div>
                  <p className="text-sm font-medium text-slate-200">{node.label}</p>
                  
                  <div className={`mt-3 text-xs text-slate-400 overflow-hidden transition-all duration-300 ${activeNode === node.id ? 'max-h-24 opacity-100' : 'max-h-0 opacity-0'}`}>
                     {node.id === 'rerank' && systemState.isSimulatingLoad ? 'WARNING: CPU > 80%. Cross-encoder disabled to prevent Starlette thread blocking.' : node.desc}
                  </div>
               </div>
               {idx < nodes.length - 1 && (
                  <ArrowRight size={20} className="text-white/10 hidden md:block shrink-0" />
               )}
            </React.Fragment>
         ))}
       </div>
     </div>
   );
};

export default function Home() {
   const { uiState, systemState, toggleSimulateLoad, telemetry } = useAppStore();

  return (
    <div className="p-10 max-w-6xl mx-auto space-y-24 w-full pb-32">
      <section className="space-y-8 pt-12 relative flex items-center h-auto min-h-[50vh]">
        <div className="z-10 space-y-8 relative w-full">
           <SystemSnapshot />
           
           <div className="inline-flex flex-col md:flex-row gap-3 md:items-center">
              <span className="px-3 py-1 bg-accent/10 text-accent border border-accent/20 rounded-full text-xs font-mono uppercase tracking-widest">
                 System Identity Layer
              </span>
              <span className="text-xs font-mono text-slate-500 flex items-center gap-2">
                 <span className={`w-1.5 h-1.5 rounded-full ${systemState.isSimulatingLoad ? 'bg-error' : 'bg-success'} animate-[pulse_2s_ease-in-out_infinite]`} /> 
                 {systemState.isSimulatingLoad ? 'CPU SPIKE DETECTED (82%)' : 'i5 / 8GB Profile Constraints'}
              </span>
           </div>
           
           <h1 className="text-5xl md:text-7xl font-display font-semibold tracking-tight text-paper leading-[1.1] max-w-4xl">
             A resource-constrained RAG system that exposes its own failure modes instead of hiding them.
           </h1>
           <div className="text-lg font-sans text-slate-400 max-w-2xl leading-relaxed space-y-4">
             <p>Most projects hide complexity. <strong>AdhikarAI exposes it.</strong></p>
             <p className="text-sm border-l-2 border-accent/50 pl-4 py-1 italic hover:border-accent transition duration-300">
               "Built under real constraints. Designed to expose the truth, not hide it."
             </p>
           </div>
           
           <div className="pt-4 border-t border-white/5">
              <button 
                 onClick={toggleSimulateLoad}
                 className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-mono text-xs uppercase tracking-widest transition border ${systemState.isSimulatingLoad ? 'bg-error/10 text-error border-error/30 hover:bg-error/20' : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'}`}
              >
                 {systemState.isSimulatingLoad ? <AlertTriangle size={14}/> : <FlaskConical size={14}/>}
                 {systemState.isSimulatingLoad ? 'Restore Resources' : 'Simulate System Under Load'}
              </button>
           </div>
        </div>
        
        {/* Background Stream Simulation (Hardware Gov-Aware) */}
        {uiState.animationsEnabled && (
           <div className="absolute right-0 top-0 w-full h-full pointer-events-none opacity-[0.03] select-none text-xs font-mono break-words overflow-hidden text-success z-0 transition duration-1000">
             {Array.from({ length: 400 }).map((_, i) => (
                <span key={i} className="inline-block mr-2 mb-1 animate-[pulse_4s_ease-in-out_infinite]" style={{animationDelay: `${Math.random() * 4}s`}}>
                   {Math.random().toString(36).substring(2, 8)}
                </span>
             ))}
           </div>
        )}
      </section>

      <section className="font-sans">
         <h2 className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-6">System Capabilities</h2>
         <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
           {[
             { title: "Pure Retrieval", icon: Database, desc: "Normalized hybrid pipeline merging BM25 sparse lexical tokens and FAISS dense representations." },
             { title: "Evaluated Execution", icon: FileSearch, desc: "MiniLM enforces strict zero-shot hallucination boundaries before prompt injection." },
             { title: "Any-API Streamer", icon: Zap, desc: "Finite State Machine intercepts Gemini/OpenAI/OpenRouter streams, caching partial yields if the socket severs." },
             { title: "Load Shedding", icon: ServerCrash, desc: "psutil actively monitors host CPU usage, elegantly dropping specific inference paths to prevent Starlette worker collapse." }
           ].map((f, i) => (
             <div key={i} className="p-6 bg-white/[0.02] border border-white/10 rounded-2xl group hover:bg-[#0B101E] transition duration-300">
                <f.icon className="text-accent mb-4 opacity-70 group-hover:opacity-100 transition" size={24} />
                <h3 className="text-sm font-medium text-slate-200 mb-2">{f.title}</h3>
                <p className="text-xs text-slate-400 leading-relaxed text-pretty">{f.desc}</p>
             </div>
           ))}
         </div>
      </section>

      <InteractiveArchitecture />

         <section className="font-sans space-y-6">
             <h2 className="text-xs font-mono text-slate-500 uppercase tracking-widest">Portfolio Trust Narrative</h2>
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="rounded-2xl border border-accent/20 bg-accent/5 p-6">
                     <p className="text-[10px] tracking-widest uppercase text-accent">Queries Processed</p>
                     <p className="text-4xl text-paper mt-2 font-semibold">{telemetry.totalQueries}</p>
                     <p className="text-sm text-slate-400 mt-2">Live count demonstrates product usage realism for hiring review.</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                     <p className="text-[10px] tracking-widest uppercase text-slate-400">Average Latency</p>
                     <p className="text-4xl text-paper mt-2 font-semibold">{telemetry.avgLatencyMs ? `${Math.round(telemetry.avgLatencyMs)}ms` : 'N/A'}</p>
                     <p className="text-sm text-slate-400 mt-2">Performance signal with production-like observability posture.</p>
                  </div>
                  <div className="rounded-2xl border border-success/20 bg-success/10 p-6">
                     <p className="text-[10px] tracking-widest uppercase text-success">Trust Proof</p>
                     <p className="text-4xl text-paper mt-2 font-semibold">Source-Cited</p>
                     <p className="text-sm text-slate-300 mt-2">Every answer includes traceable references, critical for legal product trust.</p>
                  </div>
             </div>
         </section>

    </div>
  );
}
