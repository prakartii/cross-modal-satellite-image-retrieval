"""
AKSHA Earth Intelligence Platform — Backend API Server
======================================================

PURPOSE:
  FastAPI application entry point. Registers all API routers and
  auto-initializes the archive database on startup if it doesn't exist.

ARCHITECTURE (v3.0 — Real Retrieval Pipeline):
  Every search result comes from real cosine similarity between the uploaded
  image's embedding and the 50 pre-computed archive embeddings.
  No hardcoded results, no random scores, no mock data.

  Pipeline stages (each in its own service file):
    image_loader.py      → validate + open image
    metadata_parser.py   → extract filename/EXIF metadata
    preprocessing.py     → resize to 512×512, normalize to [0,1]
    feature_extractor.py → extract 14 features
    embedding_generator.py → compute 14-dim unit embedding
    similarity_search.py → cosine similarity vs 50 archive embeddings
    reranker.py          → temporal + sensor re-ranking
    result_formatter.py  → assemble final JSON response

PRIMARY ENDPOINT:
  POST /api/search → Real retrieval pipeline → JSON results

LEGACY ENDPOINTS (kept for backward compatibility):
  GET  /health
  GET  /api/archive/stats
  POST /api/analyze (SSE streaming — kept for old frontend)
"""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator, Any

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# New clean retrieval API (v3.0)
from api.routes import router as search_router_v3

# Legacy SSE pipeline (kept for backward compat)
try:
    from routes.analyze import router as analyze_router_v2
    _has_analyze = True
except ImportError:
    _has_analyze = False

# Legacy upload/search routes
try:
    from ai.api.upload import router as upload_router
    from ai.api.search import router as legacy_search_router
    _has_legacy = True
except ImportError:
    _has_legacy = False

# Legacy archive store (kept for /api/archive/stats)
try:
    from data.archive_store import archive_store
    _has_archive_store = True
except ImportError:
    _has_archive_store = False

# New archive database seeder
from database.seed import ensure_database_exists


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Auto-seed the archive database on startup if files are missing."""
    print("[AKSHA] Backend v3.0 starting...")

    # Generate embeddings.json and metadata.json if they don't exist.
    # This runs the seed.py logic to compute 50 archive embeddings
    # from their feature profiles using the exact same embedding_generator
    # that is used for query images.
    ensure_database_exists()

    # Pre-warm legacy archive store if available
    if _has_archive_store:
        archive_store.initialize()

    print("[AKSHA] Real retrieval pipeline ready -- POST /api/search to begin")
    print("[AKSHA] Archive: 50 scenes, 14-dim embeddings, cosine similarity search")
    yield
    print("[AKSHA] Backend shutting down...")


app = FastAPI(
    title="AKSHA Earth Intelligence API",
    description=(
        "Real AI-powered satellite image retrieval. "
        "Upload image → 14-feature extraction → cosine similarity → top-K results. "
        "No hardcoded results. All scores from real embedding comparisons."
    ),
    version="3.0.0",
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

# ── Register routes ────────────────────────────────────────────────────────────

# v3.0 real retrieval pipeline — PRIMARY endpoint
app.include_router(search_router_v3, prefix="/api", tags=["Retrieval v3"])

# v2.0 SSE pipeline (legacy)
if _has_analyze:
    app.include_router(analyze_router_v2, prefix="/api", tags=["Analysis v2 (Legacy SSE)"])

# v1.0 upload + text search (legacy)
if _has_legacy:
    app.include_router(upload_router,        prefix="/api", tags=["Upload (Legacy)"])
    app.include_router(legacy_search_router, prefix="/api", tags=["Text Search (Legacy)"])


@app.get("/health", tags=["System"])
async def health_check() -> dict[str, Any]:
    """System health check for frontend connectivity detection."""
    archive_size = 0
    try:
        from services.similarity_search import get_archive_size
        archive_size = get_archive_size()
    except Exception:
        if _has_archive_store:
            archive_size = archive_store.size

    return {
        "status":        "operational",
        "version":       "3.0.0",
        "platform":      "AKSHA Earth Intelligence Platform",
        "archive_size":  archive_size,
        "embedding_dim": 14,
        "pipeline":      "real_cosine_similarity",
        "api_docs":      "/docs",
    }


@app.get("/api/archive/stats", tags=["System"])
async def archive_stats() -> dict[str, Any]:
    """Return statistics about the satellite scene archive."""
    # Try to read from the new metadata.json
    meta_path = os.path.join(os.path.dirname(__file__), "database", "metadata.json")
    if os.path.exists(meta_path):
        with open(meta_path, "r", encoding="utf-8") as f:
            entries: list[dict] = json.load(f)

        sensor_counts: dict[str, int] = {}
        satellite_counts: dict[str, int] = {}
        scene_type_counts: dict[str, int] = {}

        for e in entries:
            st  = e.get("sensor_type", "Unknown")
            sat = e.get("satellite",   "Unknown")
            sct = e.get("scene_type",  "Unknown")
            sensor_counts[st]      = sensor_counts.get(st, 0) + 1
            satellite_counts[sat]  = satellite_counts.get(sat, 0) + 1
            scene_type_counts[sct] = scene_type_counts.get(sct, 0) + 1

        return {
            "total_scenes":        len(entries),
            "sensor_breakdown":    sensor_counts,
            "satellite_breakdown": satellite_counts,
            "scene_type_breakdown": scene_type_counts,
            "date_range":          {"start": "2018-01-01", "end": "2024-12-31"},
            "regions_covered":     ["India", "Bangladesh"],
            "embedding_dim":       14,
            "archive_version":     "AKSHA-Archive-v3.0",
            "embeddings_type":     "feature_profile_cosine_embeddings",
        }

    # Fallback to legacy archive store
    if _has_archive_store:
        return {"total_scenes": archive_store.size, "embedding_dim": 32}

    return {"total_scenes": 0, "error": "Archive not initialized"}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )
