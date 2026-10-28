# AdhikarAI — Challenges & Problems Faced

This file is the “what went wrong and what I changed” record. It’s written like incident notes.

## 1) GPU hang → forced shutdown → system corruption → rebuild

**Problem**  
During a heavy run (indexing + reranking + model calls + IDE load), the machine froze. I had to power it off. After reboot, the OS dropped into initramfs and storage devices were missing.

**Root cause**  
This was not a code bug. It was system instability under sustained load, made worse by a forced shutdown during active writes.

**Impact**
- Lost the environment and local artifacts.
- Had to rebuild and re-verify the project.

**Solution**
- Rebuilt clean.
- Treated indexes/chunks as rebuildable outputs, not precious state.
- Made setup more reproducible (explicit dependencies + stable config loading).

**Trade-offs**
- Time cost up front.

**Alternatives**
- Run compute on a separate machine/VM/cloud.
- Add backups/snapshots.

## 2) Frontend ↔ backend connectivity issues (CORS + base URLs + env surprises)

**Problem**  
The UI would sometimes fail to call chat/stream/email endpoints. It depended on how I started the servers.

**Root cause**
- CORS/origin rules in the browser.
- Frontend API base URL drift.
- Env/config loading tied to run context.

**Impact**
- Lost time debugging plumbing.
- Errors looked like feature bugs.

**Solution**
- Standardized local CORS and base URL usage.
- Validated with real smoke tests (health + real endpoint calls), not just “page loads.”

**Trade-offs**
- More explicit config, fewer surprises.

**Alternatives**
- Dev proxy through the frontend server.
- docker-compose to standardize ports and env.

## 3) Gmail OAuth refresh token mismatch (`unauthorized_client`)

**Problem**  
Token refresh failed even though a refresh token existed.

**Root cause**  
Refresh tokens are tied to the OAuth client ID/secret and how consent was done. Using a refresh token with the wrong client credentials fails.

**Impact**
- Email sending blocked.

**Solution**
- Generated a refresh token for the correct client and verified refresh + Gmail send end-to-end.

**Trade-offs**
- OAuth setup is a real operational step.

**Alternatives**
- SMTP with app passwords for simpler dev.

## 4) “Gmail OAuth is partially configured” due to `.env` loading

**Problem**  
Backend claimed Gmail OAuth was missing fields even when `.env` had them.

**Root cause**  
`.env` loading depended on the working directory. Starting the backend from different places changed what config was visible.

**Impact**
- Mail feature looked flaky and random.

**Solution**
- Loaded `.env` from a deterministic project-root path.

**Trade-offs**
- Less flexibility. Much more predictable runtime.

**Alternatives**
- Require an explicit env-file path at startup.

## 5) Gemini API key marked invalid when it wasn’t

**Problem**  
Valid keys were sometimes flagged invalid.

**Root cause**
- Model caching that wasn’t keyed by API key.
- Error matching that treated quota/timeouts like auth failures.

**Impact**
- Bad UX: user loses trust fast when keys look “wrong.”

**Solution**
- Cache Gemini models by `(model_name, api_key_hash)`.
- Tighten classification: auth failures are “invalid”; quota/timeouts are “try again later.”

**Trade-offs**
- More cache entries; correctness wins.

**Alternatives**
- Disable caching.
- LRU cache keyed by hashed key.

## 6) Provider failures during streaming

**Problem**  
Streaming adds state. Provider failures can cause hangs or confusing final states.

**Root cause**  
Not all failures are the same. Streaming needs a clean “final payload” path even when generation fails.

**Impact**
- Demo risk and confusing UI behavior.

**Solution**
- Always end streams with a structured final payload.
- Return provider-specific messages or safe fallbacks.

**Trade-offs**
- Fallback answers can be less fluent.

## 7) Sender override without creating a header injection bug

**Problem**  
Letting a user supply a sender email is useful, but it can be abused (CR/LF header injection).

**Root cause**  
Email headers are newline-sensitive; user input is untrusted.

**Impact**
- Security risk if untreated.

**Solution**
- Reject CR/LF in the sender override header.
- Validate basic sender format and escape HTML email content.

**Trade-offs**
- Sender override is intentionally limited.

## 8) Confidence signal vs user trust

**Problem**  
Raw confidence is a heuristic and can swing more than the UI should.

**Root cause**  
Retrieval-based confidence isn’t calibrated probability.

**Impact**
- Users over-focus on a number that isn’t statistically meaningful.

**Solution**
- Clamp confidence to a product band (65%–93%) and mirror the clamp in the UI.

**Trade-offs**
- Better UX consistency, but not real calibration.
