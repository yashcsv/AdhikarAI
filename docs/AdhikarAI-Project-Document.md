# AdhikarAI — Project Document

This is a practical build write-up. It focuses on what the system does today, how it works, and what broke while building it.

## 1. Project Overview

**Project name:** AdhikarAI

**Problem statement (legal Q&A with sources, under real constraints)**  
Legal Q&A is risky when answers are not tied to text you can point to. In real usage you also hit messy constraints: missing keys, quota limits, “works on my machine” config problems, and half-finished OAuth setups. AdhikarAI is built to stay grounded: it retrieves relevant legal text, cites it, and falls back safely when it cannot answer.

**Objectives and goals**
- **Grounded answers:** Answer from retrieved context only. If context is weak, say so.
- **Traceability:** Always return sources (Act/Section + snippet) with the answer.
- **Simple controls:** Let users tune retrieval (`top_k`, `alpha`) and output style (role/brief vs detailed).
- **Honest failures:** Treat quota/timeouts differently from “bad key”.
- **Basic safety:** Block header injection for email sender override; escape content used in HTML email.

**Target users**
- **Workers/employees:** Want simple, practical explanations (worker / ELI5).
- **HR/compliance:** Want quick references and a usable checklist.
- **Students/researchers:** Want Act/Section anchors to verify and read further.

## 2. Executive Summary

**What it does**  
AdhikarAI answers Indian labor-law questions using retrieval + reranking + generation. It can stream answers, show sources, run a quick evaluation heuristic, and send the final answer by email.

**Why it matters**  
In legal contexts, “confident and wrong” is worse than “not enough info.” AdhikarAI is designed to be conservative: it gates generation on evidence, returns sources by default, and uses fallbacks instead of guessing.

**Practical value (no made-up numbers)**
- Faster path to relevant Act/Section references.
- Easier review because sources ship with each answer.
- Easier demos because streaming + local fallback keep the system usable.

**Not measured yet**  
Latency percentiles, answer acceptance rate, and retrieval quality over a labeled dataset are **not measured yet**. Section 7 lists how to measure them.

## 3. System Architecture

**Architecture style (SPA + modular backend service)**  
The frontend is a React (Vite) SPA. The backend is a single FastAPI service. Internally the backend is split into modules (ingestion/indexing/retrieval/reranker/LLM) and one orchestration layer that coordinates everything. This keeps iteration fast and failures easier to debug.

**Components**
- **Frontend:** setup + settings UI, streaming chat, “Send Email”. Stores Gemini key and optional sender override in the browser.
- **API layer (FastAPI):** `/api/chat`, `/api/chat/stream`, `/api/chat/send-email`, health, key verify, stream control, upload.
- **Orchestrator:** retrieval → rerank → generation, plus streaming controls, fallbacks, confidence normalization, and email routing.
- **Ingestion:** read PDFs, clean noisy text, write chunk JSON.
- **Indexing + retrieval:** CPU embeddings + FAISS, BM25, hybrid fusion controlled by `alpha`.
- **Reranker:** cross-encoder on CPU; embedding fallback if needed.
- **LLM adapter:** Gemini prompt building + streaming; key validation; model caching keyed by API key hash.
- **Evaluation:** quick heuristics (keyword coverage, hallucination flag) and an offline evaluation harness.

### Step-by-step data flow (query → retrieval → rerank → LLM → response)

1. **User query (frontend)**
  - Sends `QueryRequest` to `/api/chat/stream` (SSE). If streaming fails, it falls back to `/api/chat`.
  - If the model is Gemini, the frontend includes `X-Gemini-API-Key`.

2. **Request handling (backend)**
  - The router reads the header and injects it into the request payload.

3. **Conversation memory**
  - The backend keeps a small window of recent messages and prefixes it to the query.

4. **Retrieval (hybrid)**
  - Optionally rewrites/creates a second query variant (hard-capped to keep CPU/RAM safe).
  - Runs dense (FAISS) and sparse (BM25) retrieval and fuses scores using `alpha`.

5. **Reranking**
  - Cross-encoder reranks the top candidates on CPU.
  - Produces bounded scores (`rerank_score`, `hybrid_score`, `final_score`).

6. **Prompt construction**
  - Dedupes context by (Act, Section), truncates long chunks, and formats explicit source labels.

7. **Generation (Gemini or fallback)**
  - If context is insufficient, returns an explicit “not enough information” result.
  - If Gemini fails due to quota/network/unavailability, returns a safe provider message or uses the local fallback when appropriate.

8. **Final response**
  - Returns `{ answer, sources, confidence, confidence_label, meta, latency }`.
  - Confidence is normalized/clamped on the backend; the UI clamps again for display safety.

### Email flow (UI → API → Gmail OAuth2/SMTP)

1. **UI sends email request**
  - Calls `/api/chat/send-email` with the last assistant answer.
  - If the user set a sender override, includes `X-Mail-From-Email`.

2. **Backend validates sender override**
  - Rejects CR/LF in the header to prevent header injection.

3. **Backend sends mail**
  - Builds a multipart email (plain + HTML).
  - Routes to **Gmail OAuth2** if fully configured.
  - Otherwise uses **SMTP** if configured.
  - Otherwise returns an explicit configuration error.

## 4. Technology Stack (with engineering justification)

**Frontend (React + Vite)**
- Chosen for quick iteration and a clean settings-heavy UI.
- Stores Gemini key and optional “From Email” locally to avoid building auth/secrets early.

**Backend (FastAPI + orchestrator)**
- FastAPI keeps request/response models explicit and supports SSE streaming cleanly.
- The orchestrator keeps product behavior in one place (fallbacks, confidence normalization, mail routing).

**Indexing + retrieval**
- Dense retrieval: sentence-transformers embeddings on CPU + FAISS.
- Sparse retrieval: BM25 for keyword-heavy legal queries.
- Hybrid fusion: `alpha` trades off dense vs sparse.

**LLM + reranking**
- Gemini integration supports streaming and retries candidate models.
- Cross-encoder reranker improves ranking quality; embedding fallback keeps it usable on machines that cannot load the cross-encoder.
- Local mock mode provides a deterministic fallback for demos and provider outages.

**Evaluation/observability**
- Returns timing breakdown in the response.
- Quick evaluation endpoint provides simple, inspectable signals.

## 5. Core Features (scenarios + edge cases)

### 5.1 RAG answers with sources
**Scenario:** User asks a compliance question (wages, maternity, overtime). The system returns an answer plus sources showing where it came from.

**Edge cases/constraints**
- Empty input → “Please provide a query.”
- Weak evidence → “Not enough information…” instead of guessing.
- Duplicate sections → deduped to keep sources readable.

### 5.2 Confidence scoring (and why it is clamped)
**What it is**  
Confidence is a heuristic signal derived from retrieval/reranking strength. It is **not** a calibrated probability.

**How the UI uses it**
- Shows a numeric confidence and a label (`low`, `medium`, `high`).
- Used with a quick evaluation heuristic to flag “overconfident/underconfident” cases.

**Constraint**  
Confidence is clamped to **65%–93%** in backend responses, with a matching UI clamp. This is a product/UX constraint to keep the signal in a consistent band.

### 5.3 Streaming chat
**Scenario:** User sees tokens as they arrive (SSE). When complete, the system sends a final structured payload.

**Edge cases/constraints**
- Pause/resume/stop is supported; paused output is buffered with a hard limit.
- If Gemini fails mid-stream, the stream still ends with a final payload.

### 5.4 Gemini API key UX (local-only)
**Scenario:** User saves a key in Setup and verifies it against the backend.

**Edge cases/constraints**
- Quota/timeouts should not mark a key “invalid”.
- “Model not found” is treated differently from auth errors.
- Gemini model caching is keyed by `(model_name, api_key_hash)` to avoid cross-key contamination.

### 5.5 Send Email (Gmail OAuth2 / SMTP + sender override)
**Scenario:** User emails the last answer as an HTML “legal brief” with sources.

**Edge cases/constraints**
- Gmail OAuth can be “partially configured”. The backend fails fast and lists missing fields.
- Sender override is sanitized; CR/LF is rejected to prevent header injection.
- If Gmail OAuth is ready, it is used; otherwise SMTP is used; otherwise error.

## 6. Implementation Details

**Key modules (what each does)**
- Orchestrator: retrieval/rerank/generate, streaming control, confidence normalization, email send.
- Indexing/retrieval: embedding, FAISS search, BM25 search, hybrid fusion.
- Reranker: cross-encoder scores with safe fallback.
- LLM adapter: prompt building, streaming/non-streaming generation, key validation, model caching.
- Ingestion: PDF extraction, cleaning, chunk generation.

**API design (examples)**
- `GET /api/health` → `{ "status": "ok" }`
- `POST /api/chat` → response includes `answer`, `sources`, `confidence`, `meta`, `latency`
  - Optional header: `X-Gemini-API-Key`
- `POST /api/chat/stream` → SSE events: `delta` chunks + final payload
  - Optional header: `X-Gemini-API-Key`
- `POST /api/chat/verify-key` → `{ valid, message }`
  - Required header: `X-Gemini-API-Key`
- `POST /api/chat/send-email` → `{ status, message }`
  - Optional header: `X-Mail-From-Email`

**Response shape (what the frontend expects)**
- `answer: string`
- `sources: list` (Act/Section/snippet)
- `confidence: number`, `confidence_label: string`
- `meta: dict` (retrieval counts, debug info, notices)
- `latency: dict` (stage timings)

## 7. Scalability & Performance

**What will limit this first**
- Gemini latency and quota.
- CPU cost of cross-encoder reranking.
- Index size and memory footprint.
- Browser localStorage growth for long chats.

**What was observed**  
Not measured yet as aggregated data. The system returns per-request stage timings, but there is no stored run history.

**Optimizations already in place**
- Hard caps on retrieval and reranking candidates.
- Small query-variant limit.
- Model caching keyed by API key hash.

**How to measure next (without inventing numbers)**
- Add structured logs for latency by stage and total.
- Track error types separately: auth vs quota vs timeout.
- Build a small labeled test set and measure retrieval precision/recall and citation correctness.

## 8. Security Considerations

**Secrets (dev vs production)**
- Dev: Gemini key stored in browser localStorage and sent via header; backend does not persist it.
- Production: do not keep provider keys in the browser. Use server-side secrets and user auth.

**Auth**
- Current: none (local/dev).
- Production: required (AuthN/AuthZ + rate limiting).

**Input validation and injection prevention**
- Email sender override blocks CR/LF and checks basic email formatting.
- Email HTML content is escaped.

**Common risks and how they apply**
- Prompt injection: the prompt asks for context-only answers, but this is not a full defense.
- XSS: frontend should render model output as text, not HTML.

## 9. DevOps & Deployment

**Local run**
- Backend: FastAPI on port 8000.
- Frontend: Vite dev server on port 5173.

**CI/CD (recommended)**
- Lint + tests for backend.
- Build for frontend.
- Basic contract smoke tests for `/api/health`, chat, and send-email.

**Production plan**
- Containerize frontend and backend.
- Put behind a reverse proxy with TLS.
- Add environment separation and secret management.
- Monitor latency, provider failures, and email failures.

## 10. Challenges & Problems Faced (CRITICAL)

This section is written like incident notes: what happened, why, and what changed.

### Challenge 1 — GPU hang → forced shutdown → corrupted system → rebuild
**Problem**  
During a heavy run (indexing + reranking + LLM calls + IDE load), the machine froze hard. A forced power-off was the only exit. After reboot, the OS dropped into initramfs and storage devices were missing.

**Root cause**  
System/driver instability under sustained load plus a hard power-off during active writes.

**Impact**
- Lost the environment and local artifacts.
- Had to rebuild the workspace and re-verify pipelines.

**Solution**
- Rebuilt cleanly.
- Treated index artifacts as rebuildable outputs.
- Tightened reproducibility (explicit dependencies + config).

**Trade-offs**
- Slower feature velocity short-term.

**Alternatives**
- Isolate compute in a container/VM or separate machine.
- Add snapshots/backups.

### Challenge 2 — Frontend/backend integration “works sometimes”
**Problem**  
Requests failed depending on how the servers were started.

**Root cause**
- CORS/origin mismatch.
- API base URL drift.
- Environment loading tied to run context.

**Impact**
- Debug time spent on plumbing, not product.

**Solution**
- Standardized allowed origins and base URL.
- Added real smoke checks (health + real calls).

**Trade-offs**
- More explicit config, but far fewer surprises.

### Challenge 3 — Gmail OAuth refresh token mismatch
**Problem**  
Token refresh failed with `unauthorized_client`.

**Root cause**  
Refresh tokens are tied to a specific client ID/secret + redirect URI history.

**Impact**
- Email sending blocked.

**Solution**
- Regenerated refresh token using the correct OAuth client and verified end-to-end send.

**Trade-offs**
- Setup complexity is unavoidable.

### Challenge 4 — Gmail OAuth “partially configured” due to `.env` loading
**Problem**  
Backend reported missing Gmail fields even when `.env` had them.

**Root cause**  
`.env` loading depended on the backend working directory.

**Impact**
- Mail feature looked flaky.

**Solution**
- Loaded `.env` from a deterministic project-root path.

**Trade-offs**
- Less flexibility; more reliability.

### Challenge 5 — Gemini key marked invalid when it shouldn’t be
**Problem**  
Valid keys were flagged invalid.

**Root cause**
- Model caching collisions (cache too broad).
- Error matching that treated quota/timeouts like auth errors.

**Impact**
- Bad UX and lost time.

**Solution**
- Cache Gemini models by `(model_name, api_key_hash)`.
- Tighten error classification so availability failures don’t poison key status.

**Trade-offs**
- Slightly more memory usage; correctness is worth it.

### Challenge 6 — Streaming behavior under provider failures
**Problem**  
Provider failures during streaming can cause hangs or confusing UI state.

**Root cause**
Streaming adds state. Provider failures are not uniform.

**Impact**
- Demo risk and confusing “invalid key” states.

**Solution**
- End streams with a structured final payload.
- Use provider-specific messages and safe fallback behavior.

### Challenge 7 — Sender override without opening an injection hole
**Problem**  
User-controlled sender email can become a header-injection vector.

**Root cause**
Email headers are newline-sensitive.

**Impact**
- Security risk if untreated.

**Solution**
- Reject CR/LF in `X-Mail-From-Email`.
- Escape content used in HTML email.

### Challenge 8 — Confidence score trust
**Problem**  
Heuristic confidence can be noisy.

**Root cause**
It’s not calibrated probability; it’s derived from retrieval strength.

**Impact**
- Users over-focus on the number.

**Solution**
- Clamp confidence to 65%–93% and align labels.

**Trade-offs**
This improves UX consistency but does not replace real calibration.

## 11. Design Decisions & Trade-offs

**Key choices**
- One backend service with modular internals (faster iteration).
- Hybrid retrieval + CPU reranking (works on modest machines).
- Local-only key storage (fast setup, not production-safe).

**Intentionally out of scope for now**
- Authentication and multi-user isolation.
- Production-grade secret storage.
- Production deployment and monitoring.

**Where simplicity won**
- Lightweight query rewriting instead of LLM-based planning.

## 12. Future Improvements

**Reliability**
- Index versioning and atomic rollouts.
- Circuit breakers and rate limiting.

**Security**
- Add auth; stop sending provider keys from the browser.
- Sender allowlists and audit logs for email.

**Evaluation + confidence**
- Build a labeled dataset.
- Calibrate confidence (ECE/Brier) instead of clamping.

**Deployment**
- Dockerize.
- Environment separation and secret management.

## 13. Conclusion

AdhikarAI is a grounded legal assistant built with practical trade-offs. It focuses on traceable answers, clear failure modes, and a demo-ready product surface (streaming + email) without pretending it is production-ready yet.
