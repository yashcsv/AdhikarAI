"""Lightweight pipeline orchestration for AdhikarAI."""

from __future__ import annotations

import hashlib
import html
import json
import logging
import re
import tempfile
import time
import uuid
import urllib.error
import urllib.parse
import urllib.request
from base64 import urlsafe_b64encode
from pathlib import Path
from typing import Any, Generator

import pdfplumber


from backend.indexing.pipeline import build_bm25, hybrid_search, load_index
from backend.llm.pipeline import generate_answer, stream_answer, validate_api_key
from backend.observability.langsmith import traceable_if_enabled
from backend.reranker.pipeline import load_reranker_model, rerank_results
from configs.config import settings

logger = logging.getLogger(__name__)

_STREAM_CONTROL: dict[str, dict[str, Any]] = {}
CONFIDENCE_MIN = 0.65
CONFIDENCE_MAX = 0.93


class RAGOrchestrator:
	"""Coordinates retrieval, reranking, generation, and product-level controls."""

	def __init__(self, index_dir: str | Path = "data/index") -> None:
		self.index_dir = Path(index_dir)
		self.index = None
		self.metadata: list[dict[str, Any]] = []
		self.bm25 = None
		self.reranker = None
		self._uploaded_chunks: dict[str, list[dict[str, Any]]] = {}
		self._load_runtime()

	def _load_runtime(self) -> None:
		if self.index is None or self.bm25 is None or self.reranker is None:
			self.index, self.metadata = load_index(self.index_dir)
			self.bm25 = build_bm25(self.metadata)
			self.reranker = load_reranker_model(strategy="cross-encoder")
			logger.info("RAG runtime initialized with %d indexed chunks", len(self.metadata))

	def _apply_memory(self, query: str, memory: list[dict[str, str]], window: int = 4) -> str:
		if not memory:
			return query

		recent = memory[-window:]
		history_lines = []
		for item in recent:
			role = str(item.get("role", "user"))
			text = str(item.get("content", "")).strip()
			if text:
				history_lines.append(f"{role}: {text}")

		if not history_lines:
			return query

		return f"Conversation memory:\n" + "\n".join(history_lines) + f"\n\nCurrent question: {query}"

	def _rewrite_query(self, query: str, enabled: bool) -> str:
		if not enabled:
			return query

		# Heuristic lightweight rewrite to preserve CPU/RAM budget.
		q = query.strip()
		replacements = {
			"wage": "wage minimum rate",
			"maternity": "maternity benefit eligibility",
			"gratuity": "gratuity eligibility payment",
			"hours": "working hours overtime",
		}
		for key, value in replacements.items():
			if key in q.lower():
				return f"{q} (focus on {value} in Indian labor law)"
		return q

	def _query_variants(self, query: str, rewrite_enabled: bool, multi_enabled: bool) -> list[str]:
		rewritten = self._rewrite_query(query, enabled=rewrite_enabled)
		if not multi_enabled:
			return [rewritten]
		# Hard limit to two variants for low-resource safety.
		if rewritten == query:
			return [query, f"{query} under Indian labor law"]
		return [query, rewritten]

	def _retrieve(self, query_variants: list[str], top_k: int, alpha: float) -> tuple[list[dict[str, Any]], dict[str, Any]]:
		start = time.time()
		merged: dict[int, dict[str, Any]] = {}

		for variant in query_variants[:2]:
			results = hybrid_search(
				variant,
				self.index,
				self.metadata,
				self.bm25,
				top_k=max(4, min(12, top_k)),
				alpha=alpha,
				debug=False,
			)
			for item in results:
				doc_id = int(item.get("id", -1))
				if doc_id < 0:
					continue
				if doc_id not in merged or float(item.get("score", 0.0)) > float(merged[doc_id].get("score", 0.0)):
					merged[doc_id] = item

		retrieved = sorted(merged.values(), key=lambda x: float(x.get("score", 0.0)), reverse=True)[:top_k]
		meta = {
			"retrieval_time_ms": (time.time() - start) * 1000.0,
			"retrieved_chunks": len(retrieved),
		}
		return retrieved, meta

	def _with_uploaded_chunks(self, session_id: str | None, chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
		if not session_id:
			return chunks
		extra = self._uploaded_chunks.get(session_id, [])
		if not extra:
			return chunks
		# Keep memory bounded.
		return (chunks + extra)[:15]

	def _apply_role_mode(self, query: str, role_mode: str, eli5: bool) -> str:
		mode = role_mode.lower().strip()
		if eli5 or mode == "eli5":
			return f"Explain in very simple terms for a beginner: {query}"
		if mode in {"worker", "normal"}:
			return f"Explain clearly in simple practical language for workers: {query}"
		return f"Explain in professional legal style: {query}"

	def _clean_snippet(self, text: str, max_chars: int = 260) -> str:
		compact = re.sub(r"\s+", " ", str(text or "")).strip()
		compact = re.sub(r"\[[^\]]*\]", "", compact)
		compact = compact.replace("PART II-", "").replace("PART II—", "")
		# Drop noisy repeated bare legal-year citations like "63 of 1948." in fallback snippets.
		compact = re.sub(r"\b\d{1,3}\s+of\s+\d{4}\.?", "", compact, flags=re.IGNORECASE)
		compact = re.sub(r"\s{2,}", " ", compact).strip()
		if len(compact) <= max_chars:
			return compact
		return compact[: max_chars - 3].rstrip() + "..."

	def _extract_query_keywords(self, query: str) -> list[str]:
		raw = re.findall(r"[a-zA-Z]{4,}", query.lower())
		stop = {
			"what",
			"when",
			"where",
			"which",
			"under",
			"india",
			"explain",
			"professional",
			"style",
		}
		return [token for token in raw if token not in stop][:8]

	def _chunk_relevance(self, query: str, chunk: dict[str, Any]) -> float:
		text = str(chunk.get("text", "")).lower()
		act = str(chunk.get("act", "")).lower()
		section = str(chunk.get("section", "")).lower()
		score = float(chunk.get("rerank_score", chunk.get("score", 0.0)))

		for kw in self._extract_query_keywords(query):
			if kw in text:
				score += 0.08
			if kw in act or kw in section:
				score += 0.05

		query_l = query.lower()
		if "wage" in query_l and "wage" in act:
			score += 0.20
		if "maternity" in query_l and "maternity" in act:
			score += 0.20
		if "gratuity" in query_l and "gratuity" in act:
			score += 0.20
		if ("hour" in query_l or "overtime" in query_l) and ("factory" in act or "occupational" in act):
			score += 0.15

		if "unknown section" in section:
			score -= 0.05

		return score

	def _select_relevant_chunks(self, query: str, context_chunks: list[dict[str, Any]], max_items: int = 6) -> list[dict[str, Any]]:
		scored = sorted(
			context_chunks,
			key=lambda c: self._chunk_relevance(query, c),
			reverse=True,
		)
		return scored[:max_items]

	def _infer_jurisdiction(self, query: str) -> dict[str, str]:
		query_l = query.lower()
		states = [
			"andhra pradesh",
			"assam",
			"bihar",
			"chhattisgarh",
			"delhi",
			"goa",
			"gujarat",
			"haryana",
			"himachal pradesh",
			"jharkhand",
			"karnataka",
			"kerala",
			"madhya pradesh",
			"maharashtra",
			"odisha",
			"punjab",
			"rajasthan",
			"tamil nadu",
			"telangana",
			"uttar pradesh",
			"west bengal",
		]

		for state in states:
			if state in query_l:
				return {
					"label": state.title(),
					"note": "State-specific notified rates and category mappings apply. Confirm the latest state notification before payroll decisions.",
				}

		if "central" in query_l:
			return {
				"label": "Central",
				"note": "Central notifications typically apply where the Central Government is the appropriate government for the establishment.",
			}

		return {
			"label": "Not specified",
			"note": "Applicable rates depend on whether the Central or State Government is the appropriate government and on local notifications.",
		}

	def _build_professional_local_brief(
		self,
		query: str,
		context_chunks: list[dict[str, Any]],
		response_mode: str = "detailed",
	) -> tuple[str, list[dict[str, str]]]:
		relevant_chunks = self._select_relevant_chunks(query, context_chunks, max_items=8)
		mode = str(response_mode or "detailed").lower().strip()
		jurisdiction = self._infer_jurisdiction(query)
		unique_sources: list[dict[str, str]] = []
		seen: set[tuple[str, str]] = set()
		for chunk in relevant_chunks:
			act = str(chunk.get("act", "Unknown Act")).strip() or "Unknown Act"
			section = str(chunk.get("section", "Unknown Section")).strip() or "Unknown Section"
			if section.lower() == "unknown section" and len(unique_sources) >= 3:
				continue
			snippet = self._clean_snippet(str(chunk.get("text", "")))
			key = (act, section)
			if key in seen:
				continue
			seen.add(key)
			unique_sources.append({"act": act, "section": section, "snippet": snippet})
			if len(unique_sources) >= 6:
				break

		query_l = query.lower()
		if "minimum wage" in query_l or "wage" in query_l:
			direct_answer = (
				"Minimum wage in India is a statutory floor rate fixed by the appropriate government, "
				"and wages cannot be paid below that notified threshold for the relevant category, skill level, "
				"location, and employment type."
			)
			compliance_focus = (
				"For practical compliance, identify the correct scheduled employment/category, map employee skill bands, "
				"and apply the currently notified minimum rates and revisions issued by the competent authority."
			)
		elif "maternity" in query_l:
			direct_answer = (
				"Maternity benefit law provides paid maternity leave and related protections, including entitlement "
				"conditions and payment safeguards, subject to statutory eligibility requirements."
			)
			compliance_focus = (
				"For practical compliance, verify eligibility period, leave duration, wage calculation basis, and payment "
				"timelines documented in the relevant statutory provisions."
			)
		elif "gratuity" in query_l:
			direct_answer = (
				"Gratuity eligibility is governed by statutory service and separation conditions, and the benefit becomes "
				"payable when those threshold criteria are satisfied under the governing law."
			)
			compliance_focus = (
				"For practical compliance, confirm years of continuous service, separation trigger, calculation basis, and "
				"any statutory caps or exceptions before computing payable gratuity."
			)
		elif "working hour" in query_l or "hours" in query_l or "overtime" in query_l:
			direct_answer = (
				"Working-hours regulation generally covers daily/weekly hour limits, rest intervals, and overtime treatment, "
				"with rule details varying by applicable statute and notified standards."
			)
			compliance_focus = (
				"For practical compliance, apply the correct law for the establishment type and ensure roster design, overtime "
				"calculation, and recordkeeping align with statutory limits and wage rules."
			)
		else:
			direct_answer = (
				"Based on the retrieved labor-law records, the legal position should be read from the cited Act and Section "
				"entries listed below, with interpretation anchored to those source extracts."
			)
			compliance_focus = (
				"For practical use, map your fact pattern to the cited provisions and validate applicability, thresholds, "
				"and effective notifications before taking action."
			)

		evidence_lines = [
			f"{idx}. {src['act']} ({src['section']}): {src['snippet']}"
			for idx, src in enumerate(unique_sources[:3], start=1)
		]

		reference_lines = [f"- {src['act']} ({src['section']})" for src in unique_sources]

		direct_bullets = [
			f"- {direct_answer}",
			"- The answer depends on the applicable government notification and category mapping.",
		]

		legal_basis_bullets = reference_lines[:3] if reference_lines else ["- No references available"]

		analysis_lines = [
			f"- {compliance_focus}",
			f"- Jurisdiction indicator: {jurisdiction['label']}. {jurisdiction['note']}",
		]
		if mode != "brief":
			analysis_lines.extend(
				[
					"- Edge case: verify whether Central or State government is the appropriate government for the establishment.",
					"- Edge case: confirm worker category/skill classification before final entitlement computation.",
				]
			)

		action_plan_lines = [
			"1. Identify the exact statute and section applicable to the establishment and worker category.",
			"2. Check latest effective notification/rate revision for the relevant jurisdiction.",
			"3. Validate payroll and attendance records against legal thresholds and timelines.",
		]
		if mode != "brief":
			action_plan_lines.append("4. Escalate disputed/high-risk matters for jurisdiction-specific legal review.")

		risk_lines = [
			"- This answer can change if jurisdiction, worker category, or latest notifications differ.",
			"- Unknowns: exact establishment classification and current effective rate notification.",
		]

		sources_section = "\n".join(reference_lines) if reference_lines else "- No references available"

		confidence_line = "- Medium: response is grounded in retrieved legal chunks, but applicability requires local notification verification."

		answer = (
			"A) Direct Answer\n"
			+ "\n".join(direct_bullets)
			+ "\n\nB) Legal Basis\n"
			+ "\n".join(legal_basis_bullets)
			+ "\n\nC) Detailed Analysis\n"
			+ "\n".join(analysis_lines)
			+ ("\n\nEvidence Notes\n" + "\n".join(evidence_lines) if evidence_lines and mode != "brief" else "")
			+ "\n\nD) Practical Action Plan\n"
			+ "\n".join(action_plan_lines)
			+ "\n\nE) Risks, Caveats, and Unknowns\n"
			+ "\n".join(risk_lines)
			+ "\n\nF) Sources / Citations Used\n"
			+ sources_section
			+ "\n\nG) Confidence\n"
			+ confidence_line
			+ "\n\nThis is informational and not a substitute for formal legal advice."
		)

		return answer, unique_sources

	def _provider_fallback_notice(self, provider_note: str) -> str:
		note = str(provider_note or "").strip()
		if not note:
			return ""
		note = note.split("\n\nSources:", 1)[0].strip()
		note = note.split("\nSources:", 1)[0].strip()
		return f"Fallback mode active: {note}"

	def _is_provider_notice(self, answer_text: str) -> bool:
		text = str(answer_text or "").strip()
		if not text:
			return False
		prefixes = (
			"Gemini API",
			"OpenRouter",
			"Unsupported provider",
		)
		return text.startswith(prefixes)

	def _clamp_confidence(self, value: Any) -> float:
		try:
			raw = float(value)
		except (TypeError, ValueError):
			raw = CONFIDENCE_MIN
		return max(CONFIDENCE_MIN, min(CONFIDENCE_MAX, raw))

	def _confidence_label(self, confidence: float) -> str:
		if confidence > 0.75:
			return "high"
		if confidence > 0.5:
			return "medium"
		return "low"

	def _normalize_confidence_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
		normalized = dict(payload or {})
		confidence = self._clamp_confidence(normalized.get("confidence", CONFIDENCE_MIN))
		normalized["confidence"] = confidence
		normalized["confidence_label"] = self._confidence_label(confidence)
		return normalized

	def _local_mock_answer(
		self,
		query: str,
		context_chunks: list[dict[str, Any]],
		response_mode: str = "detailed",
	) -> dict[str, Any]:
		if not context_chunks:
			confidence = self._clamp_confidence(CONFIDENCE_MIN)
			return {
				"answer": "Not enough information in the provided legal documents.",
				"sources": [],
				"confidence": confidence,
				"confidence_label": self._confidence_label(confidence),
			}

		relevant_chunks = self._select_relevant_chunks(query, context_chunks, max_items=6)
		answer, sources = self._build_professional_local_brief(query, relevant_chunks, response_mode=response_mode)
		top_score = float(relevant_chunks[0].get("rerank_score", relevant_chunks[0].get("score", 0.0)))
		confidence = self._clamp_confidence(top_score)
		label = self._confidence_label(confidence)

		return {
			"answer": answer,
			"sources": sources,
			"confidence": confidence,
			"confidence_label": label,
		}

	@traceable_if_enabled(name="adhikarai.pipeline.prepare", run_type="chain")
	def _prepare_pipeline(
		self,
		query: str,
		request: dict[str, Any],
		top_k: int,
		alpha: float,
		features: dict[str, Any],
		session_id: str | None,
		role_mode: str,
		eli5: bool,
	) -> dict[str, Any]:
		query_with_memory = self._apply_memory(query, request.get("conversation_memory", []))
		query_variants = self._query_variants(
			query_with_memory,
			rewrite_enabled=bool(features.get("query_rewrite", False)),
			multi_enabled=bool(features.get("multi_query", False)),
		)

		retrieved, retrieval_meta = self._retrieve(query_variants, top_k=top_k, alpha=alpha)
		retrieved = self._with_uploaded_chunks(session_id, retrieved)
		rerank_start = time.time()
		reranked = rerank_results(query, retrieved, self.reranker, max_candidates=top_k, debug=bool(features.get("show_debug", False)))
		rerank_ms = (time.time() - rerank_start) * 1000.0
		final_query = self._apply_role_mode(query, role_mode=role_mode, eli5=eli5)

		return {
			"query_variants": query_variants,
			"retrieved": retrieved,
			"retrieval_meta": retrieval_meta,
			"reranked": reranked,
			"rerank_ms": rerank_ms,
			"final_query": final_query,
		}

	@traceable_if_enabled(name="adhikarai.chat.run", run_type="chain")
	def run(self, request: dict[str, Any]) -> dict[str, Any]:
		query = str(request.get("query", "")).strip()
		if not query:
			return {
				"answer": "Please provide a query.",
				"sources": [],
				"confidence": 0.0,
				"confidence_label": "low",
				"meta": {},
				"latency": {},
			}

		top_k = int(request.get("top_k", 7))
		alpha = float(request.get("alpha", 0.6))
		features = request.get("features", {}) or {}
		role_mode = str(request.get("role_mode", "lawyer"))
		ui_mode = str(request.get("mode", "")).strip().lower()
		if ui_mode in {"normal", "lawyer"}:
			role_mode = ui_mode
		thinking = request.get("thinking", "off")
		attachments = request.get("attachments", []) or []
		user_profile = request.get("user_profile", {}) or {}
		eli5 = bool(request.get("eli5", False))
		model = str(request.get("model", "gemini"))
		model_name = str(request.get("model_name", "")).strip() or None
		response_mode = str(request.get("response_mode", "detailed") or "detailed").lower().strip()
		session_id = request.get("session_id")
		gemini_api_key = str(request.get("gemini_api_key", "")).strip() or None
		openrouter_api_key = str(request.get("openrouter_api_key", "")).strip() or None
		provider_api_key = openrouter_api_key if model == "openrouter" else gemini_api_key

		full_start = time.time()
		pipeline = self._prepare_pipeline(
			query=query,
			request=request,
			top_k=top_k,
			alpha=alpha,
			features=features,
			session_id=session_id,
			role_mode=role_mode,
			eli5=eli5,
		)

		query_variants = pipeline["query_variants"]
		retrieved = pipeline["retrieved"]
		retrieval_meta = pipeline["retrieval_meta"]
		reranked = pipeline["reranked"]
		rerank_ms = float(pipeline.get("rerank_ms", 0.0))
		final_query = pipeline["final_query"]

		generation_start = time.time()
		fallback_notice = ""
		if model == "local-mock":
			generated = self._local_mock_answer(final_query, reranked, response_mode=response_mode)
		else:
			generated = generate_answer(
				final_query,
				reranked,
				model_name=model_name,
				api_key=provider_api_key,
				provider=model,
				role_mode=role_mode,
				thinking=thinking,
				attachments=attachments,
				user_profile=user_profile,
				conversation_history=request.get("conversation_memory", []),
				response_mode=response_mode,
			)
			answer_text = str(generated.get("answer", ""))
			if self._is_provider_notice(answer_text):
				fallback = self._local_mock_answer(final_query, reranked, response_mode=response_mode)
				fallback_notice = self._provider_fallback_notice(answer_text)
				generated = fallback
			elif answer_text.strip() == "Not enough information in the provided legal documents." and reranked:
				generated = self._local_mock_answer(final_query, reranked, response_mode=response_mode)
				fallback_notice = "Fallback mode active: Served retrieval-grounded draft because LLM returned insufficient-context fallback."
		generation_ms = (time.time() - generation_start) * 1000.0

		meta = {
			"retrieved_chunks": len(retrieved),
			"response_mode": response_mode,
			"generation_notice": fallback_notice,
			"top_rerank_scores": [float(item.get("rerank_score", 0.0)) for item in reranked[:3]],
			"dense_sparse_top": [
				{
					"dense_score": float(item.get("dense_score", 0.0)),
					"sparse_score": float(item.get("sparse_score", 0.0)),
					"final_score": float(item.get("score", item.get("final_score", 0.0))),
				}
				for item in retrieved[:3]
			],
			"query_variants": query_variants,
		}



		response = {
			"answer": generated.get("answer", ""),
			"sources": generated.get("sources", []),
			"confidence": float(generated.get("confidence", 0.0)),
			"confidence_label": generated.get("confidence_label", "low"),
			"meta": meta,
			"latency": {
				"retrieval_time_ms": retrieval_meta["retrieval_time_ms"],
				"rerank_time_ms": rerank_ms,
				"generation_time_ms": generation_ms,
				"total_time_ms": (time.time() - full_start) * 1000.0,
			},
		}
		return self._normalize_confidence_payload(response)

	@traceable_if_enabled(name="adhikarai.chat.stream", run_type="chain")
	def stream(self, request: dict[str, Any]) -> Generator[dict[str, Any], None, None]:
		session_id = request.get("session_id") or str(uuid.uuid4())
		_STREAM_CONTROL[session_id] = {"status": "running", "buffer": []}

		query = str(request.get("query", "")).strip()
		if not query:
			yield {
				"type": "final",
				"response": {
					"answer": "Please provide a query.",
					"sources": [],
					"confidence": 0.0,
					"confidence_label": "low",
					"meta": {"session_id": session_id},
				},
			}
			return

		features = request.get("features", {}) or {}
		top_k = int(request.get("top_k", 7))
		alpha = float(request.get("alpha", 0.6))
		role_mode = str(request.get("role_mode", "lawyer"))
		ui_mode = str(request.get("mode", "")).strip().lower()
		if ui_mode in {"normal", "lawyer"}:
			role_mode = ui_mode
		thinking = request.get("thinking", "off")
		attachments = request.get("attachments", []) or []
		user_profile = request.get("user_profile", {}) or {}
		eli5 = bool(request.get("eli5", False))
		model = str(request.get("model", "gemini"))
		model_name = str(request.get("model_name", "")).strip() or None
		response_mode = str(request.get("response_mode", "detailed") or "detailed").lower().strip()
		gemini_api_key = str(request.get("gemini_api_key", "")).strip() or None
		openrouter_api_key = str(request.get("openrouter_api_key", "")).strip() or None
		provider_api_key = openrouter_api_key if model == "openrouter" else gemini_api_key

		pipeline = self._prepare_pipeline(
			query=query,
			request=request,
			top_k=top_k,
			alpha=alpha,
			features=features,
			session_id=session_id,
			role_mode=role_mode,
			eli5=eli5,
		)
		query_variants = pipeline["query_variants"]
		retrieved = pipeline["retrieved"]
		retrieval_meta = pipeline["retrieval_meta"]
		reranked = pipeline["reranked"]
		final_query = pipeline["final_query"]

		if model == "local-mock":
			local = self._local_mock_answer(final_query, reranked, response_mode=response_mode)
			for token in local["answer"].split(" "):
				if _STREAM_CONTROL.get(session_id, {}).get("status") == "stopped":
					break
				yield {"type": "delta", "text": token + " "}
			final_response = self._normalize_confidence_payload(
				{
					**local,
					"meta": {
						"session_id": session_id,
						"response_mode": response_mode,
						"retrieved_chunks": len(retrieved),
						"top_rerank_scores": [float(item.get("rerank_score", 0.0)) for item in reranked[:3]],
						"dense_sparse_top": [
							{
								"dense_score": float(item.get("dense_score", 0.0)),
								"sparse_score": float(item.get("sparse_score", 0.0)),
								"final_score": float(item.get("score", item.get("final_score", 0.0))),
							}
							for item in retrieved[:3]
						],
					},
					"latency": {"retrieval_time_ms": retrieval_meta["retrieval_time_ms"]},
				}
			)
			yield {
				"type": "final",
				"response": final_response,
			}
			return

		for event in stream_answer(
			final_query,
			reranked,
			model_name=model_name,
			api_key=provider_api_key,
			provider=model,
			role_mode=role_mode,
			thinking=thinking,
			attachments=attachments,
			user_profile=user_profile,
			conversation_history=request.get("conversation_memory", []),
			response_mode=response_mode,
		):
			status = _STREAM_CONTROL.get(session_id, {}).get("status", "running")
			if status == "stopped":
				break

			if event.get("type") == "delta":
				text = str(event.get("text", ""))
				if status == "paused":
					buffer = _STREAM_CONTROL[session_id].setdefault("buffer", [])
					# Keep bounded buffer to stay memory-safe.
					if len(buffer) < 128:
						buffer.append(text)
					continue

				buffer = _STREAM_CONTROL[session_id].setdefault("buffer", [])
				if buffer:
					yield {"type": "delta", "text": "".join(buffer)}
					buffer.clear()
				yield event
				continue

			if event.get("type") == "final":
				payload = event.get("response", {})
				answer_text = str(payload.get("answer", ""))
				if self._is_provider_notice(answer_text):
					fallback = self._local_mock_answer(final_query, reranked, response_mode=response_mode)
					notice = self._provider_fallback_notice(answer_text)
					payload.update(fallback)
					payload["meta"] = {**payload.get("meta", {}), "generation_notice": notice}
				elif answer_text.strip() == "Not enough information in the provided legal documents." and reranked:
					fallback = self._local_mock_answer(final_query, reranked, response_mode=response_mode)
					payload.update(fallback)
					payload["meta"] = {
						**payload.get("meta", {}),
						"generation_notice": "Fallback mode active: Served retrieval-grounded draft because LLM returned insufficient-context fallback.",
					}
				payload["meta"] = {
					**payload.get("meta", {}),
					"session_id": session_id,
					"response_mode": response_mode,
					"retrieved_chunks": len(retrieved),
					"top_rerank_scores": [float(item.get("rerank_score", 0.0)) for item in reranked[:3]],
					"dense_sparse_top": [
						{
							"dense_score": float(item.get("dense_score", 0.0)),
							"sparse_score": float(item.get("sparse_score", 0.0)),
							"final_score": float(item.get("score", item.get("final_score", 0.0))),
						}
						for item in retrieved[:3]
					],
				}
				payload["latency"] = {
					**payload.get("latency", {}),
					"retrieval_time_ms": retrieval_meta["retrieval_time_ms"],
				}
				payload = self._normalize_confidence_payload(payload)
				yield {"type": "final", "response": payload}
				break

		_STREAM_CONTROL.pop(session_id, None)

	def verify_api_key(self, provider: str, api_key: str, model_name: str | None = None) -> dict[str, Any]:
		valid, message = validate_api_key(api_key=api_key, model_name=model_name, provider=provider)
		return {"valid": bool(valid), "message": message}

	def control_stream(self, session_id: str, action: str) -> str:
		state = _STREAM_CONTROL.setdefault(session_id, {"status": "running", "buffer": []})
		action = action.lower().strip()
		if action == "stop":
			state["status"] = "stopped"
		elif action == "pause":
			state["status"] = "paused"
		elif action == "resume":
			state["status"] = "running"
		else:
			raise ValueError("Invalid action. Use stop, pause, or resume")
		return state["status"]



	def upload_pdf(self, session_id: str, filename: str, file_bytes: bytes) -> dict[str, Any]:
		if len(file_bytes) > 5 * 1024 * 1024:
			raise ValueError("File exceeds 5MB limit")

		with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
			temp_file.write(file_bytes)
			temp_path = Path(temp_file.name)

		chunks: list[dict[str, Any]] = []
		try:
			with pdfplumber.open(str(temp_path)) as pdf:
				for page_idx, page in enumerate(pdf.pages[:10], start=1):
					text = (page.extract_text() or "").strip()
					if not text:
						continue
					for part in _chunk_text(text, size=450, overlap=80):
						chunk_id = int(hashlib.md5(f"{filename}-{page_idx}-{part[:60]}".encode("utf-8")).hexdigest()[:8], 16)
						chunks.append(
							{
								"id": chunk_id,
								"text": part,
								"score": 0.45,
								"dense_score": 0.45,
								"sparse_score": 0.45,
								"source": filename,
								"act": "Uploaded Document",
								"section": f"Page {page_idx}",
							}
						)
		finally:
			try:
				temp_path.unlink(missing_ok=True)
			except Exception:
				pass

		self._uploaded_chunks[session_id] = chunks[:20]
		return {"status": "ok", "session_id": session_id, "chunks_added": len(self._uploaded_chunks[session_id])}




def _chunk_text(text: str, size: int = 450, overlap: int = 80) -> list[str]:
	if not text:
		return []
	if size <= overlap:
		raise ValueError("size must be greater than overlap")

	words = text.split()
	if not words:
		return []

	chunks: list[str] = []
	start = 0
	while start < len(words):
		end = min(start + size, len(words))
		chunks.append(" ".join(words[start:end]))
		if end == len(words):
			break
		start = max(0, end - overlap)
	return chunks


def _tokenize_query_keywords(query: str) -> list[str]:
	tokens = [token for token in query.lower().split() if len(token) > 3]
	return tokens[:8]
