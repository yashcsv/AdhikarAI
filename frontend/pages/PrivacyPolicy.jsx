import React from 'react';

export default function PrivacyPolicy() {
  return (
    <div className="p-10 max-w-4xl mx-auto space-y-8 w-full">
       <div className="border-b border-white/10 pb-6">
          <h1 className="text-3xl font-semibold tracking-tight text-white">Privacy Details</h1>
       </div>
       <div className="text-slate-400 text-sm space-y-4">
          <p>AdhikarAI strictly processes inferences client-side where applicable, ensuring keys are retained natively in local storage without server logging.</p>
          <p>No user conversations are explicitly tracked or sold. This repository operates as an infrastructure demonstration.</p>
       </div>
    </div>
  );
}
