"""Provider-backed generation layer for AdhikarAI legal RAG."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import statistics
import time
import urllib.error
import urllib.request
from typing import Any, Generator

import google.generativeai as genai

from configs.config import settings

logger = logging.getLogger(__name__)

DEFAULT_GEMINI_MODEL = "gemini-1.5-flash-latest"
DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini"
OPENROUTER_CHAT_COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions"
MAX_CONTEXT_CHUNKS = 7
MIN_CONTEXT_CHUNKS = 5
MAX_CHUNK_CHARS = 500
PROVIDER_TIMEOUT_SECONDS = 8
THINKING_ON_MAX_OUTPUT_TOKENS = 1800
THINKING_OFF_MAX_OUTPUT_TOKENS = 800

FALLBACK_MESSAGE = "Not enough information in the provided legal documents."
MISSING_GEMINI_KEY_MESSAGE = "Gemini API key not configured. Add a key in Settings or set GEMINI_API_KEY on the server."
MISSING_OPENROUTER_KEY_MESSAGE = "OpenRouter API key not configured. Add a key in Settings or set OPENROUTER_API_KEY on the server."

SYSTEM_PROMPT = (
    "You are AdhikarAI, an expert Indian labour-law assistant for employees, employers, HR teams, "
    "compliance officers, and legal professionals.\n"
    "PRIMARY GOAL: Deliver high-quality, practical, and legally grounded answers that are never shallow.\n"
    "Always distinguish black-letter law, interpretation/practice, and assumptions.\n"
    "Never fabricate sections, case citations, or notifications.\n"
    "If uncertain, state unknowns and provide a verification path.\n"
    "When context is insufficient, return exactly: 'Not enough information in the provided legal documents.'\n"
    "Citations must reference exact Act and Section labels visible in provided context."
)

_SUPPORTED_PROVIDERS = {"gemini", "openrouter"}
_MODEL_CACHE: dict[str, genai.GenerativeModel] = {}


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _safe_text(value: Any) -> str:
    return str(value or "").strip()


def _raw_text(value: Any) -> str:
    return str(value or "")


def _normalize_provider(provider: str | None) -> str:
    return _safe_text(provider).lower() or "gemini"


def _normalize_role_mode(role_mode: str | None) -> str:
    mode = _safe_text(role_mode).lower()
    if mode in {"lawyer", "normal"}:
        return mode
    if mode in {"worker", "eli5"}:
        return "normal"
    return "normal"


def _normalize_thinking(thinking: Any, response_mode: str | None = None) -> str:
    value = _safe_text(thinking).lower()
    if value in {"on", "off"}:
        return value

    if isinstance(thinking, bool):
        return "on" if thinking else "off"

    mode = _safe_text(response_mode).lower()
    if mode == "detailed":
        return "on"
    if mode == "brief":
        return "off"
    return "off"


def _response_token_budget(thinking: str) -> int:
    return THINKING_ON_MAX_OUTPUT_TOKENS if thinking == "on" else THINKING_OFF_MAX_OUTPUT_TOKENS


def _get_gemini_api_key(explicit_key: str | None = None) -> str:
    if explicit_key:
        return explicit_key

    env_key = os.getenv("GEMINI_API_KEY", "").strip()
    if env_key:
        return env_key

    return str(getattr(settings, "gemini_api_key", "") or "").strip()


def _get_openrouter_api_key(explicit_key: str | None = None) -> str:
    if explicit_key:
        return explicit_key

    env_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    if env_key:
        return env_key

    return str(getattr(settings, "openrouter_api_key", "") or "").strip()


def _get_api_key(provider: str, explicit_key: str | None = None) -> str:
    if _normalize_provider(provider) == "openrouter":
        return _get_openrouter_api_key(explicit_key)
    return _get_gemini_api_key(explicit_key)


def _get_model(api_key: str, model_name: str = DEFAULT_GEMINI_MODEL) -> genai.GenerativeModel:
    key_hash = hashlib.sha256(api_key.encode("utf-8")).hexdigest()[:12]
    cache_key = f"{model_name}::{key_hash}"
    if cache_key in _MODEL_CACHE:
        return _MODEL_CACHE[cache_key]

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_name=model_name, system_instruction=SYSTEM_PROMPT)
    _MODEL_CACHE[cache_key] = model
    return model


def _candidate_gemini_models(requested_model: str | None) -> list[str]:
    candidates = [
        _safe_text(requested_model),
        _safe_text(os.getenv("LLM_MODEL", "")),
        _safe_text(getattr(settings, "llm_model", "")),
        DEFAULT_GEMINI_MODEL,
        "gemini-1.5-flash-latest",
        "gemini-2.0-flash",
        "gemini-2.0-flash-lite",
    ]

    deduped: list[str] = []
    for name in candidates:
        if name and name not in deduped:
            deduped.append(name)
    return deduped


def _normalize_openrouter_model_name(model_name: str | None) -> str:
    name = _safe_text(model_name)
    if not name or "/" in name:
        return name

    lower = name.lower()
    if lower.startswith(("gpt-", "o1", "o3", "o4")):
        return f"openai/{name}"
    if "gemini" in lower:
        return f"google/{name}"
    if "claude" in lower:
        return f"anthropic/{name}"
    return name


def _candidate_openrouter_models(requested_model: str | None) -> list[str]:
    candidates = [
        _normalize_openrouter_model_name(requested_model),
        _normalize_openrouter_model_name(os.getenv("OPENROUTER_MODEL", "")),
        _normalize_openrouter_model_name(getattr(settings, "openrouter_model", "")),
        DEFAULT_OPENROUTER_MODEL,
    ]

    deduped: list[str] = []
    for name in candidates:
        if name and name not in deduped:
            deduped.append(name)
    return deduped


def _is_gemini_model_not_found_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "not found" in message or "models/" in message


def _http_error_body(exc: Exception) -> str:
    if not isinstance(exc, urllib.error.HTTPError):
        return ""
    try:
        return exc.read().decode("utf-8", errors="ignore").strip()
    except Exception:
        return ""


def _error_message(exc: Exception) -> str:
    parts = [str(exc)]
    body = _http_error_body(exc)
    if body:
        parts.append(body)
    return " ".join(part for part in parts if part).strip().lower()


def _is_openrouter_model_not_found_error(exc: Exception) -> bool:
    message = _error_message(exc)
    status = getattr(exc, "code", None)
    return status == 404 or ("not found" in message and "model" in message) or "no endpoints found" in message


def _gemini_provider_error_message(exc: Exception) -> str | None:
    message = _error_message(exc)
    if "quota" in message or "429" in message or "rate" in message:
        return "Gemini verification unavailable due to quota or rate limits. Please try again later."

    if (
        "401" in message
        or "403" in message
        or "unauthorized" in message
        or "permission denied" in message
        or "forbidden" in message
        or "invalid api key" in message
        or "api key not valid" in message
    ):
        return "Gemini API authentication failed. Please verify GEMINI_API_KEY."

    if "timeout" in message or "temporar" in message or "unavailable" in message or "connection" in message:
        return "Gemini verification unavailable right now. Please try again."

    return None


def _openrouter_provider_error_message(exc: Exception) -> str | None:
    status = getattr(exc, "code", None)
    message = _error_message(exc)

    if status in {401, 403} or "unauthorized" in message or "forbidden" in message or "invalid api key" in message:
        return "OpenRouter API authentication failed. Please verify OPENROUTER_API_KEY."

    if status == 402 or "payment required" in message or "insufficient credits" in message:
        return "OpenRouter request failed because billing or credits are required for the selected model."

    if status == 429 or "quota" in message or "rate limit" in message or "too many requests" in message:
        return "OpenRouter is rate-limited or out of quota right now. Please try again later."

    if "timeout" in message or "temporar" in message or "unavailable" in message or "connection" in message:
        return "OpenRouter is unavailable right now. Please try again."

    return None


def validate_api_key(
    api_key: str,
    model_name: str | None = DEFAULT_GEMINI_MODEL,
    provider: str = "gemini",
) -> tuple[bool, str]:
    normalized_provider = _normalize_provider(provider)
    if normalized_provider == "openrouter":
        return _validate_openrouter_api_key(api_key=api_key, model_name=model_name)
    if normalized_provider == "gemini":
        return _validate_gemini_api_key(api_key=api_key, model_name=model_name)
    return False, "Unsupported provider requested."


def _validate_gemini_api_key(api_key: str, model_name: str | None = DEFAULT_GEMINI_MODEL) -> tuple[bool, str]:
    resolved_key = _safe_text(api_key)
    if not resolved_key:
        return False, "Gemini API key is required."

    last_error: Exception | None = None
    for candidate_model in _candidate_gemini_models(model_name):
        try:
            model = _get_model(api_key=resolved_key, model_name=candidate_model)
            result = model.generate_content(
                "Reply with OK",
                generation_config={"temperature": 0, "max_output_tokens": 4},
                stream=False,
                request_options={"timeout": PROVIDER_TIMEOUT_SECONDS},
            )
            answer = _safe_text(getattr(result, "text", ""))
            if answer:
                return True, "Gemini API key is valid."
            return True, "Gemini API key accepted."
        except Exception as exc:
            last_error = exc
            if _is_gemini_model_not_found_error(exc):
                continue
            provider_error = _gemini_provider_error_message(exc)
            if provider_error:
                return False, provider_error
            return False, "Gemini API key verification failed."

    if last_error:
        if _is_gemini_model_not_found_error(last_error):
            return False, "Gemini verification unavailable for the configured model. Please try again later."
        provider_error = _gemini_provider_error_message(last_error)
        if provider_error:
            return False, provider_error

    return False, "Gemini verification unavailable right now. Please try again."


def _openrouter_headers(api_key: str) -> dict[str, str]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "X-Title": _safe_text(getattr(settings, "app_name", "")) or "AdhikarAI",
    }
    site_url = _safe_text(getattr(settings, "openrouter_site_url", ""))
    if site_url:
        headers["HTTP-Referer"] = site_url
    return headers


def _openrouter_request(
    api_key: str,
    body: dict[str, Any],
    *,
    timeout: int = PROVIDER_TIMEOUT_SECONDS,
) -> Any:
    request = urllib.request.Request(
        OPENROUTER_CHAT_COMPLETIONS_URL,
        data=json.dumps(body).encode("utf-8"),
        headers=_openrouter_headers(api_key),
        method="POST",
    )
    return urllib.request.urlopen(request, timeout=timeout)


def _extract_openrouter_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()

    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, dict):
                text = _safe_text(item.get("text"))
                if text:
                    parts.append(text)
            else:
                text = _safe_text(item)
                if text:
                    parts.append(text)
        return "".join(parts).strip()

    if isinstance(value, dict):
        return _safe_text(value.get("text"))

    return _safe_text(value)


def _extract_openrouter_delta_text(value: Any) -> str:
    if isinstance(value, str):
        return value

    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, dict):
                text = _raw_text(item.get("text"))
                if text:
                    parts.append(text)
            else:
                text = _raw_text(item)
                if text:
                    parts.append(text)
        return "".join(parts)

    if isinstance(value, dict):
        return _raw_text(value.get("text"))

    return _raw_text(value)


def _extract_openrouter_message_text(payload: dict[str, Any]) -> str:
    choices = payload.get("choices") or []
    if not choices:
        return ""

    message = choices[0].get("message") or {}
    return _extract_openrouter_text(message.get("content"))


def _read_openrouter_usage(payload: dict[str, Any]) -> dict[str, int | None]:
    usage = payload.get("usage") or {}
    return {
        "prompt_tokens": usage.get("prompt_tokens"),
        "completion_tokens": usage.get("completion_tokens"),
        "total_tokens": usage.get("total_tokens"),
    }


def _validate_openrouter_api_key(api_key: str, model_name: str | None = DEFAULT_OPENROUTER_MODEL) -> tuple[bool, str]:
    resolved_key = _safe_text(api_key)
    if not resolved_key:
        return False, "OpenRouter API key is required."

    last_error: Exception | None = None
    for candidate_model in _candidate_openrouter_models(model_name):
        try:
            body = {
                "model": candidate_model,
                "messages": [{"role": "user", "content": "Reply with OK"}],
                "temperature": 0,
                "max_tokens": 4,
            }
            with _openrouter_request(resolved_key, body) as response:
                payload = json.loads(response.read().decode("utf-8"))
            answer = _extract_openrouter_message_text(payload)
            if answer:
                return True, "OpenRouter API key is valid."
            return True, "OpenRouter API key accepted."
        except Exception as exc:
            last_error = exc
            if _is_openrouter_model_not_found_error(exc):
                continue
            provider_error = _openrouter_provider_error_message(exc)
            if provider_error:
                return False, provider_error
            return False, "OpenRouter API key verification failed."

    if last_error:
        if _is_openrouter_model_not_found_error(last_error):
            return False, "OpenRouter verification unavailable for the configured model. Please try a different model."
        provider_error = _openrouter_provider_error_message(last_error)
        if provider_error:
            return False, provider_error

    return False, "OpenRouter verification unavailable right now. Please try again."


def _select_context(context_chunks: list[dict[str, Any]], max_chunks: int = MAX_CONTEXT_CHUNKS) -> list[dict[str, Any]]:
    if not context_chunks:
        return []

    cap = max(MIN_CONTEXT_CHUNKS, min(max_chunks, MAX_CONTEXT_CHUNKS))
    return context_chunks[:cap]


def _prepare_context(context_chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[str, str]] = set()
    prepared: list[dict[str, Any]] = []

    for chunk in context_chunks:
        act = _safe_text(chunk.get("act"))
        section = _safe_text(chunk.get("section"))
        key = (act, section)
        if key in seen:
            continue
        seen.add(key)

        cloned = dict(chunk)
        cloned["text"] = _safe_text(chunk.get("text"))[:MAX_CHUNK_CHARS]
        prepared.append(cloned)

    return prepared


def _build_sources(context_chunks: list[dict[str, Any]]) -> list[dict[str, str]]:
    seen: set[tuple[str, str, str]] = set()
    sources: list[dict[str, str]] = []

    for chunk in context_chunks:
        act = _safe_text(chunk.get("act")) or "Unknown Act"
        section = _safe_text(chunk.get("section")) or "Unknown Section"
        snippet = _safe_text(chunk.get("text"))[:200]
        key = (act, section, snippet)
        if key in seen:
            continue
        seen.add(key)
        sources.append({"act": act, "section": section, "snippet": snippet})

    return sources


def _estimate_prompt_tokens(prompt: str) -> int:
    return max(1, len(prompt) // 4)


def _confidence(context_chunks: list[dict[str, Any]]) -> float:
    if not context_chunks:
        return 0.0

    scores = [
        _clamp01(float(chunk.get("rerank_score", chunk.get("score", 0.0))))
        for chunk in context_chunks
    ]
    return _clamp01(statistics.fmean(scores))


def _context_is_sufficient(context_chunks: list[dict[str, Any]]) -> bool:
    if not context_chunks:
        return False
    non_empty = [chunk for chunk in context_chunks if _safe_text(chunk.get("text"))]
    if not non_empty:
        return False

    scores = [
        _clamp01(float(chunk.get("rerank_score", chunk.get("score", 0.0))))
        for chunk in non_empty
    ]
    if not scores:
        return False

    top_score = max(scores)
    top3 = sorted(scores, reverse=True)[:3]
    top3_mean = float(statistics.fmean(top3)) if top3 else 0.0
    overall_mean = _confidence(non_empty)

    return top_score >= 0.35 or top3_mean >= 0.20 or overall_mean >= 0.12


def build_prompt(
    query: str,
    context_chunks: list[dict[str, Any]],
    *,
    role_mode: str = "normal",
    thinking: str = "off",
    attachments: list[dict[str, Any]] | None = None,
    user_profile: dict[str, Any] | None = None,
    conversation_history: list[dict[str, str]] | None = None,
) -> str:
    query_text = _safe_text(query)
    selected = _select_context(_prepare_context(context_chunks))
    mode = _normalize_role_mode(role_mode)
    depth = _normalize_thinking(thinking)
    attachment_list = attachments or []
    profile = user_profile or {}
    history = conversation_history or []

    context_lines: list[str] = []
    for i, chunk in enumerate(selected, start=1):
        act = _safe_text(chunk.get("act")) or "Unknown Act"
        section = _safe_text(chunk.get("section")) or "Unknown Section"
        text = _safe_text(chunk.get("text"))
        context_lines.append(f"{i}. [Source: {act} | {section}] {text}")

    context_block = "\n".join(context_lines) if context_lines else "None"

    history_lines: list[str] = []
    for item in history[-6:]:
        role = _safe_text(item.get("role") or "user")
        content = _safe_text(item.get("content"))[:260]
        if content:
            history_lines.append(f"- {role}: {content}")
    history_block = "\n".join(history_lines) if history_lines else "None"

    attachment_lines: list[str] = []
    for i, attachment in enumerate(attachment_list, start=1):
        name = _safe_text(attachment.get("name") or attachment.get("filename") or f"attachment_{i}")
        kind = _safe_text(attachment.get("type") or attachment.get("mime_type") or "file")
        extracted = _safe_text(
            attachment.get("extracted_text")
            or attachment.get("ocr_text")
            or attachment.get("text")
            or attachment.get("summary")
        )
        extracted_snippet = extracted[:400] if extracted else "No extractable text provided"
        attachment_lines.append(f"{i}. [Attachment: {name} | {kind}] {extracted_snippet}")

    attachment_block = "\n".join(attachment_lines) if attachment_lines else "None"
    user_profile_block = json.dumps(profile, ensure_ascii=True) if profile else "None"
    history_turns = len(history)

    return (
        "RUNTIME INPUTS (from UI/state)\n"
        f"- user_query: {query_text}\n"
        f"- mode: {mode}\n"
        f"- thinking: {depth}\n"
        f"- attachments_count: {len(attachment_list)}\n"
        f"- user_profile: {user_profile_block}\n"
        f"- conversation_history_turns: {history_turns}\n\n"
        "Conversation History (recent)\n"
        f"{history_block}\n\n"
        "Context:\n"
        f"{context_block}\n\n"
        "Attachments:\n"
        f"{attachment_block}\n\n"
        "CORE BEHAVIOR\n"
        "1) Depth control:\n"
        "- If thinking = on: provide deep, long-form analysis with legal reasoning, edge cases, and alternatives.\n"
        "- If thinking = off: provide concise but useful answer; no shallow one-liners.\n"
        "2) Mode control:\n"
        "- If mode = normal: use plain language and practical guidance.\n"
        "- If mode = lawyer: use legal-professional style with section mapping, interpretation notes, ambiguity flags, and risk framing.\n"
        "3) Attachment handling:\n"
        "- If attachments exist, use extracted text and explicitly state what was derived from attachments.\n"
        "- If attachment text is missing/unclear, clearly state what is unclear and ask targeted follow-up questions.\n"
        "4) Anti-short-answer rule:\n"
        "- Do not return generic 2-3 line responses unless user explicitly asks for brief output.\n"
        "- Minimum quality bar: answer + legal basis + practical steps + caveats.\n"
        "5) Legal reliability:\n"
        "- Prioritize Indian labour codes/acts, official notifications, and authoritative sources in context.\n"
        "- Distinguish black-letter law, interpretation/practice, and assumptions.\n"
        "6) Safety and honesty:\n"
        "- Never fabricate sections/citations/notifications.\n"
        "- If unsure, state unknowns and verification path.\n"
        "- Add disclaimer: This is informational and not a substitute for formal legal advice.\n\n"
        "RESPONSE FORMAT (default)\n"
        "A) Direct Answer\n"
        "- 3-6 bullet summary of the conclusion.\n"
        "B) Legal Basis\n"
        "- Relevant Act/Code + Section numbers + plain explanation.\n"
        "C) Detailed Analysis\n"
        "- Apply law to user facts, including exceptions/thresholds/timelines where available.\n"
        "D) Practical Action Plan\n"
        "- Step-by-step actions user should take now.\n"
        "E) Risks, Caveats, and Unknowns\n"
        "- What may change answer (state rules, notifications, missing facts).\n"
        "F) Sources / Citations Used\n"
        "- List statutes/sections and retrieved references.\n"
        "G) Confidence\n"
        "- High/Medium/Low with one-line reason.\n\n"
        "SPECIAL INSTRUCTION FOR WAGE / COMPLIANCE QUERIES\n"
        "- Always include applicability (who is covered), authority responsible (Central/State), rate revision concept, and compliance consequences for non-payment/non-compliance.\n\n"
        "FINAL QUALITY CHECK BEFORE SENDING\n"
        "- Did I answer the exact user question?\n"
        "- Did I provide legal basis?\n"
        "- Did I give practical next steps?\n"
        "- Did I adapt to mode + thinking toggle?\n"
        "- Did I use attachments if provided?\n"
        "- Is the response sufficiently detailed unless brief was requested?\n\n"
        "If insufficient context, reply exactly with: "
        f"{FALLBACK_MESSAGE}"
    )


def _normalize_answer_layout(answer: str) -> str:
    answer_text = _safe_text(answer)
    if not answer_text:
        return FALLBACK_MESSAGE

    if answer_text == FALLBACK_MESSAGE:
        return answer_text

    if answer_text.startswith(("Gemini API", "OpenRouter", "Unsupported provider")):
        return answer_text

    answer_text = answer_text.replace("\r\n", "\n").replace("\r", "\n")
    answer_text = re.sub(r"\n{3,}", "\n\n", answer_text).strip()

    structured_markers = (
        "a) direct answer",
        "b) legal basis",
        "c) detailed analysis",
        "d) practical action plan",
        "e) risks, caveats, and unknowns",
        "f) sources / citations used",
        "g) confidence",
        "direct answer",
        "legal basis",
        "sources:",
    )
    if any(marker in answer_text.lower() for marker in structured_markers):
        return answer_text

    if "\n" not in answer_text:
        sentences = [
            item.strip()
            for item in re.split(r"(?<=[.!?])\s+", answer_text)
            if item.strip()
        ]
        if len(sentences) >= 2:
            direct_points = sentences[:2]
            legal_points = sentences[2:4]

            lines = ["Direct Answer:"]
            lines.extend(f"- {point}" for point in direct_points)

            if legal_points:
                lines.append("")
                lines.append("Legal Basis:")
                lines.extend(f"- {point}" for point in legal_points)

            lines.append("")
            lines.append("Practical Note:")
            lines.append("- Check the exact government notification and worker category before relying on the final rate or entitlement.")
            return "\n".join(lines).strip()

    return answer_text


def _finalize_response(answer: str, context_chunks: list[dict[str, Any]]) -> dict[str, Any]:
    selected = _select_context(_prepare_context(context_chunks))
    sources = _build_sources(selected)
    answer_text = _normalize_answer_layout(answer)
    confidence = _confidence(selected)

    if confidence > 0.75:
        confidence_label = "high"
    elif confidence > 0.5:
        confidence_label = "medium"
    else:
        confidence_label = "low"

    if answer_text != FALLBACK_MESSAGE and sources:
        citation_lines = [f"- {src['act']} ({src['section']})" for src in sources[:3]]
        if "source" not in answer_text.lower() and "section" not in answer_text.lower():
            answer_text = f"{answer_text}\n\nSources:\n" + "\n".join(citation_lines)

    return {
        "answer": answer_text,
        "sources": sources,
        "confidence": confidence,
        "confidence_label": confidence_label,
    }


def _read_gemini_usage_metadata(response: Any) -> dict[str, int | None]:
    usage = getattr(response, "usage_metadata", None)
    if not usage:
        return {
            "prompt_tokens": None,
            "completion_tokens": None,
            "total_tokens": None,
        }

    return {
        "prompt_tokens": getattr(usage, "prompt_token_count", None),
        "completion_tokens": getattr(usage, "candidates_token_count", None),
        "total_tokens": getattr(usage, "total_token_count", None),
    }


def _resolve_provider_model(provider: str, requested_model: str | None) -> str:
    normalized_provider = _normalize_provider(provider)
    if normalized_provider == "openrouter":
        return (
            _normalize_openrouter_model_name(requested_model)
            or _normalize_openrouter_model_name(os.getenv("OPENROUTER_MODEL", ""))
            or _normalize_openrouter_model_name(getattr(settings, "openrouter_model", ""))
            or DEFAULT_OPENROUTER_MODEL
        )

    return (
        _safe_text(requested_model)
        or _safe_text(os.getenv("LLM_MODEL", ""))
        or _safe_text(getattr(settings, "llm_model", ""))
        or DEFAULT_GEMINI_MODEL
    )


def generate_answer(
    query: str,
    context_chunks: list[dict[str, Any]],
    model_name: str | None = DEFAULT_GEMINI_MODEL,
    api_key: str | None = None,
    provider: str = "gemini",
    role_mode: str = "normal",
    thinking: str | bool = "off",
    attachments: list[dict[str, Any]] | None = None,
    user_profile: dict[str, Any] | None = None,
    conversation_history: list[dict[str, str]] | None = None,
    response_mode: str | None = None,
) -> dict[str, Any]:
    start_time = time.time()
    selected = _select_context(_prepare_context(context_chunks))
    thinking_mode = _normalize_thinking(thinking, response_mode=response_mode)
    max_output_tokens = _response_token_budget(thinking_mode)
    prompt = build_prompt(
        query,
        selected,
        role_mode=role_mode,
        thinking=thinking_mode,
        attachments=attachments,
        user_profile=user_profile,
        conversation_history=conversation_history,
    )
    normalized_provider = _normalize_provider(provider)
    resolved_model_name = _resolve_provider_model(normalized_provider, model_name)

    logger.info(
        "Generation prompt | provider=%s | chars=%d | est_tokens=%d | context_chunks=%d",
        normalized_provider,
        len(prompt),
        _estimate_prompt_tokens(prompt),
        len(selected),
    )

    if not _context_is_sufficient(selected):
        response = _finalize_response(FALLBACK_MESSAGE, selected)
        logger.info("Generation fallback | provider=%s | reason=insufficient_context | latency=%.3fs", normalized_provider, time.time() - start_time)
        return response

    if normalized_provider == "gemini":
        return _generate_gemini_answer(
            prompt,
            selected,
            resolved_model_name,
            api_key,
            start_time,
            max_output_tokens=max_output_tokens,
        )
    if normalized_provider == "openrouter":
        return _generate_openrouter_answer(
            prompt,
            selected,
            resolved_model_name,
            api_key,
            start_time,
            max_output_tokens=max_output_tokens,
        )

    logger.warning("Generation fallback | reason=unsupported_provider | provider=%s", normalized_provider)
    return _finalize_response("Unsupported provider requested.", selected)


def _generate_gemini_answer(
    prompt: str,
    selected: list[dict[str, Any]],
    model_name: str,
    api_key: str | None,
    start_time: float,
    *,
    max_output_tokens: int,
) -> dict[str, Any]:
    resolved_key = _get_api_key("gemini", api_key)
    if not resolved_key:
        response = _finalize_response(MISSING_GEMINI_KEY_MESSAGE, selected)
        logger.warning("Generation fallback | provider=gemini | reason=missing_gemini_api_key | latency=%.3fs", time.time() - start_time)
        return response

    last_error: Exception | None = None
    for candidate_model in _candidate_gemini_models(model_name):
        try:
            model = _get_model(api_key=resolved_key, model_name=candidate_model)
            result = model.generate_content(
                prompt,
                generation_config={"temperature": 0.1, "max_output_tokens": max_output_tokens},
                stream=False,
                request_options={"timeout": PROVIDER_TIMEOUT_SECONDS},
            )

            raw_answer = _safe_text(getattr(result, "text", ""))
            answer = raw_answer or FALLBACK_MESSAGE
            usage = _read_gemini_usage_metadata(result)

            latency = time.time() - start_time
            logger.info(
                "Generation completed | provider=gemini | model=%s | latency=%.3fs | prompt_tokens=%s | completion_tokens=%s | total_tokens=%s",
                candidate_model,
                latency,
                usage["prompt_tokens"],
                usage["completion_tokens"],
                usage["total_tokens"],
            )

            return _finalize_response(answer, selected)
        except Exception as exc:
            last_error = exc
            if _is_gemini_model_not_found_error(exc):
                logger.warning("Generation model unavailable | provider=gemini | model=%s | error=%s", candidate_model, exc)
                continue
            provider_error = _gemini_provider_error_message(exc)
            if provider_error:
                logger.warning(
                    "Generation provider unavailable | provider=gemini | model=%s | error=%s | latency=%.3fs",
                    candidate_model,
                    exc,
                    time.time() - start_time,
                )
                return _finalize_response(provider_error, selected)
            logger.warning("Generation failed | provider=gemini | model=%s | error=%s | latency=%.3fs", candidate_model, exc, time.time() - start_time)
            return _finalize_response(FALLBACK_MESSAGE, selected)

    if last_error:
        provider_error = _gemini_provider_error_message(last_error)
        if provider_error:
            logger.warning("Generation provider unavailable after retries | provider=gemini | error=%s | latency=%.3fs", last_error, time.time() - start_time)
            return _finalize_response(provider_error, selected)

    logger.warning("Generation failed after trying fallback models | provider=gemini | error=%s | latency=%.3fs", last_error, time.time() - start_time)
    return _finalize_response(FALLBACK_MESSAGE, selected)


def _generate_openrouter_answer(
    prompt: str,
    selected: list[dict[str, Any]],
    model_name: str,
    api_key: str | None,
    start_time: float,
    *,
    max_output_tokens: int,
) -> dict[str, Any]:
    resolved_key = _get_api_key("openrouter", api_key)
    if not resolved_key:
        response = _finalize_response(MISSING_OPENROUTER_KEY_MESSAGE, selected)
        logger.warning("Generation fallback | provider=openrouter | reason=missing_openrouter_api_key | latency=%.3fs", time.time() - start_time)
        return response

    last_error: Exception | None = None
    for candidate_model in _candidate_openrouter_models(model_name):
        try:
            body = {
                "model": candidate_model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.1,
                "max_tokens": max_output_tokens,
            }
            with _openrouter_request(resolved_key, body) as response:
                payload = json.loads(response.read().decode("utf-8"))

            answer = _extract_openrouter_message_text(payload) or FALLBACK_MESSAGE
            usage = _read_openrouter_usage(payload)

            latency = time.time() - start_time
            logger.info(
                "Generation completed | provider=openrouter | model=%s | latency=%.3fs | prompt_tokens=%s | completion_tokens=%s | total_tokens=%s",
                candidate_model,
                latency,
                usage["prompt_tokens"],
                usage["completion_tokens"],
                usage["total_tokens"],
            )

            return _finalize_response(answer, selected)
        except Exception as exc:
            last_error = exc
            if _is_openrouter_model_not_found_error(exc):
                logger.warning("Generation model unavailable | provider=openrouter | model=%s | error=%s", candidate_model, exc)
                continue
            provider_error = _openrouter_provider_error_message(exc)
            if provider_error:
                logger.warning(
                    "Generation provider unavailable | provider=openrouter | model=%s | error=%s | latency=%.3fs",
                    candidate_model,
                    exc,
                    time.time() - start_time,
                )
                return _finalize_response(provider_error, selected)
            logger.warning("Generation failed | provider=openrouter | model=%s | error=%s | latency=%.3fs", candidate_model, exc, time.time() - start_time)
            return _finalize_response(FALLBACK_MESSAGE, selected)

    if last_error:
        provider_error = _openrouter_provider_error_message(last_error)
        if provider_error:
            logger.warning("Generation provider unavailable after retries | provider=openrouter | error=%s | latency=%.3fs", last_error, time.time() - start_time)
            return _finalize_response(provider_error, selected)

    logger.warning("Generation failed after trying fallback models | provider=openrouter | error=%s | latency=%.3fs", last_error, time.time() - start_time)
    return _finalize_response(FALLBACK_MESSAGE, selected)


def stream_answer(
    query: str,
    context_chunks: list[dict[str, Any]],
    model_name: str | None = DEFAULT_GEMINI_MODEL,
    api_key: str | None = None,
    provider: str = "gemini",
    role_mode: str = "normal",
    thinking: str | bool = "off",
    attachments: list[dict[str, Any]] | None = None,
    user_profile: dict[str, Any] | None = None,
    conversation_history: list[dict[str, str]] | None = None,
    response_mode: str | None = None,
) -> Generator[dict[str, Any], None, None]:
    start_time = time.time()
    selected = _select_context(_prepare_context(context_chunks))
    thinking_mode = _normalize_thinking(thinking, response_mode=response_mode)
    max_output_tokens = _response_token_budget(thinking_mode)
    prompt = build_prompt(
        query,
        selected,
        role_mode=role_mode,
        thinking=thinking_mode,
        attachments=attachments,
        user_profile=user_profile,
        conversation_history=conversation_history,
    )
    normalized_provider = _normalize_provider(provider)
    resolved_model_name = _resolve_provider_model(normalized_provider, model_name)

    logger.info(
        "Streaming prompt | provider=%s | chars=%d | est_tokens=%d | context_chunks=%d",
        normalized_provider,
        len(prompt),
        _estimate_prompt_tokens(prompt),
        len(selected),
    )

    if not _context_is_sufficient(selected):
        final_payload = _finalize_response(FALLBACK_MESSAGE, selected)
        logger.info("Streaming fallback | provider=%s | reason=insufficient_context | latency=%.3fs", normalized_provider, time.time() - start_time)
        yield {"type": "final", "response": final_payload}
        return

    if normalized_provider == "gemini":
        yield from _stream_gemini_answer(
            prompt,
            selected,
            resolved_model_name,
            api_key,
            start_time,
            max_output_tokens=max_output_tokens,
        )
        return
    if normalized_provider == "openrouter":
        yield from _stream_openrouter_answer(
            prompt,
            selected,
            resolved_model_name,
            api_key,
            start_time,
            max_output_tokens=max_output_tokens,
        )
        return

    logger.warning("Streaming fallback | reason=unsupported_provider | provider=%s", normalized_provider)
    yield {"type": "final", "response": _finalize_response("Unsupported provider requested.", selected)}


def _stream_gemini_answer(
    prompt: str,
    selected: list[dict[str, Any]],
    model_name: str,
    api_key: str | None,
    start_time: float,
    *,
    max_output_tokens: int,
) -> Generator[dict[str, Any], None, None]:
    resolved_key = _get_api_key("gemini", api_key)
    if not resolved_key:
        final_payload = _finalize_response(MISSING_GEMINI_KEY_MESSAGE, selected)
        logger.warning("Streaming fallback | provider=gemini | reason=missing_gemini_api_key | latency=%.3fs", time.time() - start_time)
        yield {"type": "final", "response": final_payload}
        return

    chunks: list[str] = []
    usage: dict[str, int | None] = {
        "prompt_tokens": None,
        "completion_tokens": None,
        "total_tokens": None,
    }

    last_error: Exception | None = None
    for candidate_model in _candidate_gemini_models(model_name):
        try:
            model = _get_model(api_key=resolved_key, model_name=candidate_model)
            stream = model.generate_content(
                prompt,
                generation_config={"temperature": 0.1, "max_output_tokens": max_output_tokens},
                stream=True,
                request_options={"timeout": PROVIDER_TIMEOUT_SECONDS},
            )

            for event in stream:
                text = _safe_text(getattr(event, "text", ""))
                if text:
                    chunks.append(text)
                    yield {"type": "delta", "text": text}

                usage = _read_gemini_usage_metadata(event)

            answer = "".join(chunks).strip() or FALLBACK_MESSAGE
            final_payload = _finalize_response(answer, selected)

            latency = time.time() - start_time
            logger.info(
                "Streaming completed | provider=gemini | model=%s | latency=%.3fs | prompt_tokens=%s | completion_tokens=%s | total_tokens=%s",
                candidate_model,
                latency,
                usage["prompt_tokens"],
                usage["completion_tokens"],
                usage["total_tokens"],
            )

            yield {"type": "final", "response": final_payload}
            return
        except Exception as exc:
            last_error = exc
            if _is_gemini_model_not_found_error(exc):
                logger.warning("Streaming model unavailable | provider=gemini | model=%s | error=%s", candidate_model, exc)
                chunks.clear()
                continue
            provider_error = _gemini_provider_error_message(exc)
            if provider_error:
                logger.warning(
                    "Streaming provider unavailable | provider=gemini | model=%s | error=%s | latency=%.3fs",
                    candidate_model,
                    exc,
                    time.time() - start_time,
                )
                final_payload = _finalize_response(provider_error, selected)
                yield {"type": "final", "response": final_payload}
                return
            logger.warning("Streaming failed | provider=gemini | model=%s | error=%s | latency=%.3fs", candidate_model, exc, time.time() - start_time)
            yield {"type": "final", "response": _finalize_response(FALLBACK_MESSAGE, selected)}
            return

    if last_error:
        provider_error = _gemini_provider_error_message(last_error)
        if provider_error:
            logger.warning("Streaming provider unavailable after retries | provider=gemini | error=%s | latency=%.3fs", last_error, time.time() - start_time)
            yield {"type": "final", "response": _finalize_response(provider_error, selected)}
            return

    logger.warning("Streaming failed after trying fallback models | provider=gemini | error=%s | latency=%.3fs", last_error, time.time() - start_time)
    yield {"type": "final", "response": _finalize_response(FALLBACK_MESSAGE, selected)}


def _stream_openrouter_answer(
    prompt: str,
    selected: list[dict[str, Any]],
    model_name: str,
    api_key: str | None,
    start_time: float,
    *,
    max_output_tokens: int,
) -> Generator[dict[str, Any], None, None]:
    resolved_key = _get_api_key("openrouter", api_key)
    if not resolved_key:
        final_payload = _finalize_response(MISSING_OPENROUTER_KEY_MESSAGE, selected)
        logger.warning("Streaming fallback | provider=openrouter | reason=missing_openrouter_api_key | latency=%.3fs", time.time() - start_time)
        yield {"type": "final", "response": final_payload}
        return

    last_error: Exception | None = None
    for candidate_model in _candidate_openrouter_models(model_name):
        try:
            body = {
                "model": candidate_model,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.1,
                "max_tokens": max_output_tokens,
                "stream": True,
            }
            chunks: list[str] = []
            usage = {
                "prompt_tokens": None,
                "completion_tokens": None,
                "total_tokens": None,
            }

            with _openrouter_request(resolved_key, body) as response:
                for raw_line in response:
                    line = raw_line.decode("utf-8", errors="ignore").strip()
                    if not line or line.startswith(":") or not line.startswith("data:"):
                        continue

                    data_str = line.replace("data:", "", 1).strip()
                    if not data_str:
                        continue
                    if data_str == "[DONE]":
                        break

                    event = json.loads(data_str)
                    choices = event.get("choices") or []
                    delta = choices[0].get("delta") if choices else {}
                    text = _extract_openrouter_delta_text((delta or {}).get("content"))
                    if text:
                        chunks.append(text)
                        yield {"type": "delta", "text": text}

                    usage = _read_openrouter_usage(event)

            answer = "".join(chunks).strip() or FALLBACK_MESSAGE
            final_payload = _finalize_response(answer, selected)

            latency = time.time() - start_time
            logger.info(
                "Streaming completed | provider=openrouter | model=%s | latency=%.3fs | prompt_tokens=%s | completion_tokens=%s | total_tokens=%s",
                candidate_model,
                latency,
                usage["prompt_tokens"],
                usage["completion_tokens"],
                usage["total_tokens"],
            )

            yield {"type": "final", "response": final_payload}
            return
        except Exception as exc:
            last_error = exc
            if _is_openrouter_model_not_found_error(exc):
                logger.warning("Streaming model unavailable | provider=openrouter | model=%s | error=%s", candidate_model, exc)
                continue
            provider_error = _openrouter_provider_error_message(exc)
            if provider_error:
                logger.warning(
                    "Streaming provider unavailable | provider=openrouter | model=%s | error=%s | latency=%.3fs",
                    candidate_model,
                    exc,
                    time.time() - start_time,
                )
                yield {"type": "final", "response": _finalize_response(provider_error, selected)}
                return
            logger.warning("Streaming failed | provider=openrouter | model=%s | error=%s | latency=%.3fs", candidate_model, exc, time.time() - start_time)
            yield {"type": "final", "response": _finalize_response(FALLBACK_MESSAGE, selected)}
            return

    if last_error:
        provider_error = _openrouter_provider_error_message(last_error)
        if provider_error:
            logger.warning("Streaming provider unavailable after retries | provider=openrouter | error=%s | latency=%.3fs", last_error, time.time() - start_time)
            yield {"type": "final", "response": _finalize_response(provider_error, selected)}
            return

    logger.warning("Streaming failed after trying fallback models | provider=openrouter | error=%s | latency=%.3fs", last_error, time.time() - start_time)
    yield {"type": "final", "response": _finalize_response(FALLBACK_MESSAGE, selected)}
