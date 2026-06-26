"""
backend/api/routes.py

PURPOSE:
  FastAPI route definitions for the AKSHA retrieval pipeline.
  Defines the POST /api/search endpoint that drives the entire UI.

ENDPOINT: POST /api/search
  This is the only endpoint the Intelligence Search page calls.
  It runs the complete 7-stage pipeline and returns a JSON response
  with all results in one shot (no streaming).

REQUEST:
  Multipart form with:
    file:       required — the uploaded satellite image
    top_k:      optional — number of results to return (default 10)

RESPONSE: SearchResponse (defined in models/schemas.py)
  Includes: results, query_metadata, query_features, query_embedding,
            archive_size, pipeline_ms, scene_type_guess, confidence

PIPELINE STAGES (all synchronous, no streaming):
  1. image_loader.load_image()    — validate + open
  2. metadata_parser.parse_metadata()  — extract filename/EXIF metadata
  3. preprocessing.preprocess()   — resize to 512×512, normalize to [0,1]
  4. feature_extractor.extract_all_features() — compute 14 features
  5. embedding_generator.generate_embedding() — compute unit embedding
  6. similarity_search.search()   — cosine similarity vs archive
  7. reranker.rerank()            — temporal + sensor re-ranking
  8. result_formatter.format_results() — assemble final response
"""

from __future__ import annotations

import json
import os
import time
from typing import Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from services.image_loader       import load_image
from services.preprocessing      import preprocess
from services.feature_extractor  import extract_all_features, infer_scene_type
from services.embedding_generator import generate_embedding
from services.similarity_search  import search, get_archive_size
from services.reranker           import rerank
from services.metadata_parser    import parse_metadata
from services.result_formatter   import format_results

# Archive metadata loaded once at module import (small file, < 100 KB)
_METADATA_PATH = os.path.join(
    os.path.dirname(__file__), "..", "database", "metadata.json"
)
_archive_metadata: list[dict] | None = None


def _load_archive_metadata() -> list[dict]:
    """Load metadata.json once and cache in module-level variable."""
    global _archive_metadata
    if _archive_metadata is None:
        with open(_METADATA_PATH, "r", encoding="utf-8") as f:
            _archive_metadata = json.load(f)
    return _archive_metadata


# Create a FastAPI router — this is included in main.py under the /api prefix
router = APIRouter()


@router.post("/search")
async def search_endpoint(
    file:  UploadFile = File(..., description="Satellite image file to search against archive"),
    top_k: int        = Form(10,  description="Number of top results to return (1–50)"),
) -> dict[str, Any]:
    """
    Run the full 7-stage AI retrieval pipeline for an uploaded satellite image.

    PIPELINE FLOW:
      Upload → Validate → Resize → Normalize → Extract Features →
      Generate Embedding → Cosine Similarity Search → Re-rank → Format → Return

    SIMILARITY GUARANTEE:
      All similarity scores in the response are computed by real cosine similarity
      between the query embedding and archive embeddings. No scores are hardcoded,
      randomly assigned, or looked up from a table.

    ARGS:
      file:  Multipart image upload (JPEG, PNG, TIFF, BMP, GIF)
      top_k: Number of results to return (clamped to [1, 50])

    RETURNS:
      JSON body matching SearchResponse schema.

    RAISES:
      400 Bad Request: If the file is invalid (too large, not an image, corrupt)
      500 Internal Server Error: If the archive database is missing
    """
    # Start timer — total pipeline latency for diagnostic reporting
    t_start = time.perf_counter()

    # ── Clamp top_k to valid range ────────────────────────────────────────────
    top_k = max(1, min(top_k, 50))

    # ── Read file bytes from upload ───────────────────────────────────────────
    # FastAPI's UploadFile is an async stream; we read all bytes at once.
    # This is fine for images up to 50 MB (handled by load_image validation).
    file_bytes = await file.read()
    filename   = file.filename or "upload.jpg"

    # ── Stage 1: Load & Validate ──────────────────────────────────────────────
    try:
        loaded = load_image(file_bytes, filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    pil_image = loaded["image"]

    # ── Stage 0.5: Parse filename and EXIF metadata ───────────────────────────
    # This runs alongside Stage 1 since it needs both the filename and the PIL image.
    query_metadata = parse_metadata(filename, file_bytes, pil_image)
    query_metadata["image_width"]  = loaded["width"]
    query_metadata["image_height"] = loaded["height"]

    # ── Stage 2: Preprocess (Resize + Normalize) ──────────────────────────────
    preprocessed = preprocess(pil_image)
    pixel_array  = preprocessed["array"]  # float32 [512, 512, 3]

    # ── Stage 3: Feature Extraction ───────────────────────────────────────────
    # Extract 14 named features: color statistics, texture, edge density,
    # water ratio, vegetation ratio, urban density.
    features = extract_all_features(pixel_array)

    # Infer scene type from features (for display purposes only)
    scene_type_guess, confidence = infer_scene_type(features)

    # ── Stage 4: Embedding Generation ─────────────────────────────────────────
    # Convert feature dict to a 14-dim unit vector using weighted L2 normalization.
    embedding = generate_embedding(features)

    # ── Stage 5: Cosine Similarity Search ─────────────────────────────────────
    # Compare query embedding against all 50 archive embeddings.
    # Returns list of {id, score, rank} ordered by descending cosine similarity.
    try:
        raw_matches = search(embedding, top_k=top_k)
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=500,
            detail=f"Archive not initialized. {e}",
        )

    # ── Stage 6: Re-ranking ───────────────────────────────────────────────────
    # Adjust scores using temporal and sensor-type context signals.
    archive_meta = _load_archive_metadata()
    reranked     = rerank(raw_matches, archive_meta, query_metadata)

    # ── Stage 7: Result Formatting ────────────────────────────────────────────
    # Combine ranked results with full archive metadata and per-feature similarity.
    formatted = format_results(reranked, archive_meta, features)

    # ── Measure total latency ─────────────────────────────────────────────────
    pipeline_ms = round((time.perf_counter() - t_start) * 1000, 1)

    # ── Build response ────────────────────────────────────────────────────────
    return {
        "results":          formatted,
        "query_metadata":   query_metadata,
        "query_features":   features,
        "query_embedding":  embedding.tolist(),
        "top_k":            top_k,
        "archive_size":     get_archive_size(),
        "pipeline_ms":      pipeline_ms,
        "scene_type_guess": scene_type_guess,
        "confidence":       round(confidence, 3),
    }


@router.get("/search/health")
async def search_health() -> dict[str, Any]:
    """
    Health check for the search pipeline specifically.
    Returns archive size and embedding dimension.
    """
    try:
        size = get_archive_size()
        meta = _load_archive_metadata()
        return {
            "status":        "operational",
            "archive_size":  size,
            "embedding_dim": 14,
            "db_path":       _METADATA_PATH,
            "scene_types":   list({m["scene_type"] for m in meta}),
        }
    except Exception as e:
        return {
            "status":  "degraded",
            "error":   str(e),
        }
