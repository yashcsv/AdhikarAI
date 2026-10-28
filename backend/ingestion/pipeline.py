"""Memory-safe PDF ingestion pipeline for AdhikarAI.

This module processes one PDF at a time, extracts text, cleans noisy page artifacts,
and writes chunked JSON output to disk.
"""

from __future__ import annotations

import argparse
import json
import logging
import re
from collections import Counter
from pathlib import Path
from typing import Any, Iterator

logger = logging.getLogger(__name__)


def _default_manifest() -> dict[str, Any]:
    return {"processed": [], "failed": [], "skipped": []}


def _load_manifest(manifest_path: Path) -> dict[str, Any]:
    if not manifest_path.exists():
        return _default_manifest()

    with manifest_path.open("r", encoding="utf-8") as f:
        data: Any = json.load(f)

    if not isinstance(data, dict):
        logger.warning("Invalid manifest format. Reinitializing: %s", manifest_path)
        return _default_manifest()

    manifest = _default_manifest()
    processed = data.get("processed", [])
    if isinstance(processed, list):
        manifest["processed"] = [str(item) for item in processed]

    skipped = data.get("skipped", [])
    if isinstance(skipped, list):
        manifest["skipped"] = [str(item) for item in skipped]

    # Backward compatibility: old manifests may store failed as list[str].
    failed_raw = data.get("failed", [])
    failed_norm: list[dict[str, str]] = []
    if isinstance(failed_raw, list):
        for item in failed_raw:
            if isinstance(item, dict) and "file" in item:
                failed_norm.append(
                    {
                        "file": str(item.get("file", "")),
                        "error": str(item.get("error", "Unknown error")),
                    }
                )
            elif isinstance(item, str):
                failed_norm.append({"file": item, "error": "Legacy failure entry"})
    manifest["failed"] = failed_norm

    return manifest


def _save_manifest(manifest_path: Path, manifest: dict[str, Any]) -> None:
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with manifest_path.open("w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)


def _save_stats(output_dir: Path, processed: int, failed: int, skipped: int, total_chunks: int) -> None:
    stats_path = output_dir / "stats.json"
    stats = {
        "processed": processed,
        "failed": failed,
        "skipped": skipped,
        "total_chunks": total_chunks,
    }
    with stats_path.open("w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, indent=2)


def _append_unique(items: list[str], value: str) -> None:
    if value not in items:
        items.append(value)


def _remove_if_exists(items: list[str], value: str) -> None:
    try:
        items.remove(value)
    except ValueError:
        return


def _failed_contains(failed_items: list[dict[str, str]], file_key: str) -> bool:
    return any(item.get("file") == file_key for item in failed_items)


def _upsert_failed(failed_items: list[dict[str, str]], file_key: str, error: str) -> None:
    clipped_error = error[:200]
    for item in failed_items:
        if item.get("file") == file_key:
            item["error"] = clipped_error
            return
    failed_items.append({"file": file_key, "error": clipped_error})


def _remove_failed(failed_items: list[dict[str, str]], file_key: str) -> None:
    failed_items[:] = [item for item in failed_items if item.get("file") != file_key]


def _normalize_ws(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _tokenize(text: str) -> list[str]:
    # Whitespace tokenization keeps the pipeline lightweight and dependency-free.
    return text.split()


def _iter_pdf_paths(input_dir: Path) -> Iterator[Path]:
    for path in sorted(input_dir.rglob("*.pdf")):
        if path.is_file():
            yield path


def _extract_act_name(pdf_path: Path) -> str:
    # Keep filename-derived act names deterministic for downstream retrieval.
    name = pdf_path.stem
    name = re.sub(r"[_\-]+", " ", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name


def _infer_file_type(pdf_path: Path) -> tuple[str, str]:
    parts = {part.lower() for part in pdf_path.parts}
    if "core_code" in parts:
        return "core_code", "folder"
    if "core_act" in parts:
        return "core_act", "folder"
    if "supporting_act" in parts:
        return "supporting_act", "folder"

    name = pdf_path.stem.lower()
    if "code" in name:
        return "core_code", "rule_fallback"
    if "act" in name:
        return "core_act", "rule_fallback"
    return "supporting_act", "rule_fallback"


def load_pdf(pdf_path: str | Path) -> list[str]:
    """Extract text from a PDF and return one cleaned raw string per page.

    Tries PyMuPDF first for speed and lower overhead. Falls back to pdfplumber.
    """
    path = Path(pdf_path)
    if not path.exists() or not path.is_file():
        raise FileNotFoundError(f"PDF not found: {path}")

    pages: list[str] = []

    try:
        import fitz  # type: ignore

        with fitz.open(path) as doc:
            for page in doc:
                pages.append(page.get_text("text") or "")
        return pages
    except ImportError:
        logger.info("PyMuPDF not installed. Falling back to pdfplumber.")
    except Exception as exc:
        logger.warning("PyMuPDF failed for %s: %s", path.name, exc)

    try:
        import pdfplumber  # type: ignore

        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                pages.append(page.extract_text() or "")
        return pages
    except ImportError as exc:
        raise RuntimeError(
            "Neither PyMuPDF nor pdfplumber is installed. Install one of them."
        ) from exc


def clean_text(page_texts: list[str]) -> str:
    """Clean extracted page text and remove repeated header/footer noise.

    Strategy:
    - Normalize line endings
    - Detect repeating top/bottom lines across pages
    - Remove line-number artifacts and excess whitespace
    """
    if not page_texts:
        return ""

    top_line_counter: Counter[str] = Counter()
    bottom_line_counter: Counter[str] = Counter()

    for raw in page_texts:
        lines = [ln.strip() for ln in raw.replace("\r", "").split("\n") if ln.strip()]
        if not lines:
            continue

        for candidate in lines[:2]:
            if len(candidate) > 2:
                top_line_counter[candidate] += 1

        for candidate in lines[-2:]:
            if len(candidate) > 2:
                bottom_line_counter[candidate] += 1

    repeated_noise = {
        line
        for line, count in (top_line_counter | bottom_line_counter).items()
        if count > 1
    }

    cleaned_pages: list[str] = []
    for raw in page_texts:
        lines = [ln.strip() for ln in raw.replace("\r", "").split("\n")]
        page_lines: list[str] = []

        for line in lines:
            if not line:
                continue
            if line in repeated_noise:
                continue
            # Remove standalone page numbers like "12" or "Page 12"
            if re.fullmatch(r"(?:page\s+)?\d+", line, flags=re.IGNORECASE):
                continue
            page_lines.append(line)

        if page_lines:
            cleaned_pages.append("\n".join(page_lines))

    merged_text = "\n\n".join(cleaned_pages)
    merged_text = re.sub(r"\n{3,}", "\n\n", merged_text)
    return merged_text.strip()


def _split_sections(text: str) -> list[tuple[str, str]]:
    """Split text into rough sections based on legal heading-like patterns."""
    if not text:
        return []

    heading_patterns = [
        re.compile(r"^\s*\d+(?:\.\d+)*\s+[A-Z].{2,}$"),
        re.compile(r"^\s*[A-Z][A-Z\s\-,()]{6,}$"),
        re.compile(r"^\s*(CHAPTER|PART|SECTION)\b.*$", re.IGNORECASE),
    ]

    sections: list[tuple[str, list[str]]] = []
    current_heading = "INTRO"
    current_lines: list[str] = []

    for line in text.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue

        is_heading = any(pattern.match(stripped) for pattern in heading_patterns)
        if is_heading:
            if current_lines:
                sections.append((current_heading, current_lines))
            current_heading = stripped[:200]
            current_lines = []
            continue

        current_lines.append(stripped)

    if current_lines:
        sections.append((current_heading, current_lines))

    return [(heading, "\n".join(lines)) for heading, lines in sections]


_SECTION_PATTERNS = [
    re.compile(r"(Section\s+\d+[A-Za-z]?)", re.IGNORECASE),
    re.compile(r"(CHAPTER\s+[IVXLC0-9]+)", re.IGNORECASE),
    re.compile(r"(PART\s+[IVXLC0-9]+)", re.IGNORECASE),
]


def _detect_section_title(chunk_text: str) -> str:
    for pattern in _SECTION_PATTERNS:
        match = pattern.search(chunk_text)
        if match:
            return match.group(1).strip()
    return "Unknown Section"


def _smart_truncate_chunks(chunks: list[dict], max_chunks_per_file: int) -> list[dict]:
    if len(chunks) <= max_chunks_per_file:
        return chunks

    first_half = max_chunks_per_file // 2
    last_half = max_chunks_per_file - first_half
    kept = chunks[:first_half] + chunks[-last_half:]

    # Reindex chunk IDs after truncation to keep IDs contiguous.
    for idx, chunk in enumerate(kept, start=1):
        metadata = chunk.get("metadata", {})
        if isinstance(metadata, dict):
            metadata["chunk_id"] = idx
    return kept


def _count_chunks_in_output(output_path: Path) -> int:
    try:
        with output_path.open("r", encoding="utf-8") as f:
            payload = json.load(f)
        if isinstance(payload, list):
            return len(payload)
    except Exception as exc:
        logger.warning("Unable to count chunks in %s: %s", output_path, exc)
    return 0


def chunk_text(
    text: str,
    chunk_size: int = 300,
    overlap: int = 50,
    source: str = "",
    act: str = "",
    file_type: str = "unknown",
    file_type_source: str = "folder",
) -> list[dict]:
    """Chunk cleaned text into overlapping token windows.

    Attempts to preserve section boundaries by chunking section-by-section.
    """
    if chunk_size <= 0:
        raise ValueError("chunk_size must be > 0")
    if overlap < 0:
        raise ValueError("overlap must be >= 0")
    if overlap >= chunk_size:
        raise ValueError("overlap must be less than chunk_size")

    sections = _split_sections(text)
    if not sections:
        return []

    results: list[dict] = []
    chunk_id = 1
    step = chunk_size - overlap

    for _, section_text in sections:
        tokens = _tokenize(_normalize_ws(section_text))
        if not tokens:
            continue

        start = 0
        while start < len(tokens):
            end = min(start + chunk_size, len(tokens))
            chunk_tokens = tokens[start:end]
            chunk = {
                "text": " ".join(chunk_tokens),
                "metadata": {
                    "source": source,
                    "chunk_id": chunk_id,
                    "act": act,
                    "section": _detect_section_title(" ".join(chunk_tokens)),
                    "file_type": file_type,
                    "file_type_source": file_type_source,
                },
            }
            results.append(chunk)
            chunk_id += 1

            if end >= len(tokens):
                break
            start += step

    return results


def process_file(
    pdf_path: str | Path,
    output_dir: str | Path,
    chunk_size: int = 300,
    overlap: int = 50,
    max_chunks_per_file: int = 500,
) -> Path:
    """Process a single PDF end-to-end and save chunk JSON to disk."""
    in_path = Path(pdf_path)
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    logger.info("Processing file: %s", in_path.name)
    page_texts = load_pdf(in_path)
    cleaned = clean_text(page_texts)
    file_type, file_type_source = _infer_file_type(in_path)
    chunks = chunk_text(
        cleaned,
        chunk_size=chunk_size,
        overlap=overlap,
        source=in_path.name,
        act=_extract_act_name(in_path),
        file_type=file_type,
        file_type_source=file_type_source,
    )

    if max_chunks_per_file <= 0:
        raise ValueError("max_chunks_per_file must be > 0")
    if len(chunks) > max_chunks_per_file:
        logger.warning(
            "Chunk limit reached for file %s (limit=%d, produced=%d) - applied smart truncation.",
            in_path.name,
            max_chunks_per_file,
            len(chunks),
        )
        chunks = _smart_truncate_chunks(chunks, max_chunks_per_file)

    output_path = out_dir / f"{in_path.stem}.chunks.json"
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(chunks, f, ensure_ascii=False, indent=2)

    logger.info("Chunks created: %d", len(chunks))
    logger.debug("Saved chunks to %s", output_path)
    return output_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingest legal PDFs into chunked JSON.")
    parser.add_argument("input_dir", help="Input directory containing PDF files")
    parser.add_argument(
        "--output-dir",
        default="data/chunks",
        help="Directory where per-file chunk JSON files will be saved",
    )
    parser.add_argument("--chunk-size", type=int, default=300)
    parser.add_argument("--overlap", type=int, default=50)
    parser.add_argument(
        "--max-chunks-per-file",
        type=int,
        default=500,
        help="Maximum number of chunks to retain per file",
    )
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

    input_dir = Path(args.input_dir)
    if not input_dir.exists() or not input_dir.is_dir():
        raise NotADirectoryError(f"Invalid input directory: {input_dir}")

    output_dir = Path(args.output_dir)
    manifest_path = output_dir / "manifest.json"
    manifest = _load_manifest(manifest_path)
    logger.info("Using manifest: %s", manifest_path)

    run_processed = 0
    run_failed = 0
    run_skipped = 0
    total_chunks_created = 0

    for pdf_path in _iter_pdf_paths(input_dir):
        file_key = str(pdf_path.relative_to(input_dir))

        if file_key in manifest["processed"]:
            _append_unique(manifest["skipped"], file_key)
            _save_manifest(manifest_path, manifest)
            run_skipped += 1
            logger.info("Skipping already processed file: %s", pdf_path.name)
            continue

        try:
            output_path = process_file(
                pdf_path=pdf_path,
                output_dir=output_dir,
                chunk_size=args.chunk_size,
                overlap=args.overlap,
                max_chunks_per_file=args.max_chunks_per_file,
            )
            _append_unique(manifest["processed"], file_key)
            _remove_failed(manifest["failed"], file_key)
            _remove_if_exists(manifest["skipped"], file_key)
            _save_manifest(manifest_path, manifest)
            run_processed += 1
            total_chunks_created += _count_chunks_in_output(output_path)
        except Exception as exc:
            _upsert_failed(manifest["failed"], file_key, str(exc))
            _save_manifest(manifest_path, manifest)
            run_failed += 1
            logger.exception("Error processing %s: %s", pdf_path.name, exc)
            continue

    _save_stats(
        output_dir=output_dir,
        processed=run_processed,
        failed=run_failed,
        skipped=run_skipped,
        total_chunks=total_chunks_created,
    )

    logger.info(
        "SUMMARY:\n processed=%d\n failed=%d\n skipped=%d\n total_chunks=%d",
        run_processed,
        run_failed,
        run_skipped,
        total_chunks_created,
    )

    logger.info(
        "Ingestion complete. processed=%d failed=%d skipped=%d",
        run_processed,
        run_failed,
        run_skipped,
    )


if __name__ == "__main__":
    main()
