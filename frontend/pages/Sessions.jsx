import { Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Button from "../components/ui/button";
import { useChatContext } from "../hooks/chat-context";

export default function SessionsPage() {
  const navigate = useNavigate();
  const { sessions, activeSessionId, setActiveSessionId, createSession, deleteSession } = useChatContext();
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return sessions;
    return sessions.filter((session) => {
      const title = String(session.title || "").toLowerCase();
      const content = (session.messages || []).map((msg) => String(msg.content || "").toLowerCase()).join(" ");
      return title.includes(needle) || content.includes(needle);
    });
  }, [search, sessions]);

  return (
    <section className="glass-card rounded-2xl p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-400">History</p>
          <h2 className="text-xl font-semibold text-slate-100">Sessions</h2>
        </div>
        <Button type="button" onClick={createSession}>New Session</Button>
      </div>

      <div className="relative mb-3">
        <Search size={14} className="pointer-events-none absolute left-2 top-2.5 text-slate-500" />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search sessions"
          className="w-full rounded-xl border border-stroke bg-slate-950/45 py-2 pl-8 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent/70"
        />
      </div>

      <div className="space-y-2">
        {filtered.map((session) => (
          <button
            key={session.id}
            type="button"
            onClick={() => {
              setActiveSessionId(session.id);
              navigate("/chat");
            }}
            className={`w-full rounded-xl border px-3 py-3 text-left transition ${
              session.id === activeSessionId ? "border-accent/60 bg-accent/15" : "border-stroke bg-white/5 hover:bg-white/10"
            }`}
          >
            <p className="truncate text-sm text-slate-100">{session.title || "New Session"}</p>
            <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
              <span>{session.messages?.length || 0} messages</span>
              <span>{new Date(session.updatedAt).toLocaleDateString()}</span>
            </div>
            <div className="mt-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={(event) => {
                  event.stopPropagation();
                  deleteSession(session.id);
                }}
              >
                <Trash2 size={13} className="mr-1" />
                Remove
              </Button>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
