import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { MessageSquare, LayoutDashboard, Settings2, ShieldCheck, Mail, Sparkles, Clock, MonitorCog, PanelLeftClose } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

export default function MainLayout() {
  const location = useLocation();
  const { uiState, toggleMode } = useAppStore();

  const navClass = (path) => `flex items-center gap-3 px-4 py-2.5 rounded-xl transition font-sans font-medium text-sm ${
    location.pathname === path ? "bg-[#53B6FF]/10 text-accent" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
  }`;

  return (
    <div className={`flex bg-obsidian text-paper min-h-screen selection:bg-accent/30 ${uiState.mode === 'engineer' ? 'font-mono' : 'font-sans'}`}>
      <aside className="w-64 border-r border-white/5 flex flex-col p-4 bg-[#05050A]">
        <Link to="/" className="text-xl font-display font-bold mb-8 px-4 flex items-center gap-2 text-white">
          <Sparkles className="text-accent" size={20} />
          AdhikarAI.
        </Link>
        <nav className="flex-1 space-y-1">
          <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest px-4 mb-2">Platform</div>
          <Link to="/" className={navClass('/')}><LayoutDashboard size={18} /> Home Overview</Link>
          <Link to="/chat" className={navClass('/chat')}><MessageSquare size={18} /> Chat Interface</Link>
          {uiState.mode === 'engineer' && (
             <Link to="/details" className={navClass('/details')}><MonitorCog size={18} /> Telemetry Logs</Link>
          )}
          <Link to="/dashboard" className={navClass('/dashboard')}><Clock size={18} /> Analytics</Link>
          <Link to="/settings" className={navClass('/settings')}><Settings2 size={18} /> Settings</Link>
          
          <div className="my-6 border-t border-white/5 pt-6 space-y-1">
            <div className="text-[10px] font-mono text-slate-500 uppercase tracking-widest px-4 mb-2">Company</div>
            <Link to="/contact" className={navClass('/contact')}><Mail size={18} /> Core Architect</Link>
            <Link to="/privacy" className={navClass('/privacy')}><ShieldCheck size={18} /> Integrity & Trust</Link>
          </div>
        </nav>

        <div className="mt-auto p-4 bg-white/5 rounded-xl border border-white/10 text-[10px] font-mono text-slate-400">
           <span className="flex h-1.5 w-1.5 rounded-full bg-success mb-2 animate-pulse"></span>
           i5 / 8GB Constraint Active.
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 relative h-screen">
        {/* Global Dual Mode Header */}
        <header className="h-14 border-b border-white/5 flex justify-end items-center px-6 shrink-0 bg-[#05050A]/50 backdrop-blur-md sticky top-0 z-50">
           <div className="flex items-center gap-3">
              <span className={`text-[10px] font-mono uppercase tracking-widest transition ${uiState.mode === 'product' ? 'text-accent' : 'text-slate-500'}`}>Product View</span>
              
              <button 
                onClick={toggleMode}
                className="w-10 h-5 bg-white/10 rounded-full relative focus:outline-none focus:ring-1 focus:ring-accent"
              >
                 <div className={`absolute top-0.5 w-4 h-4 rounded-full transition-all duration-300 ${uiState.mode === 'engineer' ? 'bg-error right-0.5' : 'bg-accent left-0.5'}`} />
              </button>
              
              <span className={`text-[10px] font-mono uppercase tracking-widest flex items-center gap-1 transition ${uiState.mode === 'engineer' ? 'text-error' : 'text-slate-500'}`}>
                 <PanelLeftClose size={12}/> Engineer Mode
              </span>
           </div>
        </header>

        <div className="flex-1 overflow-y-auto w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
