"""FastAPI application entrypoint."""

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.router import api_router
from backend.observability.langsmith import configure_langsmith
from configs.config import settings


logger = logging.getLogger(__name__)

app = FastAPI(title=settings.app_name)

# Allow local frontend dev server and configurable frontend origins.
allowed_origins = [
	"http://localhost:5173",
	"http://127.0.0.1:5173",
]

app.add_middleware(
	CORSMiddleware,
	allow_origins=allowed_origins,
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/")
def root() -> dict[str, str]:
	return {
		"name": settings.app_name,
		"status": "running",
		"version": "1.0.0",
		"docs": "/docs",
		"health": "/api/health",
	}


@app.on_event("startup")
def on_startup() -> None:
	configure_langsmith()
	logger.info("%s server is ready", settings.app_name)
