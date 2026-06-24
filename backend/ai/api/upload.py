"""
AKSHA — Upload API
Accepts image upload and returns metadata + preview info without running
the full pipeline. Used by the frontend for immediate scene metadata display.
"""

from __future__ import annotations

import base64
import io

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from ai.preprocessing.imageProcessor import ImageProcessor
from ai.preprocessing.metadataParser import MetadataParser

router = APIRouter()


@router.post("/upload")
async def upload_image(file: UploadFile = File(...)) -> JSONResponse:
    """
    Accept an image upload and return metadata + thumbnail preview.

    Returns JSON with satellite metadata, image statistics, and
    base64-encoded thumbnail (for immediate preview without re-uploading).
    """
    filename = file.filename or "upload.png"
    file_bytes = await file.read()

    if len(file_bytes) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 50MB)")

    img_proc = ImageProcessor()
    meta_parser = MetadataParser()

    try:
        norm_img, stats = img_proc.load_and_normalize(file_bytes, filename)
        metadata = meta_parser.parse(filename, norm_img, stats)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Generate thumbnail (128×128) as base64 for preview
    thumb = norm_img.resize((128, 128))
    buf = io.BytesIO()
    thumb.save(buf, format="PNG")
    thumb_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

    return JSONResponse({
        "filename":    filename,
        "metadata":    metadata,
        "stats":       stats,
        "thumbnail":   f"data:image/png;base64,{thumb_b64}",
        "ready_for_analysis": True,
    })
