import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { Save, CheckCircle2 } from 'lucide-react';

const DEFAULT_MODEL_BY_PROVIDER = {
  gemini: 'gemini-1.5-flash',
  openai: 'gpt-4o-mini',
  openrouter: 'openai/gpt-4o-mini',
};

function nextModelForProvider(provider, currentModel) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const model = String(currentModel || '').trim();
  const lowerModel = model.toLowerCase();

  if (normalizedProvider === 'openrouter') {
    return model && model.includes('/') ? model : DEFAULT_MODEL_BY_PROVIDER.openrouter;
  }

  if (normalizedProvider === 'openai') {
    return model && !model.includes('/') && !lowerModel.includes('gemini')
      ? model
      : DEFAULT_MODEL_BY_PROVIDER.openai;
  }

  return model && !model.includes('/') && lowerModel.includes('gemini')
    ? model
    : DEFAULT_MODEL_BY_PROVIDER.gemini;
}

export default function Settings() {
  const { config, setConfig } = useAppStore();
  const [draft, setDraft] = useState({ ...config });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setConfig(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-10 max-w-3xl mx-auto space-y-8 w-full pb-32">
       <div className="border-b border-white/10 pb-6 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">System Settings</h1>
            <p className="text-slate-400 mt-2 text-sm">Configure routing handlers, telemetry constraints, and model abstraction preferences.</p>
          </div>
          <button 
             onClick={handleSave}
             className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-mono transition duration-300 ${saved ? 'bg-success/10 text-success border border-success/30' : 'bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20'}`}
          >
             {saved ? <CheckCircle2 size={16} /> : <Save size={16} />}
             {saved ? 'Constraints Locked' : 'Save Constraints'}
          </button>
       </div>

       <div className="space-y-6">
          <div className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl space-y-5">
             <h3 className="font-medium text-slate-200">LLM Provider Node</h3>
             <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {['gemini', 'openai', 'openrouter'].map(prov => (
                   <button 
                     key={prov}
                     onClick={() => setDraft({ ...draft, provider: prov, modelName: nextModelForProvider(prov, draft.modelName) })}
                     className={`px-4 py-3 rounded-lg border text-sm capitalize transition ${draft.provider === prov ? 'bg-[#53B6FF]/10 border-[#53B6FF] text-[#53B6FF]' : 'border-white/5 text-slate-400 hover:border-white/20'}`}
                   >
                     {prov}
                   </button>
                ))}
             </div>
          </div>

          <div className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl space-y-5">
             <h3 className="font-medium text-slate-200 m-0">Target Model Binding</h3>
             <p className="text-xs text-slate-500 m-0 pb-2">Select an architecture endpoint or define a custom binding.</p>
             <input 
                type="text" 
                list="model-suggestions"
                value={draft.modelName}
                onChange={(e) => setDraft({ ...draft, modelName: e.target.value })}
                className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-[#53B6FF]"
                placeholder={draft.provider === 'openrouter' ? 'e.g. openai/gpt-4o-mini' : 'e.g. gemini-1.5-flash'}
             />
             <datalist id="model-suggestions">
                <option value="gemini-1.5-flash" />
                <option value="gemini-1.5-pro" />
                <option value="gemini-2.0-flash" />
                <option value="gemini-2.0-flash-lite" />
                <option value="gpt-4o" />
                <option value="gpt-4o-mini" />
                <option value="openai/gpt-4o-mini" />
                <option value="openai/gpt-4o" />
                <option value="google/gemini-2.0-flash-001" />
                <option value="anthropic/claude-3.5-haiku" />
             </datalist>
             <p className="text-xs text-slate-500">
               {draft.provider === 'openrouter'
                 ? 'Use OpenRouter model IDs with provider prefixes, for example openai/gpt-4o-mini or google/gemini-2.0-flash-001.'
                 : 'Gemini and OpenAI keep their usual model names here.'}
             </p>
          </div>

          <div className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl space-y-5">
             <h3 className="font-medium text-slate-200">Execution Identity</h3>
             <input 
                type="password" 
                value={draft.apiKey}
                placeholder="Enter API Key securely"
                onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
                className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-[#53B6FF]"
             />
             <p className="text-xs text-slate-500">
               {draft.provider === 'openrouter'
                 ? 'OpenRouter keys are sent only at request time. Leave this blank if the server already has OPENROUTER_API_KEY configured.'
                 : 'Keys are kept strictly client-side via secure Zustand persistence layer and pushed via execution-time headers.'}
             </p>
          </div>
       </div>
    </div>
  );
}
