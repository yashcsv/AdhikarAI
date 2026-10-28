import React from 'react';

export default function FutureUpdates() {
  return (
    <div className="p-10 max-w-4xl mx-auto space-y-8 w-full">
       <div className="border-b border-white/10 pb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-white">System Roadmap</h1>
       </div>
       <ul className="text-slate-400 text-sm space-y-4 list-disc pl-5">
          <li>Integration of Local Llama Instances via WebGPU.</li>
          <li>Graph RAG optimization replacing FAISS dense similarity matrix.</li>
          <li>Advanced user RBAC parameters.</li>
       </ul>
    </div>
  );
}
