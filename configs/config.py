"""Central configuration for AdhikarAI.

This file defines the shared settings object used across backend modules.
Only configuration structure is defined here; no runtime logic.
"""

from pathlib import Path

from pydantic import ValidationInfo, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[1]
_TRUE_VALUES = {"1", "true", "t", "yes", "y", "on"}
_FALSE_VALUES = {"0", "false", "f", "no", "n", "off"}


class Settings(BaseSettings):
	app_name: str = "AdhikarAI"
	app_env: str = "development"
	debug: bool = True

	api_host: str = "0.0.0.0"
	api_port: int = 8000

	data_dir: str = "./data"
	core_code_dir: str = "./data/core_code"
	core_act_dir: str = "./data/core_act"
	supporting_act_dir: str = "./data/supporting_act"

	vector_db_path: str = "./data/vectorstore"
	embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
	top_k: int = 5

	llm_provider: str = "gemini"
	llm_model: str = "gemini-1.5-flash"
	gemini_api_key: str = ""
	openrouter_model: str = "openai/gpt-4o-mini"
	openrouter_api_key: str = ""
	openrouter_site_url: str = ""

	# Low-resource feature flags.
	enable_query_rewrite: bool = False
	enable_multi_query: bool = False
	enable_eval_on_demand: bool = True
	enable_upload: bool = True

	log_level: str = "INFO"
	enable_tracing: bool = False
	langsmith_tracing: bool = False
	langsmith_api_key: str = ""
	langsmith_project: str = "AdhikarAI"
	langsmith_endpoint: str = "https://api.smith.langchain.com"

	# Email delivery (optional, for sending responses as HTML emails).
	smtp_host: str = ""
	smtp_port: int = 587
	smtp_username: str = ""
	smtp_password: str = ""
	smtp_from_email: str = ""
	smtp_use_tls: bool = True

	# Gmail OAuth2 delivery (n8n-style credential fields).
	gmail_oauth_client_id: str = ""
	gmail_oauth_client_secret: str = ""
	gmail_oauth_refresh_token: str = ""
	gmail_oauth_redirect_uri: str = "http://localhost:5678/rest/oauth2-credential/callback"
	gmail_from_email: str = ""

	model_config = SettingsConfigDict(env_file=str(PROJECT_ROOT / ".env"), env_file_encoding="utf-8")

	@field_validator(
		"debug",
		"enable_query_rewrite",
		"enable_multi_query",
		"enable_eval_on_demand",
		"enable_upload",
		"enable_tracing",
		"langsmith_tracing",
		"smtp_use_tls",
		mode="before",
	)
	@classmethod
	def parse_bool_settings(cls, value: object, info: ValidationInfo) -> bool:
		if isinstance(value, bool):
			return value

		field = cls.model_fields[info.field_name]
		default = bool(field.default)

		if value is None:
			return default

		if isinstance(value, str):
			normalized = value.strip().lower()
			if not normalized:
				return default
			if normalized in _TRUE_VALUES:
				return True
			if normalized in _FALSE_VALUES:
				return False
			return default

		if isinstance(value, (int, float)):
			return bool(value)

		return default


settings = Settings()
