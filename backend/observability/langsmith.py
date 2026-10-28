"""LangSmith tracing helpers for AdhikarAI.

Tracing is optional and activated by environment/settings.
When LangSmith is unavailable or disabled, all wrappers no-op.
"""

from __future__ import annotations

import logging
import os
from functools import wraps
from typing import Any, Callable

from configs.config import settings

logger = logging.getLogger(__name__)

try:
	from langsmith import traceable
except Exception:  # pragma: no cover - fallback path for optional dependency
	traceable = None


def is_langsmith_enabled() -> bool:
	return bool(settings.langsmith_tracing)


def configure_langsmith() -> None:
	"""Configure LangSmith environment variables once at startup.

	The function is intentionally safe: it never raises and does not mutate
	existing environment values if they are already set.
	"""
	if not is_langsmith_enabled():
		return

	os.environ.setdefault("LANGSMITH_TRACING", "true")
	os.environ.setdefault("LANGSMITH_PROJECT", settings.langsmith_project)
	os.environ.setdefault("LANGSMITH_ENDPOINT", settings.langsmith_endpoint)

	if settings.langsmith_api_key:
		os.environ.setdefault("LANGSMITH_API_KEY", settings.langsmith_api_key)

	logger.info("LangSmith tracing enabled for project '%s'", settings.langsmith_project)


def traceable_if_enabled(name: str, run_type: str = "chain") -> Callable[[Callable[..., Any]], Callable[..., Any]]:
	"""Apply LangSmith traceable decorator only when tracing is enabled."""

	def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
		if traceable is None:
			return func

		traced_func = traceable(name=name, run_type=run_type)(func)

		@wraps(func)
		def wrapper(*args: Any, **kwargs: Any) -> Any:
			if not is_langsmith_enabled():
				return func(*args, **kwargs)
			return traced_func(*args, **kwargs)

		return wrapper

	return decorator
