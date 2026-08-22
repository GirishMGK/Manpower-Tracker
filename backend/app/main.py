from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.core.config import get_settings
from app.jobs import capacity_job, digest_job

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.enable_background_jobs:
        capacity_job.start_scheduler()
        digest_job.start_scheduler()
    yield
    if settings.enable_background_jobs:
        capacity_job.stop_scheduler()
        digest_job.stop_scheduler()


app = FastAPI(
    title="Firm RMS API",
    description="Resource Management System for a multi-office CA firm.",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "app": settings.app_name, "environment": settings.environment}
