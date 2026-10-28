#!/usr/bin/env python3
"""Rule-based legal PDF classifier for labor-law RAG datasets.

This module classifies filenames into retrieval-priority categories using
deterministic rules. It is optimized for low-resource environments and avoids
heavy dependencies.
"""

from __future__ import annotations

import argparse
import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Sequence, Tuple


Category = str

CATEGORIES: Tuple[Category, ...] = (
    "core_code",
    "core_act",
    "supporting_act",
    "optional_act",
    "rules",
    "draft",
    "irrelevant",
)


LOGGER = logging.getLogger("dataset_classifier")


def normalize_filename(filename: str) -> str:
    """Normalize filename for robust case-insensitive matching."""
    name = Path(filename).stem.lower()
    name = re.sub(r"[_\-]+", " ", name)
    name = re.sub(r"[^a-z0-9\s]", " ", name)
    return re.sub(r"\s+", " ", name).strip()


def contains_any(text: str, terms: Sequence[str]) -> bool:
    return any(term in text for term in terms)


def has_core_act_keyword(normalized: str) -> bool:
    core_patterns = (
        r"\bindustrial disputes?\b",
        r"\btrade unions?\b",
        r"\bfactories\b",
        r"\b(epf|provident fund)\b",
        r"\bgratuity\b",
        r"\bmaternity benefit\b",
    )
    return any(re.search(pattern, normalized) for pattern in core_patterns)


def is_act(normalized: str) -> bool:
    return " act " in f" {normalized} "


def has_code_marker(normalized: str, raw_lower: str) -> bool:
    # Explicitly support both requested markers: "Code on" and "Code,"
    return "code on" in normalized or "code," in raw_lower


def is_irrelevant_domain(normalized: str) -> bool:
    niche_terms = (
        "railway",
        "motor transport",
        "sales promotion",
    )
    return contains_any(normalized, niche_terms)


@dataclass(frozen=True)
class Rule:
    name: str
    category: Category
    confidence: float
    reason: str
    predicate: Callable[[str, str], bool]


@dataclass(frozen=True)
class ClassificationResult:
    category: Category
    confidence: float
    rule_name: str
    reason: str


RULES: Tuple[Rule, ...] = (
    Rule(
        name="draft_markers",
        category="draft",
        confidence=0.99,
        reason="Contains draft/pre-publication marker.",
        predicate=lambda n, r: contains_any(
            n,
            (
                "draft",
                "pre publish",
                "pre published",
                "pre publication",
                "as introduced",
            ),
        )
        or contains_any(r, ("pre-publish", "pre-published")),
    ),
    Rule(
        name="rules_markers",
        category="rules",
        confidence=0.95,
        reason="Contains rule/rules marker.",
        predicate=lambda n, _: re.search(r"\brules?\b", n) is not None,
    ),
    Rule(
        name="core_code_markers",
        category="core_code",
        confidence=0.97,
        reason='Contains "Code on" or "Code," marker.',
        predicate=lambda n, r: has_code_marker(n, r),
    ),
    Rule(
        name="core_act_match",
        category="core_act",
        confidence=0.94,
        reason="Contains Act and matches high-value act keyword.",
        predicate=lambda n, _: is_act(n) and has_core_act_keyword(n),
    ),
    Rule(
        name="supporting_act_fallback",
        category="supporting_act",
        confidence=0.8,
        reason="Contains Act but not in core-act list.",
        predicate=lambda n, _: is_act(n),
    ),
    Rule(
        name="irrelevant_niche_domain",
        category="irrelevant",
        confidence=0.9,
        reason="Matches niche domain keyword.",
        predicate=lambda n, _: is_irrelevant_domain(n),
    ),
)


DEFAULT_RESULT = ClassificationResult(
    category="optional_act",
    confidence=0.55,
    rule_name="default_optional",
    reason="No high-priority rule matched.",
)


def classify_file_with_meta(filename: str) -> ClassificationResult:
    """Classify one filename with metadata for observability."""
    raw_lower = filename.lower()
    normalized = normalize_filename(filename)

    for rule in RULES:
        if rule.predicate(normalized, raw_lower):
            LOGGER.debug(
                "Classified '%s' as '%s' via rule '%s' (%s)",
                filename,
                rule.category,
                rule.name,
                rule.reason,
            )
            return ClassificationResult(
                category=rule.category,
                confidence=rule.confidence,
                rule_name=rule.name,
                reason=rule.reason,
            )

    LOGGER.debug(
        "Classified '%s' as '%s' via fallback (%s)",
        filename,
        DEFAULT_RESULT.category,
        DEFAULT_RESULT.reason,
    )
    return DEFAULT_RESULT


def classify_file(filename: str) -> str:
    """Return category label for a single filename.

    Required API function.
    """
    return classify_file_with_meta(filename).category


def classify_all(files: List[str]) -> Dict[str, str]:
    """Return file-to-category map.

    Required API function.
    """
    return {name: classify_file(name) for name in files}


def classify_all_with_meta(
    files: Iterable[str],
) -> Tuple[Dict[str, str], Dict[str, Dict[str, str]]]:
    """Return classifications and metadata keyed by filename."""
    mapping: Dict[str, str] = {}
    metadata: Dict[str, Dict[str, str]] = {}

    for name in files:
        result = classify_file_with_meta(name)
        mapping[name] = result.category
        metadata[name] = {
            "category": result.category,
            "confidence": round(result.confidence, 2),
            "rule": result.rule_name,
            "reason": result.reason,
        }

    return mapping, metadata


def group_by_category(classification_map: Dict[str, str]) -> Dict[str, List[str]]:
    grouped: Dict[str, List[str]] = {category: [] for category in CATEGORIES}
    for filename, category in classification_map.items():
        grouped.setdefault(category, []).append(filename)

    for category in grouped:
        grouped[category].sort()

    return grouped


def iter_pdf_filenames(folder: Path) -> List[str]:
    """List PDF filenames only (non-recursive) for stable fast processing."""
    return sorted([p.name for p in folder.iterdir() if p.is_file() and p.suffix.lower() == ".pdf"])


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Classify legal PDF filenames for RAG indexing priority."
    )
    parser.add_argument(
        "input_path",
        nargs="?",
        type=Path,
        default=None,
        help=(
            "Optional path to a directory containing PDFs or a .txt file with one "
            "filename per line. Defaults to <script_dir>/data when omitted."
        ),
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=("DEBUG", "INFO", "WARNING", "ERROR"),
        help="Logging verbosity.",
    )
    parser.add_argument(
        "--with-confidence",
        action="store_true",
        help="Include confidence/rule metadata in output.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Optional output JSON file path.",
    )
    parser.add_argument(
        "--summary-only",
        action="store_true",
        help="Print only classification summary (useful for large datasets).",
    )
    return parser.parse_args()


def load_input(path: Path) -> List[str]:
    if path.is_dir():
        files = iter_pdf_filenames(path)
        LOGGER.info("Loaded %d PDF files from directory: %s", len(files), path)
        return files

    if path.is_file() and path.suffix.lower() == ".txt":
        lines = [line.strip() for line in path.read_text(encoding="utf-8").splitlines()]
        files = [line for line in lines if line]
        LOGGER.info("Loaded %d filenames from text file: %s", len(files), path)
        return files

    raise ValueError("input_path must be a directory or a .txt file")


def main() -> int:
    args = parse_args()
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s | %(levelname)s | %(message)s",
    )

    if args.input_path is None:
        args.input_path = Path(__file__).resolve().parent / "data"
        LOGGER.info("No input_path provided. Using default: %s", args.input_path)

    try:
        files = load_input(args.input_path)
    except Exception as exc:
        LOGGER.error("Failed to load input: %s", exc)
        return 1

    mapping, metadata = classify_all_with_meta(files)
    grouped = group_by_category(mapping)

    result: Dict[str, Any] = {
        "by_file": mapping,
        "grouped": grouped,
    }
    if args.with_confidence:
        result["meta"] = metadata

    summary = {category: len(files_in_category) for category, files_in_category in grouped.items()}

    if args.summary_only:
        result = {
            "total_files": len(files),
            "summary": summary,
        }

    output_json = json.dumps(result, indent=2)

    if args.output:
        args.output.write_text(output_json + "\n", encoding="utf-8")
        LOGGER.info("Wrote output to: %s", args.output)
    else:
        print(output_json)

    LOGGER.info("Classification summary: %s", summary)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())