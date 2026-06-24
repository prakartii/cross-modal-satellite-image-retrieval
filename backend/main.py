"""
AKSHA Earth Intelligence Platform — Backend API Server
======================================================

PURPOSE:
  FastAPI application entry point. Registers all API routers,
  configures CORS, and pre-warms the archive on startup.

NEW ARCHITECTURE (v2.0):
  This backend now uses a Mission-centric architecture.
  Every page is driven by the uploaded satellite image.
  No hardcoded locations, scores, or graph data.

API ENDPOINTS:
  GET  /health              → System health check
  GET  /api/archive/stats   → Archive statistics (100 scenes)
  POST /api/analyze         → Full 10-stage AI pipeline with SSE streaming
  POST /api/upload          → Quick metadata preview (no full pipeline)
  GET  /api/search          → Text-based archive search (for Copilot)

STARTUP:
  Archive store is pre-warmed: 100 scene embeddings computed from feature profiles.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# New route (Mission-centric pipeline)
from routes.analyze import router as analyze_router_v2

# Legacy routes (kept for backward compatibility with upload + search)
try:
    from ai.api.upload import router as upload_router
    from ai.api.search import router as search_router
    _has_legacy = True
except ImportError:
    _has_legacy = False

# New archive store
from data.archive_store import archive_store


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Pre-warm archive on startup."""
    print("⚡ AKSHA Intelligence Backend v2.0 starting…")
    archive_store.initialize()
    print(f"✅ Archive initialized: {archive_store.size} scenes, {32}-dim embeddings")
    print("🌍 Mission-centric pipeline ready — all pages driven by uploaded image")
    yield
    print("🔌 AKSHA Backend shutting down…")


app = FastAPI(
    title="AKSHA Earth Intelligence API",
    description=(
        "AI-powered satellite imagery analysis. "
        "Upload → Mission → All pages driven by real image analysis. "
        "No hardcoded locations, scores, or graph data."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

# CORS — allow frontend dev server and production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register the new Mission-centric analyze route
app.include_router(analyze_router_v2, prefix="/api", tags=["Analysis v2"])

# Register legacy routes if available
if _has_legacy:
    app.include_router(upload_router,  prefix="/api", tags=["Upload"])
    app.include_router(search_router,  prefix="/api", tags=["Search"])


@app.get("/health", tags=["System"])
async def health_check() -> dict:
    """System health check for frontend connectivity detection."""
    print("[AKSHA] GET /health  → operational")
    return {
        "status":       "operational",
        "version":      "2.0.0",
        "platform":     "AKSHA Earth Intelligence Platform",
        "archive_size": archive_store.size,
        "architecture": "mission_centric",
        "api_docs":     "/docs",
    }


@app.get("/api/archive/stats", tags=["System"])
async def archive_stats() -> dict:
    """Return summary statistics about the satellite scene archive."""
    entries = archive_store.entries

    sensor_counts: dict[str, int] = {}
    satellite_counts: dict[str, int] = {}
    category_counts: dict[str, int] = {}

    for e in entries:
        st  = e.get("sensor_type", "Unknown")
        sat = e.get("satellite",   "Unknown")
        cat = e.get("category",    "Unknown")
        sensor_counts[st]    = sensor_counts.get(st, 0) + 1
        satellite_counts[sat] = satellite_counts.get(sat, 0) + 1
        category_counts[cat] = category_counts.get(cat, 0) + 1

    return {
        "total_scenes":        archive_store.size,
        "sensor_breakdown":    sensor_counts,
        "satellite_breakdown": satellite_counts,
        "category_breakdown":  category_counts,
        "date_range":          {"start": "2019-01-01", "end": "2024-12-31"},
        "regions_covered":     ["India", "Bangladesh", "Sri Lanka"],
        "embedding_dim":       32,
        "archive_version":     "AKSHA-Archive-v2.0",
        "embeddings_type":     "deterministic_feature_profiles",
    }


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
