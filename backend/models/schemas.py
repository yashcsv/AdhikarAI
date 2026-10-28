"""Shared request/response schemas for AdhikarAI API."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ChatFeatures(BaseModel):
	"""Feature flags for low-resource modular execution."""

	query_rewrite: bool = False
	multi_query: bool = False
	evaluation_mode: bool = False
	show_debug: bool = False


class QueryRequest(BaseModel):
	query: str
	conversation_memory: list[dict[str, str]] = Field(default_factory=list)
	mode: str | None = None  # normal | lawyer
	thinking: str = "off"  # on | off
	attachments: list[dict] = Field(default_factory=list)
	user_profile: dict = Field(default_factory=dict)
	top_k: int = 7
	alpha: float = 0.6
	role_mode: str = "lawyer"  # lawyer | worker | eli5
	model: str = "gemini"  # gemini | openrouter | local-mock
	model_name: str | None = None
	response_mode: str = "detailed"  # brief | detailed
	eli5: bool = False
	features: ChatFeatures = Field(default_factory=ChatFeatures)
	session_id: str | None = None


class QueryResponse(BaseModel):
	answer: str
	sources: list[dict] = Field(default_factory=list)
	confidence: float = 0.0
	confidence_label: str = "low"
	meta: dict = Field(default_factory=dict)
	latency: dict = Field(default_factory=dict)


class StreamControlRequest(BaseModel):
	action: str  # stop | pause | resume


class StreamControlResponse(BaseModel):
	session_id: str
	status: str





class UploadResponse(BaseModel):
	status: str
	session_id: str
	chunks_added: int





class VerifyKeyResponse(BaseModel):
	valid: bool
	message: str


class ProviderStatusResponse(BaseModel):
	server_gemini_configured: bool
	server_openrouter_configured: bool
	llm_provider: str
	llm_model: str
	openrouter_model: str
