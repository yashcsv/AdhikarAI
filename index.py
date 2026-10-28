"""Root CLI wrapper for AdhikarAI indexing pipeline.

Example:
    python index.py --chunks-dir data/chunks --output-dir data/index
"""

from __future__ import annotations

import argparse
import logging

from backend.indexing.pipeline import build_index_incremental


def main() -> None:
    parser = argparse.ArgumentParser(description="Build FAISS index from chunk JSON files")
    parser.add_argument("--chunks-dir", default="data/chunks", help="Directory with chunk JSON files")
    parser.add_argument("--output-dir", default="data/index", help="Directory to store index artifacts")
    parser.add_argument("--batch-size", type=int, default=32, help="Embedding batch size")
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
        batch_size=args.batch_size,
    )


if __name__ == "__main__":
    main()
