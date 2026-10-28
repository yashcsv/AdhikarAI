# AdhikarAI Demo Video Instructions (Full-Coverage)

This runbook is designed to help you record one complete demo that covers the full AdhikarAI scope: architecture, setup, retrieval pipeline, streaming UX, observability with LangSmith, evaluation, upload, fallback behavior, and email flow.

## 1) Demo Goal

Record a single video that proves:5
- End-to-end legal Q&A flow works (query -> retrieval -> rerank -> generation -> cited answer)
- Streaming and non-stream fallback behavior are stable
- Confidence and quick evaluation are visible
- Upload and source grounding are demonstrated
- LangSmith traces are generated and inspectable
- Email feature path and safety controls are explained
- Key challenges, trade-offs, and future plan are covered

## 2) Pre-Recording Checklist

### Environment
- Python venv is active
- Node dependencies are installed in frontend
- Backend data index exists at data/index
- Gemini API key is available

### Required Files
- .env configured in project root
- frontend build/dev environment variable VITE_API_URL points to backend /api

### LangSmith Setup
Add these values in .env:

LANGSMITH_TRACING=true
LANGSMITH_API_KEY=<your-langsmith-api-key>
LANGSMITH_PROJECT=AdhikarAI
LANGSMITH_ENDPOINT=https://api.smith.langchain.com

Optional but recommended:
- ENABLE_TRACING=true
- LOG_LEVEL=INFO

## 3) What Was Added for LangSmith Integration

LangSmith integration is now wired in backend startup and pipeline methods.

Key files:
- backend/observability/langsmith.py
- backend/main.py
- backend/services/orchestrator.py
- configs/config.py
- .env.example
- requirements.txt

Runtime behavior:
- Tracing is optional and env-driven
- If LANGSMITH_TRACING=false, app behavior remains unchanged
- If LANGSMITH_TRACING=true and key is present, traced runs are emitted from chat pipeline methods

## 4) Recording Plan (100% Coverage)

Target length: 18-30 minutes.

### Segment A (1-2 min): Opening + Problem Statement
Say:
- Why legal AI needs grounded citations
- What AdhikarAI solves and who it is for
- What you will cover in the demo

Show:
- docs/AdhikarAI-Project-Document.md
- Short architecture summary section

### Segment B (2-3 min): Repo and Architecture Tour
Show:
- backend module layout (ingestion, indexing, retrieval, reranker, llm, evaluation, observability, services)
- frontend layout (pages, hooks, components)
- data folders and index artifacts

Explain:
- Modular orchestration pattern
- Why CPU-safe defaults and fallbacks were used

### Segment C (2-3 min): Setup + Keys + Health
Show:
- Setup page in frontend
- Gemini key save/verify flow
- API base URL and health card

Say:
- Key is stored client-side for dev/demo convenience
- Production should use server-side secret handling

### Segment D (4-6 min): Primary Chat Flow (Core Product)
Perform:
- Ask a wage question
- Ask a maternity question
- Ask a working-hours/overtime question

Show:
- Streaming output
- Final answer with sources
- Confidence label and evidence alignment

Callouts:
- Retrieval + reranking influence answer quality
- Context-grounded answer strategy

### Segment E (2-3 min): Advanced Controls
Show and use:
- top_k slider
- alpha/hybrid balance
- role modes (lawyer/worker/eli5)
- response mode (brief/detailed)
- pause/resume/stop during streaming

Explain:
- Why these controls exist for practical tuning and demos

### Segment F (2-3 min): Upload + On-demand Evaluation
Perform:
- Upload a PDF in chat
- Ask a follow-up based on upload
- Run quick evaluation

Show:
- evaluation output
- hallucination signal and confidence reality labeling

### Segment G (2-4 min): LangSmith Observability
Open LangSmith dashboard and show:
- Project: AdhikarAI
- New traces created by requests
- Inputs/outputs and run timings

Explain:
- What each traced run corresponds to
- How this helps debugging and quality review

### Segment H (2-3 min): Email Feature + Security Controls
Show:
- Send-email flow from UI
- Mention Gmail OAuth2 and SMTP fallback options

Explain controls:
- Header sanitization for X-Mail-From-Email
- Escaping in HTML email body
- Explicit failure when config is partial

### Segment I (2-3 min): Challenges + Lessons + Trade-offs
Summarize from project document:
- GPU crash/rebuild incident
- OAuth and .env loading issues
- key-verification edge cases
- streaming failure handling
- confidence limitations

### Segment J (1-2 min): Future Roadmap + Close
Mention:
- auth/rate limiting
- confidence calibration dataset
- production deployment hardening
- monitoring and CI improvements

## 5) Live Demo Script (Talk Track)

Use this short narrative while recording:

1. "AdhikarAI is a grounded legal assistant for Indian labor-law Q&A. Every response is tied to retrievable source snippets."
2. "The backend runs a modular pipeline: retrieve, rerank, then generate with fallback behavior if context or provider fails."
3. "I can tune top_k and alpha, switch explanation style, and stream responses live."
4. "Now I run quick evaluation to inspect keyword coverage and hallucination risk."
5. "Here is LangSmith capturing trace data per run, which helps us diagnose latency and output behavior."
6. "This project is demo-ready but intentionally transparent about production gaps like auth and calibrated confidence."

## 6) Terminal Commands for Recording

From project root:

Backend setup and run:
- source /home/yash/Desktop/Projects/.venv/bin/activate
- pip install -r requirements.txt
- uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

Frontend setup and run:
- cd frontend
- npm install
- npm run dev -- --host 0.0.0.0 --port 5173

## 7) Demo Safety and Backup Plan

Before recording:
- Keep one tested prompt list ready (wage, maternity, overtime, gratuity)
- Keep fallback model option ready (local-mock)
- Keep one local PDF ready for upload demo

If Gemini fails live:
- Explain provider-side limits
- Switch to local-mock
- Continue showing retrieval, rerank, sources, and evaluation

If email fails live:
- Show explicit error handling
- Explain missing OAuth/SMTP config and security-first fail-closed behavior

## 8) Final Quality Checklist (Before Publishing Video)

- Audio clear and terminal zoom readable
- All main features shown at least once
- LangSmith trace view included
- At least one failure mode explained honestly
- Sources and confidence visible in final cut
- Closing includes roadmap and current limitations
