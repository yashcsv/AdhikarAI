import { Bot, KeyRound, LayoutDashboard, MessageSquare, Settings2, TimerReset } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useChatContext } from "../hooks/chat-context";

function navClass({ isActive }) {
  return `flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition ${
    isActive ? "bg-accent/20 text-slate-100" : "text-slate-300 hover:bg-white/10"
  }`;
}

function keyStatusLabel(status) {
  if (status === "saved") return "Saved";
  if (status === "invalid") return "Invalid";
  return "Not set";
}

export default function AppShell({ children }) {
  const { gemini, model, needsGeminiKey } = useChatContext();

  return (
    <div className="min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="glass-card mb-4 rounded-2xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-stroke bg-white/5 p-2">
                <Bot size={20} className="text-accent" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">AdhikarAI</p>
                <p className="text-lg font-semibold text-slate-100">Legal Intelligence Workspace</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span className="rounded-full border border-stroke bg-white/5 px-3 py-1">Model: {model}</span>
              <span className="rounded-full border border-stroke bg-white/5 px-3 py-1">Gemini key: {keyStatusLabel(gemini.status)}</span>
            </div>
          </div>
          {needsGeminiKey ? (
            <div className="mt-3 rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
              Gemini mode requires your API key. Open Setup to add it before sending prompts.
            </div>
          ) : null}
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[230px_1fr]">
          <aside className="glass-card rounded-2xl p-3">
            <nav className="space-y-1">
              <NavLink to="/chat" className={navClass}>
                <MessageSquare size={15} />
                Chat
              </NavLink>
              <NavLink to="/sessions" className={navClass}>
                <TimerReset size={15} />
                Sessions
              </NavLink>
              <NavLink to="/setup" className={navClass}>
                <KeyRound size={15} />
                Setup
              </NavLink>
              <NavLink to="/settings" className={navClass}>
                <Settings2 size={15} />
                Settings
              </NavLink>
            </nav>
            <div className="mt-4 rounded-xl border border-stroke bg-white/5 p-3 text-xs text-slate-400">
              <div className="mb-1 inline-flex items-center gap-1 text-slate-300">
                <LayoutDashboard size={13} />
                Workspace notes
              </div>
              Configure Gemini once, then use Chat + Sessions for daily legal workflows.
            </div>
          </aside>

          <main>{children}</main>
        </div>
      </div>
    </div>
  );
}
