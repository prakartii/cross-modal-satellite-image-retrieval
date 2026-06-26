"""
backend/services/image_loader.py

PIPELINE STAGE: 1 — Load & Validate
INPUT:  Raw file bytes from the HTTP multipart upload
OUTPUT: PIL.Image object + basic validation metadata

PURPOSE:
  The first gate in the pipeline. Validates that the uploaded bytes are a
  readable image file, opens it with PIL (Python Imaging Library), and
  returns a ready-to-process Image object along with basic file information.

WHY VALIDATE FIRST:
  Users may upload corrupt files, non-image files, or images with unusual
  modes (e.g., CMYK, palette, 16-bit grayscale). Validating early means
  we fail fast with a clear error message rather than crashing deep in the
  feature extraction stage with a confusing numpy shape error.

SUPPORTED FORMATS:
  JPEG, PNG, TIFF, BMP, GIF (first frame) — anything Pillow can open.
  TIFF and GeoTIFF are particularly important for satellite imagery.

SIZE LIMITS:
  We accept images of any resolution — the preprocessing stage will
  resize to 512×512. A 10000×10000 pixel satellite scene and a 64×64
  thumbnail both produce the same 512×512 input to the feature extractor.
"""

from __future__ import annotations

import io
from typing import Any

from PIL import Image, UnidentifiedImageError


# Maximum allowed file size: 50 MB
# Satellite imagery scenes from ISRO Bhuvan are typically 5–15 MB per band.
# Multi-band composites can reach 30–40 MB. 50 MB covers all common cases.
MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB


def load_image(file_bytes: bytes, filename: str) -> dict[str, Any]:
    """
    Validate the uploaded bytes and open them as a PIL Image.

    VALIDATION STEPS:
      1. Check file size is within the allowed limit.
      2. Attempt to open the bytes as an image with PIL.
      3. Verify PIL can fully load the image (not just the header).

    Args:
      file_bytes: Raw bytes from the multipart upload.
      filename:   Original filename (used for metadata, not for reading).

    Returns:
      Dict with:
        "image"      → PIL.Image object (not yet resized or converted)
        "filename"   → original filename
        "file_size"  → size in bytes
        "format"     → PIL format string, e.g. "JPEG", "PNG", "TIFF"
        "mode"       → PIL mode string, e.g. "RGB", "L", "RGBA"
        "width"      → original width in pixels
        "height"     → original height in pixels

    Raises:
      ValueError: If the file is too large, not a valid image, or cannot be decoded.
    """
    # ── Step 1: Size check ────────────────────────────────────────────────────
    # Check before trying to open — this prevents memory issues from
    # trying to decompress a 200 MB file into RAM.
    size_bytes = len(file_bytes)
    if size_bytes == 0:
        raise ValueError("Uploaded file is empty.")
    if size_bytes > MAX_FILE_SIZE_BYTES:
        raise ValueError(
            f"File too large: {size_bytes / (1024*1024):.1f} MB. "
            f"Maximum allowed: {MAX_FILE_SIZE_BYTES // (1024*1024)} MB."
        )

    # ── Step 2: Open with PIL ────────────────────────────────────────────────
    # io.BytesIO wraps the raw bytes in a file-like object so PIL can read them
    # without writing to disk. This keeps the pipeline entirely in memory.
    try:
        img = Image.open(io.BytesIO(file_bytes))
    except UnidentifiedImageError:
        # PIL couldn't recognize the format (e.g., user uploaded a PDF or .csv)
        raise ValueError(
            f"Cannot open '{filename}' as an image. "
            "Supported formats: JPEG, PNG, TIFF, BMP, GIF."
        )
    except Exception as e:
        raise ValueError(f"Failed to open image '{filename}': {e}")

    # ── Step 3: Fully decode (verify integrity) ───────────────────────────────
    # PIL uses lazy loading: Image.open() only reads the header.
    # Calling img.load() forces PIL to decode the full pixel data.
    # This catches truncated files that have a valid header but corrupt body.
    try:
        img.load()
    except Exception as e:
        raise ValueError(f"Image '{filename}' is corrupt or truncated: {e}")

    # ── Collect metadata ──────────────────────────────────────────────────────
    return {
        "image":     img,
        "filename":  filename,
        "file_size": size_bytes,
        "format":    img.format or "UNKNOWN",
        "mode":      img.mode,
        "width":     img.width,
        "height":    img.height,
    }
