"""
backend/ai/image_processing/preprocessing.py

PURPOSE:
  Stage 2 of the AKSHA AI pipeline.
  Normalizes a raw satellite image into a standard format suitable for
  feature extraction. Every image that enters the pipeline exits as
  a 512×512 RGB float32 array with pixel values in [0, 1].

WHY NORMALIZE:
  Feature extraction algorithms assume a standard input format.
  Without normalization:
    - A 4096×4096 image takes 64× more memory than a 512×512 one
    - Different image modes (grayscale vs RGB) produce incomparable features
    - High-contrast vs low-contrast scenes produce incomparable texture values

PREPROCESSING STEPS:
  1. Load image from raw bytes using Pillow
  2. Convert to RGB (handles L, LA, RGBA, I, F modes)
  3. Auto-enhance contrast if dynamic range is poor (< 80/255)
  4. Resize to 512×512 using LANCZOS (high quality downsampling)
  5. Apply histogram equalization to improve feature discrimination
  6. Convert to float32 NumPy array, values in [0, 1]

ALGORITHM — LANCZOS RESAMPLING:
  When we resize an image, we need to compute the color of each output pixel
  from nearby input pixels. LANCZOS uses a sinc-based kernel:
    L(x) = sinc(x) × sinc(x/a)   where a=3 (kernel size)
  This preserves high-frequency detail better than bilinear/nearest-neighbor.
  LANCZOS is standard for satellite image downsampling (ESA, USGS both use it).

ALGORITHM — HISTOGRAM EQUALIZATION:
  A satellite image might use only a small fraction of the [0, 255] range
  (e.g., all pixels between 80-150). This compresses feature space.
  Histogram equalization spreads the pixel distribution across the full range:
    new_pixel = CDF(old_pixel) × 255
  where CDF is the cumulative distribution function of the pixel histogram.
  This dramatically improves texture feature quality.

INPUT:  raw bytes (any image format Pillow supports: PNG, JPEG, TIFF, BMP, GeoTIFF)
OUTPUT: (PIL.Image at 512×512 RGB, stats dict)

COMPLEXITY: O(W × H) where W, H are input image dimensions.
"""

from __future__ import annotations

import io
from typing import Any

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageOps


# Target size for all images entering the feature extractor
TARGET_SIZE = (512, 512)
MIN_SIZE    = (16, 16)    # Images smaller than this are rejected


class ImagePreprocessor:
    """
    Normalizes satellite imagery to a standard format for feature extraction.
    Handles all common satellite image formats and bit depths.
    """

    def load_and_preprocess(
        self,
        file_bytes: bytes,
        filename: str = "",
    ) -> tuple[Image.Image, dict[str, Any]]:
        """
        Main entry point: load raw bytes and return preprocessed image + stats.

        Args:
            file_bytes: Raw bytes from the uploaded file
            filename: Original filename (for format hints)

        Returns:
            (img, stats) where img is 512×512 RGB and stats has pixel statistics.

        Raises:
            ValueError: If image cannot be loaded or is too small.
        """
        # Step 1: Load image from raw bytes
        try:
            img = Image.open(io.BytesIO(file_bytes))
            img.load()  # Force decode (Pillow is lazy by default)
        except Exception as e:
            raise ValueError(f"Cannot open image: {e}") from e

        # Record original properties before any transformation
        original_size   = (img.width, img.height)
        original_mode   = img.mode
        original_format = img.format or "UNKNOWN"

        # Step 2: Validate minimum size
        if img.width < MIN_SIZE[0] or img.height < MIN_SIZE[1]:
            raise ValueError(
                f"Image too small: {img.width}×{img.height}. "
                f"Minimum: {MIN_SIZE[0]}×{MIN_SIZE[1]}."
            )

        # Step 3: Convert all modes to RGB
        img = self._to_rgb(img)

        # Step 4: Compute raw statistics BEFORE enhancement (for authentic values)
        raw_stats = self._compute_stats(img)

        # Step 5: Auto-enhance if contrast is poor
        enhanced = False
        if raw_stats["dynamic_range"] < 80:
            img = self._enhance_contrast(img)
            enhanced = True

        # Step 6: Histogram equalization for better feature discrimination
        # Apply per-channel to preserve color balance
        img = self._equalize_histogram(img)

        # Step 7: Resize to standard 512×512
        if img.width != TARGET_SIZE[0] or img.height != TARGET_SIZE[1]:
            img = img.resize(TARGET_SIZE, Image.LANCZOS)

        # Step 8: Compute final statistics on the normalized image
        final_stats = self._compute_stats(img)

        stats = {
            "original_size":     list(original_size),
            "normalized_size":   list(TARGET_SIZE),
            "original_mode":     original_mode,
            "original_format":   original_format,
            "file_size_bytes":   len(file_bytes),
            "file_size_kb":      round(len(file_bytes) / 1024, 1),
            "dynamic_range":     raw_stats["dynamic_range"],
            "enhanced":          enhanced,
            # Final pixel statistics (used by feature extractor and metadata)
            "mean_r":            final_stats["mean_r"],
            "mean_g":            final_stats["mean_g"],
            "mean_b":            final_stats["mean_b"],
            "std_r":             final_stats["std_r"],
            "std_g":             final_stats["std_g"],
            "std_b":             final_stats["std_b"],
            "mean_brightness":   final_stats["mean_brightness"],
            "std_gray":          final_stats["std_gray"],
        }

        return img, stats

    def to_numpy(self, img: Image.Image) -> np.ndarray:
        """
        Convert PIL image to float32 NumPy array with values in [0, 1].

        WHY FLOAT32?
          Feature extraction uses floating point arithmetic.
          Float32 is the standard for ML/AI computation:
            - Float64 (double) is 2× memory with minimal precision benefit
            - Int8/Int16 would require constant scaling
          Values in [0, 1] rather than [0, 255] are scale-independent
          and directly usable in normalized feature formulas.
        """
        arr = np.array(img, dtype=np.float32)
        return arr / 255.0

    def make_thumbnail_b64(self, img: Image.Image, size: int = 256) -> str:
        """
        Generate a base64-encoded PNG thumbnail for the query image.
        Stored in Mission.query_thumbnail_b64 for the Compare view.

        The thumbnail is shown in the frontend alongside retrieved archive
        images for visual comparison.
        """
        import base64

        thumb = img.copy()
        thumb.thumbnail((size, size), Image.LANCZOS)
        buf = io.BytesIO()
        thumb.save(buf, format="PNG")
        encoded = base64.b64encode(buf.getvalue()).decode("utf-8")
        return f"data:image/png;base64,{encoded}"

    # ─────────────────────────────────────────────────────────────────────────
    # Private helpers
    # ─────────────────────────────────────────────────────────────────────────

    def _to_rgb(self, img: Image.Image) -> Image.Image:
        """
        Convert any PIL image mode to RGB.

        Handles:
          L    (grayscale 8-bit)  → stack to 3 channels: RGB = (L, L, L)
          LA   (grayscale + alpha) → drop alpha, stack
          RGBA (RGB + alpha)       → composite onto white background
          I    (32-bit integer)   → scale to 8-bit, convert
          F    (32-bit float)     → scale to 8-bit, convert
          P    (palette/indexed)  → convert via palette lookup
          CMYK → RGB via built-in
          Everything else         → force RGB conversion

        WHY WHITE BACKGROUND FOR RGBA:
          Transparency (alpha channel) has no meaning for satellite imagery.
          White is the neutral choice for compositing — it doesn't introduce
          spectral artifacts into feature extraction.
        """
        mode = img.mode

        if mode == "RGB":
            return img

        if mode in ("L", "LA"):
            # Grayscale → RGB by replication
            if mode == "LA":
                img = img.split()[0]  # Drop alpha
            return Image.merge("RGB", [img, img, img])

        if mode == "RGBA":
            # Composite onto white background
            background = Image.new("RGB", img.size, (255, 255, 255))
            background.paste(img, mask=img.split()[3])  # Use alpha as mask
            return background

        if mode in ("I", "I;16", "I;16B"):
            # 16-bit or 32-bit integer → scale to 8-bit
            arr = np.array(img, dtype=np.float64)
            lo, hi = arr.min(), arr.max()
            if hi > lo:
                arr = (arr - lo) / (hi - lo) * 255.0
            img8 = Image.fromarray(arr.astype(np.uint8), mode="L")
            return Image.merge("RGB", [img8, img8, img8])

        if mode == "F":
            # 32-bit float → scale to 8-bit
            arr = np.array(img, dtype=np.float64)
            lo, hi = arr.min(), arr.max()
            if hi > lo:
                arr = (arr - lo) / (hi - lo) * 255.0
            img8 = Image.fromarray(arr.astype(np.uint8), mode="L")
            return Image.merge("RGB", [img8, img8, img8])

        # All other modes (P, CMYK, YCbCr, HSV, etc.)
        try:
            return img.convert("RGB")
        except Exception:
            # Last resort: convert via intermediate
            return img.convert("RGBA").convert("RGB")

    def _enhance_contrast(self, img: Image.Image) -> Image.Image:
        """
        Apply mild contrast enhancement for low-dynamic-range images.

        WHY:
          Some satellite images are processed to fit within a narrow value range
          (e.g., haze-affected images may all be in [100, 180]/255).
          Feature extraction based on texture statistics needs contrast to work.
          A factor of 1.4× reliably improves feature quality without
          introducing artifacts.

        CONTRAST ENHANCEMENT ALGORITHM:
          Pillow ImageEnhance.Contrast uses mean-preserving linear stretch:
            new_px = factor × (old_px - mean) + mean
          Factor > 1 increases contrast; factor = 1 is identity.
        """
        enhancer = ImageEnhance.Contrast(img)
        return enhancer.enhance(1.4)

    def _equalize_histogram(self, img: Image.Image) -> Image.Image:
        """
        Apply histogram equalization per channel.

        WHY:
          Many satellite images have narrow histogram ranges (clouds, haze, terrain).
          Histogram equalization spreads the distribution, making texture features
          more discriminative.

        ALGORITHM:
          1. Compute histogram H[v] = count of pixels with value v
          2. Compute CDF(v) = Σ H[0..v] / total_pixels
          3. Map: new_value = round(CDF(v) × 255)

          This transforms any distribution into (approximately) uniform distribution,
          maximizing information content and contrast.
        """
        r, g, b = img.split()
        r = ImageOps.equalize(r)
        g = ImageOps.equalize(g)
        b = ImageOps.equalize(b)
        return Image.merge("RGB", (r, g, b))

    def _compute_stats(self, img: Image.Image) -> dict[str, float]:
        """
        Compute pixel statistics for the image.
        Used both for preprocessing decisions and for metadata inference.
        """
        arr = np.array(img, dtype=np.float32) / 255.0  # shape (H, W, 3)

        r = arr[:, :, 0]
        g = arr[:, :, 1]
        b = arr[:, :, 2]
        gray = 0.299 * r + 0.587 * g + 0.114 * b  # ITU-R BT.601 luminance

        dynamic_range = int((arr.max() - arr.min()) * 255)

        return {
            "mean_r":         float(np.mean(r)),
            "mean_g":         float(np.mean(g)),
            "mean_b":         float(np.mean(b)),
            "std_r":          float(np.std(r)),
            "std_g":          float(np.std(g)),
            "std_b":          float(np.std(b)),
            "mean_brightness": float(np.mean(gray)),
            "std_gray":       float(np.std(gray)),
            "dynamic_range":  dynamic_range,
        }
