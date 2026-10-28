"""API router for AdhikarAI chat and product features."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Generator

from fastapi import APIRouter, File, Header, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from backend.models.schemas import (
	ProviderStatusResponse,

	QueryRequest,
	QueryResponse,
	StreamControlRequest,
	StreamControlResponse,
	UploadResponse,
	VerifyKeyResponse,
)
from backend.services.orchestrator import RAGOrchestrator
from configs.config import settings


api_router = APIRouter(prefix="/api")

_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_DATA_DIR = Path(settings.data_dir)
if not _DATA_DIR.is_absolute():
	_DATA_DIR = (_PROJECT_ROOT / _DATA_DIR).resolve()
orchestrator = RAGOrchestrator(index_dir=_DATA_DIR / "index")





@api_router.get("/health", tags=["system"])
def health_check() -> dict[str, str]:
	return {"status": "ok"}


@api_router.post("/chat", response_model=QueryResponse, tags=["chat"])
def chat(
	request: QueryRequest,
	x_gemini_api_key: str | None = Header(default=None),
	x_openrouter_api_key: str | None = Header(default=None),
) -> QueryResponse:
	try:
		body = request.model_dump()
		if x_gemini_api_key:
			body["gemini_api_key"] = x_gemini_api_key
		if x_openrouter_api_key:
			body["openrouter_api_key"] = x_openrouter_api_key
		payload = orchestrator.run(body)
		return QueryResponse(**payload)
	except Exception:
		raise HTTPException(status_code=500, detail="Chat request failed")


@api_router.post("/chat/stream", tags=["chat"])
def chat_stream(
	request: QueryRequest,
	x_gemini_api_key: str | None = Header(default=None),
	x_openrouter_api_key: str | None = Header(default=None),
) -> StreamingResponse:
	session_id = request.session_id or str(uuid.uuid4())
	body = request.model_dump()
	body["session_id"] = session_id
	if x_gemini_api_key:
		body["gemini_api_key"] = x_gemini_api_key
	if x_openrouter_api_key:
		body["openrouter_api_key"] = x_openrouter_api_key

	def event_stream() -> Generator[str, None, None]:
		for event in orchestrator.stream(body):
			yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

	return StreamingResponse(event_stream(), media_type="text/event-stream")


@api_router.post("/chat/verify-key", response_model=VerifyKeyResponse, tags=["chat"])
def verify_key(
	provider: str = "gemini",
	model_name: str | None = None,
	x_gemini_api_key: str | None = Header(default=None),
	x_openrouter_api_key: str | None = Header(default=None),
) -> VerifyKeyResponse:
	provider_name = str(provider or "gemini").strip().lower()
	api_key = x_openrouter_api_key if provider_name == "openrouter" else x_gemini_api_key
	if not api_key:
		label = "OpenRouter" if provider_name == "openrouter" else "Gemini"
		return VerifyKeyResponse(valid=False, message=f"{label} API key header is required.")

	result = orchestrator.verify_api_key(provider=provider_name, api_key=api_key, model_name=model_name)
	return VerifyKeyResponse(**result)


@api_router.get("/chat/provider-status", response_model=ProviderStatusResponse, tags=["chat"])
def provider_status() -> ProviderStatusResponse:
	return ProviderStatusResponse(
		server_gemini_configured=bool(str(settings.gemini_api_key).strip()),
		server_openrouter_configured=bool(str(settings.openrouter_api_key).strip()),
		llm_provider=settings.llm_provider,
		llm_model=settings.llm_model,
		openrouter_model=settings.openrouter_model,
	)


@api_router.post("/chat/control/{session_id}", response_model=StreamControlResponse, tags=["chat"])
def chat_stream_control(session_id: str, request: StreamControlRequest) -> StreamControlResponse:
	try:
		status = orchestrator.control_stream(session_id=session_id, action=request.action)
		return StreamControlResponse(session_id=session_id, status=status)
	except ValueError as exc:
		raise HTTPException(status_code=400, detail=str(exc))





@api_router.post("/chat/upload", response_model=UploadResponse, tags=["chat"])
async def upload_pdf(session_id: str, file: UploadFile = File(...)) -> UploadResponse:
	if not file.filename.lower().endswith(".pdf"):
		raise HTTPException(status_code=400, detail="Only PDF uploads are supported")

	content = await file.read()
	try:
		result = orchestrator.upload_pdf(session_id=session_id, filename=file.filename, file_bytes=content)
		return UploadResponse(**result)
	except ValueError as exc:
		raise HTTPException(status_code=400, detail=str(exc))

