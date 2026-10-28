def load_chunks(*args, **kwargs):
	from backend.indexing.pipeline import load_chunks as _load_chunks

	return _load_chunks(*args, **kwargs)


def embed_chunks(*args, **kwargs):
	from backend.indexing.pipeline import embed_chunks as _embed_chunks

	return _embed_chunks(*args, **kwargs)


def build_index_incremental(*args, **kwargs):
	from backend.indexing.pipeline import build_index_incremental as _build_index_incremental

	return _build_index_incremental(*args, **kwargs)


def embed_query(*args, **kwargs):
	from backend.indexing.pipeline import embed_query as _embed_query

	return _embed_query(*args, **kwargs)


def search(*args, **kwargs):
	from backend.indexing.pipeline import search as _search

	return _search(*args, **kwargs)


def build_bm25(*args, **kwargs):
	from backend.indexing.pipeline import build_bm25 as _build_bm25

	return _build_bm25(*args, **kwargs)


def bm25_search(*args, **kwargs):
	from backend.indexing.pipeline import bm25_search as _bm25_search

	return _bm25_search(*args, **kwargs)


def hybrid_search(*args, **kwargs):
	from backend.indexing.pipeline import hybrid_search as _hybrid_search

	return _hybrid_search(*args, **kwargs)


def save_index(*args, **kwargs):
	from backend.indexing.pipeline import save_index as _save_index

	return _save_index(*args, **kwargs)


def load_index(*args, **kwargs):
	from backend.indexing.pipeline import load_index as _load_index

	return _load_index(*args, **kwargs)


__all__ = [
	"load_chunks",
	"embed_chunks",
	"build_index_incremental",
	"embed_query",
	"search",
	"build_bm25",
	"bm25_search",
	"hybrid_search",
	"save_index",
	"load_index",
]
