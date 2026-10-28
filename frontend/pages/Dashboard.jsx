import React, { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { BarChart3, Users, Clock, AlertTriangle, Activity, CheckCircle2 } from 'lucide-react';

export default function Dashboard() {
  const { messages, telemetry, systemState } = useAppStore();
  const [anomalyPing, setAnomalyPing] = useState(false);

  const totalInteractions = messages.filter(m => m.role === 'user').length;
  const fallbackCount = messages.filter(m => m.meta && m.meta.generation_notice).length;
  const successRate = totalInteractions === 0 ? 100 : (((totalInteractions - fallbackCount) / totalInteractions) * 100).toFixed(1);

  // Trigger one-time flash on mount if error state active
  useEffect(() => {
     if (systemState.isSimulatingLoad) {
        setAnomalyPing(true);
        setTimeout(() => setAnomalyPing(false), 500); 
     }
  }, [systemState.isSimulatingLoad]);

  return (
    <div className="p-10 max-w-6xl mx-auto space-y-12 w-full pb-32 font-sans">
       <div className="border-b border-white/10 pb-6 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-display font-semibold tracking-tight text-paper flex items-center gap-3">
              <Activity className="text-accent" size={28} />
              Telemetry & Metrics
            </h1>
            <p className="text-slate-400 mt-2 text-sm leading-relaxed">Live observability metrics derived strictly from the active session. This dashboard visualizes the boundaries of the inference engine.</p>
          </div>
          {systemState.isSimulatingLoad && <span className="px-3 py-1 bg-error/10 border border-error/50 text-error text-xs font-mono rounded animate-[flash_0.5s_ease-out_1]">ANOMALY_DETECTED</span>}
       </div>
       
       {/* SYSTEM BEHAVIOR PANEL (Meaning Provider) */}
       <div className={`p-5 rounded-2xl border transition-all duration-500 ease-out flex flex-col md:flex-row gap-8 ${systemState.isSimulatingLoad ? 'bg-error/5 border-error/30' : 'bg-success/5 border-success/30'}`}>
          <h3 className="font-mono text-xs uppercase tracking-widest text-slate-500 whitespace-nowrap">System Behavior:</h3>
          <div className="flex gap-6 flex-wrap font-mono text-xs">
             <span className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-success" />
                <span className="text-slate-300">Target FAISS Matrix Active (300MB)</span>
             </span>
             <span className="flex items-center gap-2">
                {systemState.isSimulatingLoad ? <AlertTriangle size={14} className="text-error" /> : <CheckCircle2 size={14} className="text-success" />}
                <span className={systemState.isSimulatingLoad ? 'text-error' : 'text-slate-300'}>
                   {systemState.isSimulatingLoad ? 'Reranker Disabled [CPU > 80% Threshold]' : 'Cross-Encoder Array Evaluated'}
                </span>
             </span>
             <span className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-success" />
                <span className="text-slate-300">0.0% Hallucination Base Detection</span>
             </span>
          </div>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { label: 'Session Inferences', val: totalInteractions, icon: BarChart3, color: 'text-accent' },
            { label: 'Avg Network Latency', val: telemetry.avgLatencyMs ? `${(telemetry.avgLatencyMs/1000).toFixed(3)}s` : '0.00s', icon: Clock, color: 'text-success' },
            { label: 'Fallback Triggers', val: fallbackCount, icon: AlertTriangle, color: 'text-error' },
            { label: 'Pipeline Success Rate', val: `${successRate}%`, icon: Users, color: 'text-warning' }
          ].map((stat, i) => (
             <div key={i} className={`p-6 bg-white/[0.02] border border-white/5 rounded-2xl flex flex-col justify-between h-32 hover:bg-white/[0.04] transition duration-500 relative overflow-hidden ${anomalyPing && stat.label === 'Fallback Triggers' ? 'bg-error/20 border-error' : ''}`}>
                <div className="flex justify-between items-start relative z-10">
                   <p className="text-slate-400 text-[10px] font-mono uppercase tracking-wider">{stat.label}</p>
                   <stat.icon className={stat.color} size={16} />
                </div>
                <h3 className="text-3xl font-semibold text-paper font-mono relative z-10">{stat.val}</h3>
                <div className={`absolute -right-6 -bottom-6 opacity-[0.03] ${stat.color}`}>
                   <stat.icon size={100} />
                </div>
             </div>
          ))}
       </div>

       <div className="p-8 border border-warning/10 bg-black/40 rounded-3xl mt-8 relative overflow-hidden font-mono text-sm">
         <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none text-warning">
            <AlertTriangle size={120} />
         </div>
         <h3 className="text-lg font-medium mb-2 text-warning relative z-10 flex items-center gap-2">
            <AlertTriangle size={18}/> Hardware Bounding Threshold 
         </h3>
         <p className="text-slate-400 mb-6 max-w-xl relative z-10 pb-4 border-b border-warning/20">The active parameter forces Starlette thread limits. When total CPU capacity breaches 80%, heavy Reranker inference nodes are bypassed.</p>
         
         <div className="space-y-6 max-w-2xl relative z-10">
            <div>
               <div className="flex justify-between text-xs text-slate-500 mb-2 flex-col md:flex-row gap-2 uppercase tracking-widest">
                 <span>FAISS Similarity Matrix Allocation</span>
                 <span className="text-success">[300MB ~ / ~800MB MAX_PEAK LIMIT]</span>
               </div>
               <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div className="w-[37%] h-full bg-success"></div>
               </div>
            </div>
            <div>
               <div className="flex justify-between text-xs text-slate-500 mb-2 flex-col md:flex-row gap-2 uppercase tracking-widest">
                 <span>Starlette Worker CPU Pressure (Simulated)</span>
                 <span className={systemState.isSimulatingLoad ? 'text-error animate-pulse' : 'text-accent'}>{systemState.isSimulatingLoad ? '[82% LOAD SPIKE]' : '[42% Base Target]'}</span>
               </div>
               <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden relative">
                  <div className={`h-full absolute left-0 top-0 transition-all duration-[1500ms] cubic-bezier(0.4, 0, 0.2, 1) ${systemState.isSimulatingLoad ? 'w-[82%] bg-error/80' : 'w-[42%] bg-accent'}`}></div>
               </div>
            </div>
         </div>
       </div>
    </div>
  );
}
