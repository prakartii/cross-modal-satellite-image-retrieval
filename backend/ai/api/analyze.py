"""
AKSHA Earth Intelligence Platform — Analysis API (SSE Streaming)
================================================================

PURPOSE:
  FastAPI router that accepts satellite image uploads and streams the
  complete AI pipeline as Server-Sent Events (SSE) back to the frontend.

WHY IT EXISTS:
  The AI pipeline takes 3–8 seconds end-to-end. Waiting silently for
  the full result is a poor user experience. Server-Sent Events allow
  us to stream progress updates as each pipeline stage completes,
  giving users real-time visibility into what the AI is doing.

  This is the same architecture used by:
    • ChatGPT streaming token responses
    • GitHub Copilot streaming code suggestions
    • Google Earth Engine streaming map tile generation

SSE FORMAT:
  Each event is a JSON-encoded dict preceded by "data: " prefix:
    data: {"stage": "feature_extraction", "progress": 30, "data": {...}}
    \n\n  (blank line separates events)

ENDPOINT:
  POST /api/analyze
  Content-Type: multipart/form-data
  Body: file (image bytes), sensor_type (optional)

RESPONSE:
  Content-Type: text/event-stream
  Body: stream of SSE events until stage="complete"

PIPELINE POSITION:
  Frontend Upload → [Analyze Endpoint ← HERE] → Full AI Pipeline → Frontend SSE
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import AsyncGenerator, Any

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse

from ai.preprocessing.imageProcessor import ImageProcessor
from ai.preprocessing.metadataParser import MetadataParser
from ai.preprocessing.geotiffLoader import GeoTIFFLoader
from ai.feature_extraction.featureExtractor import FeatureExtractor
from ai.embeddings.embeddingGenerator import EmbeddingGenerator
from ai.embeddings.vectorStore import vector_store
from ai.search.semanticSearch import SemanticSearch
from ai.search.reranker import Reranker
from ai.graph.graphBuilder import GraphBuilder
from ai.graph.graphRanker import GraphRanker
from ai.intelligence.eventDetector import EventDetector
from ai.intelligence.confidenceEngine import ConfidenceEngine
from ai.intelligence.reportGenerator import ReportGenerator

router = APIRouter()

# Minimum real processing time per stage (seconds) — prevents instant results
# that feel fake. Actual computation usually meets or exceeds these.
STAGE_MIN_TIMES = {
    "metadata_extraction":  0.3,
    "preprocessing":        0.4,
    "feature_extraction":   0.8,
    "embedding_generation": 0.4,
    "semantic_search":      0.6,
    "graph_reranking":      0.7,
    "event_detection":      0.5,
    "confidence_estimation":0.4,
    "report_generation":    0.6,
}


def _sse(stage: str, progress: int, data: dict[str, Any]) -> str:
    """Format a single Server-Sent Event string."""
    payload = json.dumps({"stage": stage, "progress": progress, "data": data})
    return f"data: {payload}\n\n"


async def _pipeline(
    file_bytes: bytes,
    filename: str,
    sensor_override: str | None,
) -> AsyncGenerator[str, None]:
    """
    Async generator that runs the full AI pipeline and yields SSE events.

    Each stage:
      1. Records start time
      2. Runs actual computation (CPU-bound, but small enough for async)
      3. Waits if computation finished faster than STAGE_MIN_TIMES
      4. Yields SSE event with stage output

    Args:
      file_bytes:      Raw bytes of the uploaded image
      filename:        Original filename
      sensor_override: Optional sensor type override from user

    Yields:
      SSE-formatted strings
    """

    # ── Initialize pipeline components ─────────────────────────────────────
    img_proc     = ImageProcessor()
    meta_parser  = MetadataParser()
    geo_loader   = GeoTIFFLoader()
    feat_extr    = FeatureExtractor()
    emb_gen      = EmbeddingGenerator()
    searcher     = SemanticSearch()
    reranker     = Reranker()
    graph_bld    = GraphBuilder()
    graph_rnk    = GraphRanker()
    evt_det      = EventDetector()
    conf_eng     = ConfidenceEngine()
    rpt_gen      = ReportGenerator()

    # ── Stage 1: Metadata Extraction ───────────────────────────────────────
    t0 = time.perf_counter()
    yield _sse("metadata_extraction", 5, {
        "message": "Parsing scene metadata from filename and file headers…",
        "filename": filename,
    })

    is_geotiff = filename.lower().endswith((".tif", ".tiff"))
    try:
        if is_geotiff:
            raw_img, geo_meta = geo_loader.load(file_bytes)
        else:
            geo_meta = {}
            from PIL import Image
            import io
            raw_img = Image.open(io.BytesIO(file_bytes))
            raw_img.load()

        # Minimal stats for metadata parser
        import numpy as np
        arr_tmp = np.array(raw_img.convert("RGB"))
        stats_tmp = {
            "mean_r": float(arr_tmp[:,:,0].mean()),
            "mean_g": float(arr_tmp[:,:,1].mean()),
            "mean_b": float(arr_tmp[:,:,2].mean()),
            "std_r":  float(arr_tmp[:,:,0].std()),
            "dynamic_range": int(arr_tmp.max()) - int(arr_tmp.min()),
        }
        metadata = meta_parser.parse(filename, raw_img, stats_tmp)
        if sensor_override:
            metadata["sensor_type"] = sensor_override
        if geo_meta.get("has_geo"):
            if geo_meta.get("center_lat"):
                metadata["coords"] = {"lat": geo_meta["center_lat"], "lng": geo_meta["center_lng"]}

    except Exception as exc:
        yield _sse("error", 0, {"message": f"Metadata extraction failed: {exc}"})
        return

    elapsed = time.perf_counter() - t0
    await asyncio.sleep(max(0, STAGE_MIN_TIMES["metadata_extraction"] - elapsed))

    yield _sse("metadata_extraction", 10, {
        "message": "Metadata extracted successfully",
        "result": {
            "satellite":        metadata.get("satellite", "Unknown"),
            "sensor_type":      metadata.get("sensor_type", "Optical"),
            "acquisition_date": metadata.get("acquisition_date", "Unknown"),
            "region":           metadata.get("region", "Unknown"),
            "coords":           metadata.get("coords", {"lat": 0, "lng": 0}),
            "resolution":       metadata.get("resolution", "Unknown"),
            "scene_id":         metadata.get("scene_id", ""),
            "cloud_cover":      metadata.get("cloud_cover", 0),
        },
    })

    # ── Stage 2: Preprocessing ─────────────────────────────────────────────
    t0 = time.perf_counter()
    yield _sse("preprocessing", 12, {
        "message": "Normalizing image to 512×512 RGB…",
    })

    try:
        norm_img, img_stats = img_proc.load_and_normalize(file_bytes, filename)
    except ValueError as exc:
        yield _sse("error", 0, {"message": str(exc)})
        return

    elapsed = time.perf_counter() - t0
    await asyncio.sleep(max(0, STAGE_MIN_TIMES["preprocessing"] - elapsed))

    yield _sse("preprocessing", 22, {
        "message": "Preprocessing complete",
        "result": {
            "original_size":  f"{img_stats['original_width']}×{img_stats['original_height']}",
            "normalized_size": "512×512",
            "file_size_kb":   img_stats["file_size_kb"],
            "dynamic_range":  img_stats["dynamic_range"],
            "format":         img_stats["format"],
            "mean_rgb":       [
                round(img_stats["mean_r"], 1),
                round(img_stats["mean_g"], 1),
                round(img_stats["mean_b"], 1),
            ],
        },
    })

    # ── Stage 3: Feature Extraction ────────────────────────────────────────
    t0 = time.perf_counter()
    yield _sse("feature_extraction", 24, {
        "message": "Extracting texture, spectral, and spatial features…",
    })

    feat_result = feat_extr.extract(norm_img, img_stats)
    features    = feat_result.features
    summary     = feat_result.summary

    elapsed = time.perf_counter() - t0
    await asyncio.sleep(max(0, STAGE_MIN_TIMES["feature_extraction"] - elapsed))

    yield _sse("feature_extraction", 38, {
        "message": "Feature extraction complete — 32 features computed",
        "result": {
            "feature_count": len(features),
            "summary": summary,
            "key_features": {
                "water_index":       round(features.get("water_index",      0.5), 3),
                "vegetation_index":  round(features.get("vegetation_index", 0.5), 3),
                "edge_density":      round(features.get("edge_density",     0.3), 3),
                "brightness":        round(features.get("brightness",       0.5), 3),
                "entropy":           round(features.get("entropy",          0.5), 3),
                "contrast":          round(features.get("contrast",         0.3), 3),
                "homogeneity":       round(features.get("homogeneity",      0.5), 3),
            },
        },
    })

    # ── Stage 4: Embedding Generation ─────────────────────────────────────
    t0 = time.perf_counter()
    yield _sse("embedding_generation", 40, {
        "message": "Generating 32-dim unit embedding…",
    })

    embedding, emb_stats = emb_gen.generate(feat_result.vector)

    elapsed = time.perf_counter() - t0
    await asyncio.sleep(max(0, STAGE_MIN_TIMES["embedding_generation"] - elapsed))

    yield _sse("embedding_generation", 50, {
        "message": "Embedding generated and normalized to unit sphere",
        "result": {
            "embedding_dim":      emb_stats["embedding_dim"],
            "magnitude":          emb_stats["post_norm_magnitude"],
            "top_3_dimensions":   emb_stats["top_3_dimensions"],
            "mean_abs":           emb_stats["mean_abs_value"],
            "sparsity":           emb_stats["sparsity"],
        },
    })

    # ── Stage 5: Semantic Search ───────────────────────────────────────────
    t0 = time.perf_counter()
    yield _sse("semantic_search", 52, {
        "message": f"Searching 50-scene archive with cosine similarity…",
    })

    search_results, search_stats = searcher.search(
        embedding, features, k=10, threshold=0.10
    )

    elapsed = time.perf_counter() - t0
    await asyncio.sleep(max(0, STAGE_MIN_TIMES["semantic_search"] - elapsed))

    yield _sse("semantic_search", 63, {
        "message": f"Retrieved {search_stats['k_returned']} matches above threshold",
        "result": {
            "archive_size":      search_stats["archive_size"],
            "matches_found":     search_stats["k_returned"],
            "top_similarity":    search_stats["top_similarity"],
            "search_latency_ms": search_stats["search_latency_ms"],
            "threshold":         search_stats["threshold"],
        },
    })

    # ── Stage 6: Graph Re-ranking ──────────────────────────────────────────
    t0 = time.perf_counter()
    yield _sse("graph_reranking", 65, {
        "message": "Building geo-semantic graph and applying PageRank…",
    })

    # Re-rank with temporal + spatial signals
    reranked = reranker.rerank(search_results, metadata)

    # Build graph
    graph_dict = graph_bld.build(reranked, metadata)

    # Compute PageRank and adjust scores
    pr_scores = graph_rnk.compute_scores(graph_dict)
    final_results = graph_rnk.adjust_result_scores(reranked, pr_scores)

    elapsed = time.perf_counter() - t0
    await asyncio.sleep(max(0, STAGE_MIN_TIMES["graph_reranking"] - elapsed))

    yield _sse("graph_reranking", 76, {
        "message": "Graph analysis complete — PageRank re-ranking applied",
        "result": {
            "graph_nodes": graph_dict["stats"]["node_count"],
            "graph_edges": graph_dict["stats"]["edge_count"],
            "satellites_in_graph": graph_dict["stats"]["satellite_count"],
            "pagerank_applied": True,
        },
    })

    # ── Stage 7: Event Detection ───────────────────────────────────────────
    t0 = time.perf_counter()
    yield _sse("event_detection", 78, {
        "message": "Running flood + anomaly detectors…",
    })

    events = evt_det.detect(features, metadata)

    elapsed = time.perf_counter() - t0
    await asyncio.sleep(max(0, STAGE_MIN_TIMES["event_detection"] - elapsed))

    yield _sse("event_detection", 86, {
        "message": f"{len(events)} event(s) detected" if events else "No critical events detected",
        "result": {
            "events_detected": len(events),
            "primary_event":   events[0].event_type if events else None,
            "primary_severity":events[0].severity    if events else None,
            "primary_confidence": round(events[0].confidence*100,1) if events else None,
        },
    })

    # ── Stage 8: Confidence Estimation ────────────────────────────────────
    t0 = time.perf_counter()
    yield _sse("confidence_estimation", 88, {
        "message": "Computing multi-signal confidence score…",
    })

    feat_consistency  = conf_eng.compute_feature_consistency(features)
    meta_quality      = conf_eng.compute_metadata_quality(metadata)
    historical_agr    = conf_eng.compute_historical_agreement(final_results)
    top_sim           = final_results[0].similarity if final_results else 0.5
    confidence        = conf_eng.compute(top_sim, feat_consistency, meta_quality, historical_agr)

    elapsed = time.perf_counter() - t0
    await asyncio.sleep(max(0, STAGE_MIN_TIMES["confidence_estimation"] - elapsed))

    yield _sse("confidence_estimation", 94, {
        "message": f"Confidence: {confidence.level} ({round(confidence.overall*100,1)}%)",
        "result": {
            "overall":    round(confidence.overall * 100, 1),
            "level":      confidence.level,
            "components": {k: round(v*100,1) for k, v in confidence.components.items()},
            "limitations": confidence.limitations,
        },
    })

    # ── Stage 9: Report Generation ─────────────────────────────────────────
    t0 = time.perf_counter()
    yield _sse("report_generation", 96, {
        "message": "Assembling Mission Intelligence Report…",
    })

    report = rpt_gen.generate(features, final_results, events, confidence, metadata)

    elapsed = time.perf_counter() - t0
    await asyncio.sleep(max(0, STAGE_MIN_TIMES["report_generation"] - elapsed))

    yield _sse("report_generation", 99, {
        "message": "Report generated",
    })

    # ── Stage 10: Complete — deliver full payload ──────────────────────────
    yield _sse("complete", 100, {
        "message": "Intelligence pipeline complete",
        "results":  [r.to_dict() for r in final_results],
        "graph":    graph_dict,
        "events":   [
            {
                "event_type":    e.event_type,
                "severity":      e.severity,
                "confidence":    round(e.confidence * 100, 1),
                "explanation":   e.explanation,
                "recommended_action": e.recommended_action,
            }
            for e in events
        ],
        "confidence": {
            "overall": round(confidence.overall * 100, 1),
            "level":   confidence.level,
        },
        "report":   report,
        "metadata": metadata,
        "features": {k: round(v, 4) for k, v in features.items()},
    })


@router.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    sensor_type: str = Form(default=""),
) -> StreamingResponse:
    """
    Upload a satellite image and receive streaming intelligence analysis.

    Accepts: PNG, JPEG, TIFF, GeoTIFF
    Returns: Server-Sent Event stream with 10 pipeline stages

    Each SSE event has: {"stage": str, "progress": int, "data": dict}
    Final event (stage="complete") includes all results.
    """
    # Validate file type
    allowed_extensions = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"}
    filename = file.filename or "upload.png"
    ext = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {allowed_extensions}",
        )

    # Read file bytes (limit to 50MB)
    MAX_SIZE = 50 * 1024 * 1024
    file_bytes = await file.read()
    if len(file_bytes) > MAX_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large: {len(file_bytes)//1024//1024}MB. Maximum: 50MB",
        )

    sensor_override = sensor_type if sensor_type in ("SAR", "Optical", "Multispectral") else None

    return StreamingResponse(
        _pipeline(file_bytes, filename, sensor_override),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disable nginx buffering for SSE
        },
    )
