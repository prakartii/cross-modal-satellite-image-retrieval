"""
AKSHA Earth Intelligence Platform — Image Preprocessor
=======================================================

PURPOSE:
  Stage 2 of the AKSHA pipeline: Preprocessing.
  Accepts raw satellite imagery (PNG/JPEG/TIFF/GeoTIFF) and produces
  a standardized 512×512 RGB PIL Image plus basic image statistics.

WHY IT EXISTS:
  Satellite images arrive from many sensors with different:
    • Bit depths (8-bit, 16-bit, 32-bit float)
    • Color modes (grayscale, RGB, RGBA, multispectral)
    • Sizes (thumbnails to 30000×30000 pixel full scenes)
  Without normalization, downstream models receive inconsistent input.
  This is analogous to "data cleaning" in classical ML pipelines.

AI CONCEPT DEMONSTRATED:
  Data preprocessing is the foundation of every ML/CV pipeline.
  In production, this includes radiometric correction, atmospheric
  correction, orthorectification, and co-registration.

PRODUCTION REPLACEMENT:
  rasterio + GDAL (full GeoTIFF), Sen2Cor (Sentinel-2 atmospheric
  correction), SNAP toolbox (SAR preprocessing).

INPUTS:
  file_bytes: Raw bytes of the uploaded image file
  filename:   Original filename (used for format detection)

OUTPUTS:
  normalized_image: PIL.Image, RGB mode, 512×512
  stats: dict with pixel statistics and metadata

PIPELINE POSITION:
  Upload → [Preprocessing ← HERE] → Feature Extraction
"""

from __future__ import annotations

import io
from typing import Any

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

TARGET_SIZE = (512, 512)
MIN_SIZE = (32, 32)


class ImageProcessor:
    """
    Loads, validates, and normalizes satellite imagery.

    In production this class would handle multi-band GeoTIFF extraction,
    radiometric calibration, cloud masking, and reprojection to WGS84.
    For this prototype, we normalize all images to 8-bit RGB.
    """

    def load_and_normalize(
        self,
        file_bytes: bytes,
        filename: str = "image.png",
    ) -> tuple[Image.Image, dict[str, Any]]:
        """
        Load raw image bytes and return a normalized PIL Image + stats.

        Normalization pipeline:
          1. Detect format and open with Pillow
          2. Convert to RGB (handles grayscale, RGBA, palette, float modes)
          3. Gentle contrast enhancement for flat/dark imagery
          4. Resize to TARGET_SIZE using Lanczos (high-quality downsampling)
          5. Collect pixel statistics for downstream metadata enrichment

        Args:
          file_bytes: Raw bytes of the uploaded image
          filename:   Original filename for format hints

        Returns:
          Tuple of (normalized PIL Image, statistics dict)

        Raises:
          ValueError: If image is too small, corrupted, or unsupported format
        """
        # Step 1: Open image
        try:
            img = Image.open(io.BytesIO(file_bytes))
            img.load()
        except Exception as exc:
            raise ValueError(f"Cannot open image '{filename}': {exc}") from exc

        original_size = img.size
        original_mode = img.mode

        # Step 2: Validate size
        if img.size[0] < MIN_SIZE[0] or img.size[1] < MIN_SIZE[1]:
            raise ValueError(
                f"Image too small: {img.size}. Minimum acceptable size: {MIN_SIZE}. "
                "Please upload a full satellite scene."
            )

        # Step 3: Normalize to RGB
        img = self._to_rgb(img)

        # Step 4: Auto-enhance flat imagery (common in raw satellite data)
        img = self._auto_enhance(img)

        # Step 5: Resize to standard size
        img = img.resize(TARGET_SIZE, Image.LANCZOS)

        # Step 6: Collect pixel statistics
        arr = np.array(img)
        stats: dict[str, Any] = {
            "original_width":  original_size[0],
            "original_height": original_size[1],
            "original_mode":   original_mode,
            "normalized_size": TARGET_SIZE,
            "file_size_kb":    round(len(file_bytes) / 1024, 1),
            "mean_r": float(np.mean(arr[:, :, 0])),
            "mean_g": float(np.mean(arr[:, :, 1])),
            "mean_b": float(np.mean(arr[:, :, 2])),
            "std_r":  float(np.std(arr[:, :, 0])),
            "std_g":  float(np.std(arr[:, :, 1])),
            "std_b":  float(np.std(arr[:, :, 2])),
            "dynamic_range": float(int(arr.max()) - int(arr.min())),
            "format": filename.rsplit(".", 1)[-1].upper() if "." in filename else "UNKNOWN",
        }

        return img, stats

    def _to_rgb(self, img: Image.Image) -> Image.Image:
        """
        Convert any PIL image mode to RGB.

        Handles satellite-specific edge cases:
          L / LA  → Grayscale (SAR backscatter, panchromatic)
          RGBA    → PNG files with alpha (cloud mask layers)
          P       → Palette/indexed (legacy TIFF formats)
          I       → 32-bit int (16-bit satellite data auto-loaded as I)
          F       → Float (NDVI rasters, scientific datasets)
        """
        if img.mode == "RGB":
            return img

        if img.mode in ("L", "LA"):
            # Grayscale → replicate across 3 channels
            img_l = img.convert("L")
            return Image.merge("RGB", [img_l, img_l, img_l])

        if img.mode == "RGBA":
            # Composite onto white background
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[3])
            return bg

        if img.mode in ("I", "F"):
            # High bit-depth → normalize to 8-bit
            arr = np.array(img, dtype=np.float32)
            mn, mx = float(arr.min()), float(arr.max())
            if mx > mn:
                arr = ((arr - mn) / (mx - mn) * 255.0).astype(np.uint8)
            else:
                arr = np.zeros(arr.shape, dtype=np.uint8)
            img_8 = Image.fromarray(arr, mode="L")
            return Image.merge("RGB", [img_8, img_8, img_8])

        # Fallback for CMYK, P, etc.
        return img.convert("RGB")

    def _auto_enhance(self, img: Image.Image) -> Image.Image:
        """
        Apply gentle auto-enhancement to flat or under-exposed imagery.

        Satellite images often have low contrast due to atmospheric haze,
        instrument gain settings, or low solar elevation angles.
        We apply mild enhancement only when the image appears flat.

        Production alternative: per-band CLAHE (Contrast Limited Adaptive
        Histogram Equalization) which preserves local detail better.
        """
        arr = np.array(img)
        dynamic_range = int(arr.max()) - int(arr.min())

        if dynamic_range < 80:
            # Image is flat — apply conservative contrast boost
            img = ImageEnhance.Contrast(img).enhance(1.35)

        # Very light sharpening to counteract Lanczos softening
        img = img.filter(ImageFilter.SMOOTH_MORE)
        return img

    def to_numpy(self, img: Image.Image) -> np.ndarray:
        """
        Convert PIL Image to float32 numpy array scaled to [0, 1].

        Returns:
          ndarray of shape (512, 512, 3), dtype float32, values in [0.0, 1.0]
          The [0, 1] range is standard input for neural networks.
        """
        return np.array(img, dtype=np.float32) / 255.0
