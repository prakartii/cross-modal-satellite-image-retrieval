"""
backend/routes/analyze.py

PURPOSE:
  FastAPI route for the main AKSHA analysis endpoint.
  Accepts a satellite image upload and streams the 10-stage AI pipeline
  results back to the frontend using Server-Sent Events (SSE).

WHY SERVER-SENT EVENTS (SSE):
  The pipeline takes 5-10 seconds to complete.
  Without SSE: user sees a blank screen for 10 seconds, then results appear.
  With SSE: each pipeline stage streams its output in real-time, giving the
  operator live feedback on what the AI is computing.

  SSE is simpler than WebSockets for one-directional streaming (server → client).
  Format: "data: {JSON payload}\n\n"
  The frontend's EventSource API natively handles this format.

STREAMING PROTOCOL:
  Each event: data: {"stage": str, "progress": int (0-100), "data": dict}\n\n
  Final event: data: {"stage": "complete", "progress": 100, "data": MissionDict}\n\n

ENDPOINT: POST /api/analyze
INPUT: multipart/form-data with:
  - file: image file (PNG, JPEG, TIFF, BMP, GeoTIFF; max 50MB)
  - sensor_type: optional string ("SAR" | "Optical" | "Multispectral")

OUTPUT: text/event-stream — SSE stream of pipeline stage events
"""

from __future__ import annotations

import json
import logging
import time
from typing import AsyncGenerator

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import StreamingResponse

from services.mission_service import MissionService

logger = logging.getLogger("aksha.analyze")

router = APIRouter()

# Maximum file size: 50MB
MAX_FILE_SIZE = 50 * 1024 * 1024

# Allowed image extensions
ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp", ".jp2"}


def _sse(stage: str, progress: int, data: dict) -> str:
    """Format a single SSE event."""
    payload = json.dumps({"stage": stage, "progress": progress, "data": data})
    return f"data: {payload}\n\n"


@router.post("/analyze", tags=["Analysis"])
async def analyze_image(
    request: Request,
    file: UploadFile = File(...),
    sensor_type: str = Form(default=""),
) -> StreamingResponse:
    """
    Upload a satellite image and receive AI pipeline results via SSE streaming.

    The response is a text/event-stream where each event represents one
    pipeline stage completing. The final "complete" event contains the
    full Mission object with all results.

    The frontend parses this stream and updates the UI at each stage,
    giving real-time visibility into the AI pipeline.
    """
    t_start = time.time()
    client  = request.client.host if request.client else "unknown"
    logger.info("POST /api/analyze — client=%s file=%s sensor=%s", client, file.filename, sensor_type or "auto")
    print(f"[AKSHA] POST /api/analyze  client={client}  file={file.filename}  sensor={sensor_type or 'auto'}")

    # Validate file
    if not file.filename:
        logger.warning("Rejected: no filename")
        raise HTTPException(400, "No file provided")

    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        logger.warning("Rejected: unsupported extension %s", ext)
        raise HTTPException(400, f"Unsupported file type: {ext}. Use PNG, JPEG, or TIFF.")

    # Read bytes
    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(400, "Uploaded file is empty")
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(413, f"File too large: {len(file_bytes)/(1024*1024):.1f}MB. Max: 50MB")

    size_kb = len(file_bytes) / 1024
    logger.info("File accepted: %s  %.1f KB", file.filename, size_kb)
    print(f"[AKSHA] File accepted: {file.filename}  {size_kb:.1f} KB")

    filename = file.filename or "upload.png"
    service  = MissionService()

    async def generate() -> AsyncGenerator[str, None]:
        """Async generator that runs the pipeline and yields SSE events."""
        try:
            # Collect stages to stream
            async def on_stage(stage: str, progress: int, data: dict) -> None:
                yield _sse(stage, progress, data)

            # Run the pipeline
            # We need to collect yields from a nested async generator
            # Pattern: accumulate events and yield them
            events_buffer = []

            async def buffered_on_stage(stage: str, progress: int, data: dict) -> None:
                events_buffer.append(_sse(stage, progress, data))

            mission = await service.run_pipeline(
                file_bytes,
                filename,
                buffered_on_stage,
            )

            # Yield all buffered events
            for event in events_buffer:
                yield event

            # Final complete event: full mission data
            mission_dict = mission.to_dict()

            # Build the "complete" payload matching frontend expectations
            complete_data = {
                "results":      mission.retrieval_results,
                "graph":        mission.graph,
                "events":       mission.events,
                "confidence":   mission.confidence,
                "report":       mission.report,
                "metadata":     mission.metadata,
                "features":     mission.features,
                "timeline":     mission.timeline,
                "analytics":    mission.analytics,
                "scene_type":   mission.scene_type,
                "mission_id":   mission.id,
                "query_thumbnail_b64": mission.query_thumbnail_b64,
                "logs":         mission.logs,
            }

            elapsed = time.time() - t_start
            logger.info("Mission %s complete in %.2fs — %d results", mission.id, elapsed, len(mission.retrieval_results))
            print(f"[AKSHA] ✅ Mission {mission.id} complete  {elapsed:.2f}s  {len(mission.retrieval_results)} results")
            yield _sse("complete", 100, complete_data)

        except Exception as e:
            logger.error("Pipeline error: %s", e, exc_info=True)
            print(f"[AKSHA] ❌ Pipeline error: {e}")
            # Stream error event to frontend (so it can show error state)
            yield _sse("error", 0, {
                "message": str(e),
                "stage":   "pipeline_error",
            })

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disable nginx buffering for SSE
            "Access-Control-Allow-Origin": "*",
        },
    )
