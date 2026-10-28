"""CLI entrypoint for AdhikarAI ingestion pipeline.

Usage:
    python ingest.py data/
"""

from backend.ingestion.pipeline import main


if __name__ == "__main__":
    main()
