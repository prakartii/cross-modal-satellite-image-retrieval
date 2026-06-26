"""
backend/services/preprocessing.py

PIPELINE STAGE: 2 — Resize & Normalize
INPUT:  PIL.Image object (arbitrary size, any mode)
OUTPUT: numpy float32 array of shape [512, 512, 3] with values in [0.0, 1.0]

PURPOSE:
  Standardizes the input image into a fixed-size float array that all
  downstream stages can process deterministically. Two preprocessing
  sub-stages run in sequence:

    A) Resize to 512 × 512 pixels
    B) Normalize pixel values from [0, 255] integers to [0.0, 1.0] floats

WHY 512 × 512:
  All archive embeddings are computed from 512×512 images using the same
  feature extraction logic. The query image must be resized to the same
  spatial resolution so that features like edge density and texture measure
  the same spatial scale. A 100×100 image and a 5000×5000 image of the same
  scene type will produce very similar feature vectors after being resized
  to 512×512 — this is the key invariant that makes retrieval work.

WHY NORMALIZE TO [0, 1]:
  PIL images store pixel values as uint8 integers in [0, 255]. For numpy-based
  math (means, standard deviations, NDVI, NDWI), having values in [0, 1] is
  important because:
    1. All computed features will also be in [0, 1] without extra scaling steps.
    2. Division and subtraction operations don't overflow uint8 boundaries.
    3. Neural network conventions use [0, 1] — future model upgrades won't need
       different normalization.

WHY LANCZOS RESAMPLING:
  When downsizing a large satellite image (e.g., 4000×4000 → 512×512), simple
  nearest-neighbor or bilinear resampling can alias high-frequency patterns
  (e.g., fine urban road grids become noise). Lanczos uses a sinc-based kernel
  that properly anti-aliases before downsampling, preserving the overall
  spectral character of the scene (texture, color distribution) rather than
  accidentally emphasizing or destroying fine patterns.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from PIL import Image


# Target spatial resolution for all pipeline stages.
# All archive embeddings are computed at this resolution.
TARGET_SIZE: tuple[int, int] = (512, 512)


def resize_image(image: Image.Image) -> Image.Image:
    """
    Resize a PIL Image to TARGET_SIZE (512 × 512) in RGB mode.

    STEPS:
      1. Convert to RGB (3-channel) if not already.
         - RGBA, CMYK, palette modes → RGB via PIL's built-in conversion.
         - Grayscale (L mode) → RGB by duplicating the single channel three times.
           This is valid because grayscale satellite images (e.g., panchromatic)
           will have equal R=G=B values, making the color-based features neutral.
      2. Resize to 512×512 using Lanczos resampling.

    WHY CONVERT TO RGB FIRST:
      EXIF data, transparency (RGBA), or palette color spaces would cause
      numpy array shape mismatches in later stages. Forcing RGB ensures the
      array is always [H, W, 3].

    Args:
      image: PIL.Image object of any mode and size.

    Returns:
      PIL.Image in RGB mode, exactly 512 × 512 pixels.
    """
    # Step 1: Convert to RGB
    # PIL's convert() handles all color space conversions internally.
    if image.mode != "RGB":
        image = image.convert("RGB")

    # Step 2: Resize to 512×512 with Lanczos (high-quality anti-aliased) resampling.
    # LANCZOS is the best general-purpose filter for downsampling:
    #   - Minimizes aliasing artifacts (false high-frequency patterns)
    #   - Preserves overall luminance and color distribution
    #   - More expensive than BILINEAR/NEAREST but still < 5ms for 512×512
    resized = image.resize(TARGET_SIZE, Image.Resampling.LANCZOS)

    return resized


def normalize_pixels(image: Image.Image) -> np.ndarray:
    """
    Convert a PIL Image to a float32 numpy array with values in [0.0, 1.0].

    ALGORITHM:
      1. Convert PIL Image → numpy uint8 array of shape [H, W, 3].
         Values are integers in [0, 255] per channel.
      2. Cast to float32 (32-bit float, sufficient precision for all features).
      3. Divide by 255.0 to map [0, 255] → [0.0, 1.0].

    WHY FLOAT32 NOT FLOAT64:
      Float32 (single precision) gives 7 significant decimal digits, which is
      more than enough for features like mean_r = 0.384721. Using float64
      (double precision) would double memory usage (512×512×3×8 bytes = 6 MB
      vs 3 MB) with no practical benefit for image statistics.

    WHY DIVIDE BY 255:
      uint8 max is 255. After dividing, a pure-white pixel (255, 255, 255) → (1.0, 1.0, 1.0)
      and a pure-black pixel (0, 0, 0) → (0.0, 0.0, 0.0). All intermediate
      values map linearly between these extremes.

    Args:
      image: PIL.Image in RGB mode (output of resize_image()).

    Returns:
      numpy float32 array of shape [512, 512, 3] with values in [0.0, 1.0].
    """
    # np.array() converts PIL Image → uint8 array shaped [H, W, 3]
    arr = np.array(image, dtype=np.uint8)

    # astype(np.float32) creates a new array without modifying the original
    # Dividing by 255.0 normalizes each channel independently from [0,255] to [0,1]
    normalized = arr.astype(np.float32) / 255.0

    return normalized


def preprocess(image: Image.Image) -> dict[str, Any]:
    """
    Run the full preprocessing pipeline: resize → normalize.

    This is the single entry point called by the main pipeline.
    It combines resize_image() and normalize_pixels() into one call and
    returns both the processed array and diagnostic statistics.

    STATISTICS RETURNED:
      These statistics describe the RAW (un-resized) input image and are used
      only for display purposes in the API response. All feature extraction
      runs on the normalized 512×512 array, not the raw image.

    Args:
      image: PIL.Image from image_loader.load_image().

    Returns:
      Dict with:
        "array"           → numpy float32 [512, 512, 3] normalized pixel array
        "original_width"  → original image width before resize
        "original_height" → original image height before resize
        "mean_brightness" → mean pixel brightness of the resized, normalized image
        "channel_means"   → [mean_r, mean_g, mean_b] of the normalized image
    """
    original_width  = image.width
    original_height = image.height

    # Stage A: Resize to 512×512 RGB
    resized = resize_image(image)

    # Stage B: Convert pixel values to float in [0, 1]
    array = normalize_pixels(resized)

    # Compute quick brightness statistics for the API response
    # axis=(0,1) collapses H and W dimensions, giving one mean per channel
    channel_means   = array.mean(axis=(0, 1)).tolist()
    mean_brightness = float(array.mean())

    return {
        "array":           array,
        "original_width":  original_width,
        "original_height": original_height,
        "mean_brightness": mean_brightness,
        "channel_means":   channel_means,  # [mean_r, mean_g, mean_b]
    }
