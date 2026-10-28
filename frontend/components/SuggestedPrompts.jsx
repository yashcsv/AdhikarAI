const DEFAULT_PROMPTS = [
  "What is minimum wage in India?",
  "What is gratuity?",
  "Who can get maternity benefits?",
  "What are normal working hours?",
  "When do overtime rules apply?",
];

export default function SuggestedPrompts({ prompts = DEFAULT_PROMPTS, onSelect, disabled = false }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {prompts.map((prompt) => (
        <button
          key={prompt}
          type="button"
          disabled={disabled}
          className="rounded-lg border border-stroke bg-white/5 px-3 py-1.5 text-xs text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => onSelect?.(prompt)}
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}
