import React from 'react';
import { Mail, Github, Linkedin, ExternalLink, Terminal, ChevronRight, Zap } from 'lucide-react';

export default function Contact() {
  return (
    <div className="max-w-5xl mx-auto py-12 px-8 space-y-24 pb-32 w-full font-sans">
      {/* 1. HERO IDENTITY BLOCK */}
      <section className="flex flex-col md:flex-row items-center md:items-start gap-12 animate-[fadeIn_0.5s_ease-out]">
        <div className="w-48 h-48 md:w-56 md:h-56 shrink-0 rounded-2xl overflow-hidden border border-white/10 shadow-[0_0_40px_rgba(83,182,255,0.1)] relative group">
           <img 
              src="/yash_profile.png" 
              alt="Yash Singh Thakur - AI/ML Engineer" 
              className="w-full h-full object-cover grayscale opacity-80 group-hover:grayscale-0 group-hover:opacity-100 transition duration-700"
              onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
           />
           {/* Fallback box if image missing */}
           <div className="absolute inset-0 bg-obsidian flex-col items-center justify-center text-slate-500 hidden">
              <span className="font-mono text-xs">IMG_NOT_FOUND</span>
           </div>
        </div>
        
        <div className="text-center md:text-left space-y-4 pt-4">
          <h1 className="text-5xl font-display font-bold tracking-tight text-paper mb-2 opacity-0 animate-[fadeIn_0.5s_ease-out_0.08s_fill-mode-forwards]">Yash Singh Thakur</h1>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-accent/10 text-accent font-mono text-sm border border-accent/20 rounded-full opacity-0 animate-[fadeIn_0.5s_ease-out_0.16s_fill-mode-forwards]">
             <Terminal size={14} /> AI/ML Systems Engineer
          </div>
          
          {/* 2. POSITIONING BLOCK */}
          <p className="text-slate-400 text-sm leading-relaxed max-w-xl mt-6 opacity-0 animate-[fadeIn_0.5s_ease-out_0.24s_fill-mode-forwards]">
            <strong>"I build ML systems that expose their own failure modes."</strong><br/><br/>
            I don't just prompt LLMs; I build the backend orchestration pipelines that ground them. 
            My focus is on heavily constrained, production-ready ML architectures targeting OOM boundaries, semantic hallucination, and inference latency over design theater.
          </p>
        </div>
      </section>

      {/* 3. TRADE-OFFS MATRIX (PROVING DEPTH) */}
      <section className="bg-white/[0.01] border border-white/5 p-8 rounded-3xl">
         <h2 className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-8 border-b border-white/10 pb-4">Architectural Decisions & Trade-Offs</h2>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-2">
               <h3 className="font-mono text-xs text-accent uppercase tracking-widest">Why Not Full Dense Retrieval?</h3>
               <p className="text-sm text-slate-300 leading-relaxed border-l border-white/10 pl-4 py-2 bg-black/20">
                  Calculating full MKS embeddings for un-chunked entire legal volumes guarantees OOM issues on deployment targets. Chunking strictly via normalized TF-IDF limits density loads and respects 8GB ceilings.
               </p>
            </div>
            <div className="space-y-2">
               <h3 className="font-mono text-xs text-accent uppercase tracking-widest">Why Build A Custom Governor?</h3>
               <p className="text-sm text-slate-300 leading-relaxed border-l border-white/10 pl-4 py-2 bg-black/20">
                  Rerankers operate entirely on main CPU threads synchronously inside Starlette. A static system will hang all Starlette workers entirely if 15 queries hit simultaneously. The governor enables load shedding.
               </p>
            </div>
         </div>
      </section>

      {/* 4. SYSTEMS LEXICON */}
      <section>
         <h2 className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2"><ChevronRight size={14} className="text-accent"/> Systems Lexicon</h2>
         <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
           {[['ML SYSTEMS', ['FAISS Data Stores', 'Cross-Encoders', 'Quantized Execution']], 
             ['GEN AI / RAG', ['LangChain/LangGraph', 'SSE Streaming FSM', 'Context Overrides']], 
             ['BACKEND ENG', ['FastAPI (Python 3.11)', 'Asyncio Threads', 'WebSockets']], 
             ['DEPLOYMENT', ['Uvicorn Proxies', 'Docker Constraints', 'Zustand Telemetry']]].map((group, i) => (
             <div key={i} className="border border-white/5 bg-white/[0.01] rounded-xl p-5">
               <h3 className="text-[10px] font-mono text-slate-500 mb-3 uppercase tracking-widest">{group[0]}</h3>
               <ul className="space-y-2">
                 {group[1].map(s => <li key={s} className="text-sm text-slate-300 font-mono text-xs hover:text-accent transition">{s}</li>)}
               </ul>
             </div>
           ))}
         </div>
      </section>

      {/* 5. PROJECT PROOF */}
      <section>
         <h2 className="text-xs font-mono text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2"><ChevronRight size={14} className="text-accent"/> Architecture Portfolios</h2>
         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           {[
             { name: "AdhikarAI Engine", problem: "Semantic LLM hallucination on strict Indian Labor Laws.", solution: "Normalized BM25/FAISS routing filtered by Cross-Encoder limiters.", constraint: "Must run on i5/8GB RAM machine without dying.", result: "0 to ~1.2s inference retrieval with 0.0% ungrounded output." },
             { name: "Spam Classification Edge", problem: "Real-time stream blocking without heavy VRAM.", solution: "Binary text classifier optimized via light TF-IDF routing.", constraint: "Must execute in <100ms per payload.", result: "Sub 50ms classification throughput." },
             { name: "Movie Reranker Model", problem: "Cold-start recommendation latency scaling.", solution: "Memory-optimized collaborative filtering avoiding dense sparse matrices.", constraint: "Server cost capping.", result: "-40% RAM usage vs standard ALS algorithm." },
           ].map((p, i) => (
             <div key={i} className="p-6 bg-[#0B101E] border border-white/5 rounded-2xl hover:border-accent/30 transition group duration-300 flex flex-col h-full relative overflow-hidden -translate-y-0 hover:-translate-y-1">
               <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none text-6xl font-black font-mono duration-300 group-hover:scale-110">0{i+1}</div>
               <h3 className="font-semibold text-paper mb-4 flex items-center justify-between relative z-10">
                 {p.name}
                 <ExternalLink size={14} className="text-slate-500 opacity-0 group-hover:opacity-100 transition" />
               </h3>
               <div className="space-y-3 relative z-10 flex-1">
                 <div><span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Problem: </span><span className="text-xs text-slate-300">{p.problem}</span></div>
                 <div className="group-hover:drop-shadow-[0_0_8px_rgba(255,200,0,0.5)] transition"><span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Constraint: </span><span className="text-xs text-warning">{p.constraint}</span></div>
                 <div><span className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Solution: </span><span className="text-xs text-slate-300">{p.solution}</span></div>
               </div>
               <div className="mt-6 pt-4 border-t border-white/5 flex justify-between items-end relative z-10 group-hover:bg-success/5 p-2 rounded transition">
                  <div className="text-right w-full"><span className="text-[10px] text-success font-mono uppercase tracking-widest">Result: </span><span className="text-xs text-success italic font-bold">{p.result}</span></div>
               </div>
             </div>
           ))}
         </div>
      </section>

      {/* 6. CONTACT CTA */}
      <section className="bg-gradient-to-r from-[#0B101E] to-[#0A162B] p-10 rounded-3xl border border-accent/20 text-center space-y-6 relative overflow-hidden">
         <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-accent to-transparent"></div>
         <h2 className="text-2xl font-display font-medium text-paper">Examine The Infrastructure</h2>
         <p className="text-slate-400 font-mono text-xs uppercase max-w-md mx-auto">Initiate contact protocol for System Engineering, ML Infrastructure, or Architecture positions.</p>
         <div className="flex justify-center gap-6">
           <a href="mailto:yash@example.com" className="px-6 py-3 border border-white/10 bg-white/5 rounded-xl hover:bg-accent/10 hover:text-accent hover:border-accent/40 text-slate-300 transition flex items-center gap-2 text-sm font-mono"><Mail size={16} /> yash@example.com</a>
           <a href="#" className="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-accent/10 hover:text-accent hover:border-accent/40 text-slate-300 transition"><Github size={20} /></a>
           <a href="#" className="p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-accent/10 hover:text-accent hover:border-accent/40 text-slate-300 transition"><Linkedin size={20} /></a>
         </div>
      </section>
    </div>
  );
}
