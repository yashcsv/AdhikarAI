"""Lightweight reranking layer for AdhikarAI hybrid retrieval results.

Primary strategy:
- Cross-encoder reranking (small model on CPU)
Fallback strategy:
- Embedding cosine reranking (CPU-safe)
"""

from __future__ import annotations

import logging
import math
import time
from typing import Any

import numpy as np
from sentence_transformers import CrossEncoder, SentenceTransformer

logger = logging.getLogger(__name__)

CROSS_ENCODER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"
EMBEDDING_FALLBACK_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
RERANK_BATCH_SIZE = 8
MAX_RERANK_CANDIDATES = 15
DEFAULT_BETA = 0.7

_MODEL_CACHE: dict[str, Any] = {}


def _clamp01(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _sigmoid(value: float) -> float:
    if value >= 0:
        z = math.exp(-value)
        return 1.0 / (1.0 + z)
    z = math.exp(value)
    return z / (1.0 + z)


def load_reranker_model(
    strategy: str = "cross-encoder",
    cross_encoder_model_name: str = CROSS_ENCODER_MODEL,
    embedding_model_name: str = EMBEDDING_FALLBACK_MODEL,
) -> dict[str, Any]:
    """Load reranker model with fallback-friendly strategy configuration."""
    strategy = strategy.lower().strip()

    if strategy == "cross-encoder":
        cache_key = f"ce::{cross_encoder_model_name}"
        if cache_key in _MODEL_CACHE:
            return {"type": "cross-encoder", "model": _MODEL_CACHE[cache_key]}

        try:
            logger.info("Loading cross-encoder reranker on CPU: %s", cross_encoder_model_name)
            model = CrossEncoder(cross_encoder_model_name, device="cpu", local_files_only=True)
            _MODEL_CACHE[cache_key] = model
            return {"type": "cross-encoder", "model": model}
        except Exception as exc:
            logger.warning(
                "Cross-encoder loading failed from local cache (%s). Falling back to embedding reranker.",
                exc,
            )
            strategy = "embedding"

    if strategy == "embedding":
        cache_key = f"emb::{embedding_model_name}"
        if cache_key in _MODEL_CACHE:
            return {"type": "embedding", "model": _MODEL_CACHE[cache_key]}

        try:
            logger.info("Loading embedding fallback reranker on CPU: %s", embedding_model_name)
            model = SentenceTransformer(embedding_model_name, device="cpu", local_files_only=True)
            _MODEL_CACHE[cache_key] = model
            return {"type": "embedding", "model": model}
        except Exception as exc:
            logger.warning(
                "Embedding reranker loading failed from local cache (%s). Falling back to hybrid-score ordering.",
                exc,
            )
            return {"type": "hybrid", "model": None}

    raise ValueError("strategy must be 'cross-encoder' or 'embedding'")


def compute_rerank_scores(
    query: str,
    results: list[dict[str, Any]],
    model_bundle: dict[str, Any],
    batch_size: int = RERANK_BATCH_SIZE,
    return_timing: bool = False,
) -> list[float] | tuple[list[float], dict[str, float]]:
    """Compute normalized rerank scores in [0,1] for candidate results."""
    timing = {"embedding_time": 0.0, "scoring_time": 0.0}

    if not results:
        return ([], timing) if return_timing else []

    query_text = str(query).strip()
    if not query_text:
        return ([], timing) if return_timing else []

    if batch_size <= 0:
        raise ValueError("batch_size must be > 0")

    model_type = str(model_bundle.get("type", "")).strip()
    model = model_bundle.get("model")

    if model_type == "cross-encoder":
        pairs = [(query_text, str(item.get("text", ""))) for item in results]
        score_start = time.time()
        raw_scores = model.predict(pairs, batch_size=batch_size, show_progress_bar=False)
        timing["scoring_time"] = time.time() - score_start
        scores = [_clamp01(_sigmoid(float(score))) for score in raw_scores]
        return (scores, timing) if return_timing else scores

    if model_type == "embedding":
        texts = [str(item.get("text", "")) for item in results]

        embed_start = time.time()
        query_embedding = model.encode(
            [query_text],
            batch_size=1,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=True,
            device="cpu",
        )[0]

        doc_embeddings = model.encode(
            texts,
            batch_size=batch_size,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=True,
            device="cpu",
        )
        timing["embedding_time"] = time.time() - embed_start

        score_start = time.time()
        raw = np.dot(doc_embeddings, query_embedding)
        timing["scoring_time"] = time.time() - score_start
        scores = [_clamp01((float(score) + 1.0) / 2.0) for score in raw]
        return (scores, timing) if return_timing else scores

    if model_type == "hybrid":
        scores = [_clamp01(float(item.get("score", 0.0))) for item in results]
        return (scores, timing) if return_timing else scores

    raise ValueError("Invalid model bundle type")


def rerank_results(
    query: str,
    results: list[dict[str, Any]],
    model_bundle: dict[str, Any],
    beta: float = DEFAULT_BETA,
    max_candidates: int = MAX_RERANK_CANDIDATES,
    batch_size: int = RERANK_BATCH_SIZE,
    debug: bool = False,
) -> list[dict[str, Any]]:
    """Rerank top candidates and fuse rerank signal with hybrid score."""
    if not results:
        return []

    query_text = str(query).strip()
    if not query_text:
        return []

    beta = _clamp01(beta)
    if max_candidates <= 0:
        return []

    candidates = results[: min(len(results), max_candidates)]
    if debug and candidates:
        logger.info("Top candidate before rerank: %s", str(candidates[0].get("text", ""))[:100])

    logger.info("Reranking %d results for query: '%s'", len(candidates), query_text)

    start_time = time.time()
    try:
        rerank_scores, timing = compute_rerank_scores(
            query=query_text,
            results=candidates,
            model_bundle=model_bundle,
            batch_size=batch_size,
            return_timing=True,
        )

        fused: list[dict[str, Any]] = []
        for item, rerank_score in zip(candidates, rerank_scores):
            # Clamp rerank signal before fusion to guarantee bounded weighted scoring.
            rerank_score = _clamp01(float(rerank_score))
            hybrid_score = _clamp01(float(item.get("score", 0.0)))
            final_score = _clamp01(beta * rerank_score + (1.0 - beta) * hybrid_score)
            fused.append(
                {
                    "id": item.get("id"),
                    "text": item.get("text", ""),
                    "final_score": final_score,
                    "rerank_score": rerank_score,
                    "hybrid_score": hybrid_score,
                    "source": item.get("source", ""),
                    "act": item.get("act", ""),
                    "section": item.get("section", "Unknown Section"),
                }
            )

        fused.sort(key=lambda x: float(x["final_score"]), reverse=True)
        total_time = time.time() - start_time
        logger.info(
            "Reranking timing | embed=%.3fs | score=%.3fs | total=%.3fs",
            float(timing.get("embedding_time", 0.0)),
            float(timing.get("scoring_time", 0.0)),
            total_time,
        )
        if debug and fused:
            logger.info("Top candidate after rerank: %s", str(fused[0].get("text", ""))[:100])
        return fused
    except Exception as exc:
        total_time = time.time() - start_time
        logger.warning("Reranking failed after %.3fs: %s. Returning hybrid fallback.", total_time, exc)
        # Safe fallback keeps existing ordering and adds expected output fields.
        return [
            {
                "id": item.get("id"),
                "text": item.get("text", ""),
                "final_score": _clamp01(float(item.get("score", 0.0))),
                "rerank_score": _clamp01(float(item.get("score", 0.0))),
                "hybrid_score": _clamp01(float(item.get("score", 0.0))),
                "source": item.get("source", ""),
                "act": item.get("act", ""),
                "section": item.get("section", "Unknown Section"),
            }
            for item in candidates
        ]
