"""Incremental embedding and FAISS indexing pipeline for AdhikarAI.

Design goals:
- Memory-safe operation on low-resource machines (8GB RAM)
- File-by-file chunk processing (never load all chunk files at once)
- CPU-based embedding with all-MiniLM-L6-v2
"""

from __future__ import annotations

import argparse
import json
import logging
import pickle
import re
from pathlib import Path
from typing import Any

import faiss
import numpy as np
from rank_bm25 import BM25Okapi
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
BATCH_SIZE = 32
MAX_TOP_K = 50
_MODEL_CACHE: dict[str, SentenceTransformer] = {}
_BM25_CACHE: dict[int, BM25Okapi] = {}


def _iter_chunk_files(chunks_dir: Path) -> list[Path]:
    return sorted(
        [
            path
            for path in chunks_dir.glob("*.json")
            if path.is_file() and path.name not in {"manifest.json", "stats.json"}
        ]
    )


def _get_model(model_name: str = MODEL_NAME) -> SentenceTransformer:
    """Get a cached SentenceTransformer model instance on CPU."""
    if model_name not in _MODEL_CACHE:
        logger.info("Loading embedding model on CPU: %s", model_name)
        _MODEL_CACHE[model_name] = SentenceTransformer(model_name, device="cpu", local_files_only=True)
    return _MODEL_CACHE[model_name]


def _safe_metadata(chunk: dict[str, Any], entry_id: int) -> dict[str, Any]:
    metadata = chunk.get("metadata", {})
    if not isinstance(metadata, dict):
        metadata = {}

    return {
        "id": entry_id,
        "text": str(chunk.get("text", "")),
        "source": str(metadata.get("source", "")),
        "act": str(metadata.get("act", "")),
        "section": str(metadata.get("section", "Unknown Section")),
        "file_type": str(metadata.get("file_type", "supporting_act")),
    }


def tokenize(text: str) -> list[str]:
    """Lightweight tokenizer with better punctuation handling for legal text."""
    text = text.lower()
    text = text.replace("-", " ")
    return re.findall(r"\b[a-zA-Z0-9]+\b", text)


def load_chunks(file_path: str | Path) -> list[dict[str, Any]]:
    """Load chunk list from a single JSON file."""
    path = Path(file_path)
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"Chunk file not found: {path}")

    with path.open("r", encoding="utf-8") as f:
        payload = json.load(f)

    if not isinstance(payload, list):
        raise ValueError(f"Invalid chunk format (expected list): {path}")

    return [item for item in payload if isinstance(item, dict)]


def embed_chunks(
    chunks: list[dict[str, Any]],
    model: SentenceTransformer,
    batch_size: int = BATCH_SIZE,
) -> np.ndarray:
    """Embed chunk texts on CPU and return float32 vectors."""
    if batch_size <= 0:
        raise ValueError("batch_size must be > 0")

    texts = [str(chunk.get("text", "")) for chunk in chunks]
    if not texts:
        return np.zeros((0, 384), dtype=np.float32)

    embeddings = model.encode(
        texts,
        batch_size=batch_size,
        show_progress_bar=False,
        convert_to_numpy=True,
        normalize_embeddings=False,
        device="cpu",
    )
    return np.asarray(embeddings, dtype=np.float32)


def embed_query(
    query: str,
    model: SentenceTransformer | None = None,
    model_name: str = MODEL_NAME,
) -> np.ndarray:
    """Embed a single query using the same model and normalization settings."""
    query_text = str(query).strip()
    if not query_text:
        # Empty query guard: skip model inference and return empty embedding.
        return np.asarray([], dtype=np.float32)

    if model is None:
        model = _get_model(model_name=model_name)

    embedding = model.encode(
        [query_text],
        show_progress_bar=False,
        convert_to_numpy=True,
        normalize_embeddings=True,
        device="cpu",
    )[0]
    return np.asarray(embedding, dtype=np.float32)


def search(
    index: faiss.Index,
    metadata: list[dict[str, Any]],
    query_embedding: np.ndarray,
    top_k: int = 5,
) -> list[dict[str, Any]]:
    """Search FAISS index and return structured retrieval results."""
    if top_k <= 0:
        return []

    # Safety: if metadata/query embedding are empty, there is nothing to retrieve.
    if not metadata:
        return []

    query_vec = np.asarray(query_embedding, dtype=np.float32)
    if query_vec.size == 0:
        return []

    requested_top_k = top_k
    # Guard top_k against metadata length and enforce hard ceiling.
    top_k = min(top_k, len(metadata), MAX_TOP_K)
    if requested_top_k > MAX_TOP_K:
        logger.warning(
            "Requested top_k=%d exceeds MAX_TOP_K=%d. Clamped to %d.",
            requested_top_k,
            MAX_TOP_K,
            MAX_TOP_K,
        )

    vector = query_vec.reshape(1, -1)
    faiss.normalize_L2(vector)
    scores, indices = index.search(vector, top_k)

    results: list[dict[str, Any]] = []
    for i, idx in enumerate(indices[0]):
        if idx == -1:
            continue
        if idx < 0 or idx >= len(metadata):
            continue

        item = metadata[idx]
        raw_score = float(scores[0][i])
        # Normalize cosine score from [-1, 1] to [0, 1] for hybrid readiness.
        score = (raw_score + 1.0) / 2.0
        results.append(
            {
                "id": item.get("id", idx),
                "text": item.get("text", ""),
                "score": score,
                "source": item.get("source", ""),
                "act": item.get("act", ""),
                "section": item.get("section", "Unknown Section"),
            }
        )

    return results


def build_bm25(metadata: list[dict[str, Any]]) -> BM25Okapi:
    """Build or reuse a lightweight BM25 index over metadata texts."""
    cache_key = id(metadata)
    if cache_key in _BM25_CACHE:
        return _BM25_CACHE[cache_key]

    corpus = [str(item.get("text", "")) for item in metadata]
    tokenized_corpus = [tokenize(text) for text in corpus]
    bm25 = BM25Okapi(tokenized_corpus)
    _BM25_CACHE[cache_key] = bm25
    return bm25


def bm25_search(
    query: str,
    bm25: BM25Okapi,
    metadata: list[dict[str, Any]],
    top_k: int,
) -> list[dict[str, Any]]:
    """Run sparse retrieval using BM25 and return normalized sparse scores."""
    if top_k <= 0 or not metadata:
        return []

    query_text = str(query).strip()
    if not query_text:
        return []

    top_k = min(top_k, len(metadata), MAX_TOP_K)
    query_tokens = tokenize(query_text)
    if not query_tokens:
        return []

    scores = bm25.get_scores(query_tokens)
    if len(scores) == 0:
        return []

    max_score = float(np.max(scores)) if len(scores) > 0 else 0.0
    if max_score <= 0:
        return []

    top_indices = np.argsort(scores)[::-1][:top_k]
    results: list[dict[str, Any]] = []
    for idx in top_indices:
        if idx < 0 or idx >= len(metadata):
            continue
        item = metadata[idx]
        sparse_score = float(scores[idx]) / max_score
        results.append(
            {
                "id": item.get("id", idx),
                "text": item.get("text", ""),
                "score": sparse_score,
                "source": item.get("source", ""),
                "act": item.get("act", ""),
                "section": item.get("section", "Unknown Section"),
            }
        )

    return results


def hybrid_search(
    query: str,
    index: faiss.Index,
    metadata: list[dict[str, Any]],
    bm25: BM25Okapi,
    top_k: int = 5,
    alpha: float | None = None,
    debug: bool = False,
) -> list[dict[str, Any]]:
    """Combine dense and sparse retrieval with weighted score fusion."""
    # Defense-in-depth guard for empty query inputs.
    if not query or not query.strip():
        return []

    if top_k <= 0 or not metadata:
        return []

    query_text = str(query).strip()
    if not query_text:
        return []

    # Adaptive weighting: short queries favor sparse, longer queries favor dense.
    if alpha is None:
        if len(query_text.split()) <= 3:
            alpha = 0.5
        else:
            alpha = 0.7

    top_k = min(top_k, len(metadata), MAX_TOP_K)
    alpha = float(max(0.0, min(1.0, alpha)))

    logger.info("Hybrid search | query='%s' | top_k=%d | alpha=%.2f", query_text, top_k, alpha)

    # Expand candidate pools to improve dense+sparse diversity before fusion.
    dense_k = min(top_k * 2, len(metadata), MAX_TOP_K)
    sparse_k = min(top_k * 2, len(metadata), MAX_TOP_K)

    dense_results: list[dict[str, Any]] = []
    try:
        query_embedding = embed_query(query_text)
        dense_results = search(index=index, metadata=metadata, query_embedding=query_embedding, top_k=dense_k)
    except Exception as exc:
        logger.warning("Dense retrieval unavailable from local model cache (%s). Falling back to BM25-only retrieval.", exc)
    sparse_results = bm25_search(query=query_text, bm25=bm25, metadata=metadata, top_k=sparse_k)

    logger.info("Dense results count: %d", len(dense_results))
    logger.info("BM25 results count: %d", len(sparse_results))

    merged: dict[int, dict[str, Any]] = {}

    for item in dense_results:
        doc_id = int(item.get("id", -1))
        if doc_id < 0:
            continue
        merged[doc_id] = {
            "id": doc_id,
            "text": item.get("text", ""),
            "dense_score": float(item.get("score", 0.0)),
            "sparse_score": 0.0,
            "source": item.get("source", ""),
            "act": item.get("act", ""),
            "section": item.get("section", "Unknown Section"),
        }

    for item in sparse_results:
        doc_id = int(item.get("id", -1))
        if doc_id < 0:
            continue
        if doc_id not in merged:
            merged[doc_id] = {
                "id": doc_id,
                "text": item.get("text", ""),
                "dense_score": 0.0,
                "sparse_score": float(item.get("score", 0.0)),
                "source": item.get("source", ""),
                "act": item.get("act", ""),
                "section": item.get("section", "Unknown Section"),
            }
        else:
            merged[doc_id]["sparse_score"] = float(item.get("score", 0.0))

    fused_results: list[dict[str, Any]] = []
    for _, item in merged.items():
        dense_score = float(item.get("dense_score", 0.0))
        sparse_score_raw = float(item.get("sparse_score", 0.0))
        # Smooth sparse contribution when BM25 misses a dense-only candidate.
        sparse_score = sparse_score_raw if sparse_score_raw > 0.0 else 0.05
        final_score = alpha * dense_score + (1.0 - alpha) * sparse_score
        fused_results.append(
            {
                "id": item["id"],
                "text": item["text"],
                "score": final_score,
                "dense_score": dense_score,
                "sparse_score": sparse_score,
                "source": item["source"],
                "act": item["act"],
                "section": item["section"],
            }
        )

    fused_results.sort(key=lambda x: float(x["score"]), reverse=True)
    fused_results = fused_results[:top_k]

    logger.info("Final merged count: %d", len(fused_results))
    if debug and fused_results:
        logger.debug("Hybrid top result: %s", fused_results[0])

    return fused_results


def save_index(index: faiss.Index, metadata: list[dict[str, Any]], output_dir: str | Path) -> None:
    """Persist FAISS index and metadata store to disk."""
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    index_path = out_dir / "faiss.index"
    metadata_path = out_dir / "metadata.pkl"

    faiss.write_index(index, str(index_path))
    with metadata_path.open("wb") as f:
        pickle.dump(metadata, f)

    logger.info("Saved FAISS index: %s", index_path)
    logger.info("Saved metadata store: %s", metadata_path)


def load_index(output_dir: str | Path) -> tuple[faiss.Index, list[dict[str, Any]]]:
    """Load FAISS index and metadata store from disk."""
    out_dir = Path(output_dir)
    index_path = out_dir / "faiss.index"
    metadata_path = out_dir / "metadata.pkl"

    if not index_path.exists():
        raise FileNotFoundError(f"Missing FAISS index: {index_path}")
    if not metadata_path.exists():
        raise FileNotFoundError(f"Missing metadata store: {metadata_path}")

    index = faiss.read_index(str(index_path))
    with metadata_path.open("rb") as f:
        metadata = pickle.load(f)

    if not isinstance(metadata, list):
        raise ValueError(f"Invalid metadata format in {metadata_path}")

    # Production integrity check: persisted vectors and metadata must align.
    assert index.ntotal == len(metadata), (
        f"Index-metadata mismatch: index={index.ntotal}, metadata={len(metadata)}"
    )

    return index, metadata


def build_index_incremental(
    chunks_dir: str | Path = "data/chunks",
    output_dir: str | Path = "data/index",
    model_name: str = MODEL_NAME,
    batch_size: int = BATCH_SIZE,
) -> tuple[faiss.Index, list[dict[str, Any]]]:
    """Build FAISS index incrementally, file-by-file and batch-by-batch."""
    chunks_path = Path(chunks_dir)
    if not chunks_path.exists() or not chunks_path.is_dir():
        raise NotADirectoryError(f"Invalid chunks directory: {chunks_path}")

    if batch_size <= 0:
        raise ValueError("batch_size must be > 0")

    chunk_files = _iter_chunk_files(chunks_path)
    if not chunk_files:
        raise FileNotFoundError(f"No chunk JSON files found in {chunks_path}")

    model = _get_model(model_name=model_name)

    index: faiss.Index | None = None
    metadata_store: list[dict[str, Any]] = []
    total_embeddings = 0
    files_with_chunks = 0
    global_id = 0

    for file_idx, file_path in enumerate(chunk_files, start=1):
        logger.info("Processing file %d/%d: %s", file_idx, len(chunk_files), file_path.name)
        chunks = load_chunks(file_path)
        if not chunks:
            logger.info("No chunks in file: %s", file_path.name)
            continue
        files_with_chunks += 1

        for start in range(0, len(chunks), batch_size):
            end = min(start + batch_size, len(chunks))
            batch = chunks[start:end]

            embeddings = embed_chunks(batch, model=model, batch_size=batch_size)
            if embeddings.shape[0] == 0:
                continue

            faiss.normalize_L2(embeddings)

            if index is None:
                dim = int(embeddings.shape[1])
                index = faiss.IndexFlatIP(dim)
                logger.info("Initialized FAISS IndexFlatIP with dim=%d", dim)

            index.add(embeddings)
            total_embeddings += embeddings.shape[0]

            for chunk in batch:
                metadata_store.append(_safe_metadata(chunk, entry_id=global_id))
                global_id += 1
            logger.info(
                "Embedded batch %d-%d from %s (running_total=%d)",
                start,
                end - 1,
                file_path.name,
                total_embeddings,
            )

    if index is None:
        raise RuntimeError("No embeddings were generated; FAISS index was not created")

    if total_embeddings != len(metadata_store):
        raise RuntimeError(
            "Embedding/metadata mismatch: "
            f"embeddings={total_embeddings}, metadata={len(metadata_store)}"
        )

    logger.info("Index built successfully")
    logger.info("Files processed: %d", files_with_chunks)
    logger.info("Embeddings created: %d", total_embeddings)
    logger.info("Total vectors indexed: %d", index.ntotal)
    save_index(index=index, metadata=metadata_store, output_dir=output_dir)

    return index, metadata_store


def main() -> None:
    parser = argparse.ArgumentParser(description="Build incremental FAISS index from chunk JSON files.")
    parser.add_argument("--chunks-dir", default="data/chunks", help="Directory with chunk JSON files")
    parser.add_argument("--output-dir", default="data/index", help="Directory to store index artifacts")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE, help="Embedding batch size")
    parser.add_argument("--model-name", default=MODEL_NAME, help="SentenceTransformer model name")
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"],
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(levelname)s %(name)s - %(message)s",
    )

    build_index_incremental(
        chunks_dir=args.chunks_dir,
        output_dir=args.output_dir,
        model_name=args.model_name,
        batch_size=args.batch_size,
    )


if __name__ == "__main__":
    main()
