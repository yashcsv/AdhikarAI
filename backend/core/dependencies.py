"""Dependency wiring placeholders for FastAPI components."""

from configs.config import settings


def get_settings():
	"""Return central settings object."""
	return settings
