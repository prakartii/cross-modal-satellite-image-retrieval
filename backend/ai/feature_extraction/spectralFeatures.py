"""
AKSHA Earth Intelligence Platform — Spectral Feature Extractor
==============================================================

PURPOSE:
  Compute spectral (color) statistics from RGB satellite imagery.
  Spectral features capture the reflectance properties of the Earth's
  surface — how much light of each wavelength is reflected.

WHY IT EXISTS:
  Different materials have characteristic spectral signatures:
    • Vegetation: high green reflectance, absorbs red (NDVI effect)
    • Water:      high blue absorption, low overall reflectance
    • Urban:      high and uniform reflectance across bands
    • Bare soil:  warm tones (higher red, lower blue)
    • Snow/cloud: very high reflectance across all bands

  Spectral features are complementary to texture features:
    • Texture tells us HOW the surface is arranged (smooth, rough, structured)
    • Spectral tells us WHAT the surface is made of (water, vegetation, soil)

AI CONCEPT DEMONSTRATED:
  Spectral indices — fundamental tools in remote sensing:
    • NDVI (Normalized Difference Vegetation Index) = (NIR-Red)/(NIR+Red)
    • NDWI (Normalized Difference Water Index)     = (Green-NIR)/(Green+NIR)
  Without true NIR band (in RGB images), we approximate:
    • Vegetation index: (Green-Red)/(Green+Red+ε)  [approximation]
    • Water index:      (Blue-Red)/(Blue+Red+ε)    [approximation]
  These approximations work because the physical basis still holds partially
  in the visible spectrum.

PRODUCTION REPLACEMENT:
  True NDVI from Sentinel-2 Band 8 (NIR) and Band 4 (Red).
  True NDWI from Sentinel-2 Band 3 (Green) and Band 8 (NIR).
  Spectral unmixing for subpixel land cover estimation.

INPUTS:
  rgb_array: numpy array (H, W, 3), float32, values [0, 1]

OUTPUTS:
  dict with 20 named spectral features

PIPELINE POSITION:
  Feature Extraction Stage — called by featureExtractor.py
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np


class SpectralFeatureExtractor:
    """
    Extracts 20 spectral statistics from an RGB image array.

    Statistics are computed per-channel plus as cross-channel ratios
    and derived indices (vegetation, water, brightness, saturation).
    """

    def extract(self, rgb: np.ndarray) -> dict[str, float]:
        """
        Compute all spectral features from a normalized RGB array.

        Args:
          rgb: float32 ndarray (H, W, 3), values in [0.0, 1.0]
               Channel order: R=0, G=1, B=2

        Returns:
          dict mapping feature names to float values in [0, 1]
        """
        r = rgb[:, :, 0].astype(np.float64)
        g = rgb[:, :, 1].astype(np.float64)
        b = rgb[:, :, 2].astype(np.float64)

        r_stats = self._channel_stats(r, "r")
        g_stats = self._channel_stats(g, "g")
        b_stats = self._channel_stats(b, "b")

        derived = self._derived_indices(r, g, b)
        spatial = self._spatial_color_stats(rgb)

        return {**r_stats, **g_stats, **b_stats, **derived, **spatial}

    def _channel_stats(self, ch: np.ndarray, name: str) -> dict[str, float]:
        """
        Compute per-channel statistics for one color band.

        Statistics capture both the central tendency (mean) and spread (std)
        of the channel, plus the relative dominance of this channel vs others.

        The entropy of each channel captures how many distinct intensity levels
        are used — flat imagery (e.g., cloud) has low entropy; complex imagery
        (e.g., urban) has high entropy.
        """
        mean = float(np.mean(ch))
        std  = float(np.std(ch))

        # Entropy from histogram
        hist, _ = np.histogram(ch, bins=64, range=(0.0, 1.0))
        prob = hist / (hist.sum() + 1e-10)
        nz = prob[prob > 0]
        entropy = float(-np.sum(nz * np.log2(nz))) / 6.0  # Normalize by log2(64)

        return {
            f"mean_{name}": float(np.clip(mean, 0.0, 1.0)),
            f"std_{name}":  float(np.clip(std,  0.0, 1.0)),
            f"entropy_{name}": float(np.clip(entropy, 0.0, 1.0)),
        }

    def _derived_indices(
        self,
        r: np.ndarray,
        g: np.ndarray,
        b: np.ndarray,
    ) -> dict[str, float]:
        """
        Compute derived spectral indices from the three color channels.

        These indices are physically motivated by remote sensing theory:

        vegetation_index (pseudo-NDVI):
          (G - R) / (G + R + ε)
          Positive → green vegetation dominant (forests, crops)
          Near zero → neutral surfaces (bare soil, urban at mid-green)
          Negative → red-dominant surfaces (exposed soil, urban tile)

        water_index (pseudo-NDWI):
          (B - R) / (B + R + ε)
          Positive → blue-dominant (water bodies, ocean, shallow coast)
          Negative → red-dominant (dry land, desert)

        brightness:
          (R + G + B) / 3
          High → highly reflective (cloud, snow, beach, white urban)
          Low  → absorptive surfaces (dense forest, water, shadow)

        saturation:
          Std across channels / (mean + ε)
          High → vivid colors (tropical vegetation, urban diversity)
          Low  → gray-like images (SAR pseudo-RGB, cloud, fog)

        warm_ratio:
          R / (R + G + B + ε)
          High → warm tones (desert, bare soil, urban tile)
          Low  → cool tones (water, vegetation, snow)
        """
        eps = 1e-8

        mean_r = float(np.mean(r))
        mean_g = float(np.mean(g))
        mean_b = float(np.mean(b))
        total  = mean_r + mean_g + mean_b + eps

        vegetation = (mean_g - mean_r) / (mean_g + mean_r + eps)
        water      = (mean_b - mean_r) / (mean_b + mean_r + eps)
        brightness = (mean_r + mean_g + mean_b) / 3.0

        channel_vals = np.array([mean_r, mean_g, mean_b])
        saturation = float(np.std(channel_vals)) / (float(np.mean(channel_vals)) + eps)

        warm_ratio = mean_r / total
        cool_ratio = (mean_b + mean_g) / (2.0 * total + eps)

        # Normalize indices from [-1,1] to [0,1]
        veg_norm  = float(np.clip((vegetation + 1.0) / 2.0, 0.0, 1.0))
        water_norm = float(np.clip((water + 1.0) / 2.0, 0.0, 1.0))

        return {
            # vegetation_index: approximation of NDVI using G and R channels
            # 0 = no vegetation (red/neutral), 1 = maximum vegetation (green)
            "vegetation_index": veg_norm,

            # water_index: approximation of NDWI using B and R channels
            # 0 = dry land (red dominant), 1 = water body (blue dominant)
            "water_index": water_norm,

            # brightness: overall reflectance level
            "brightness": float(np.clip(brightness, 0.0, 1.0)),

            # saturation: color diversity across channels
            "saturation": float(np.clip(saturation, 0.0, 1.0)),

            # warm_ratio: red channel fraction (high = warm/dry)
            "warm_ratio": float(np.clip(warm_ratio, 0.0, 1.0)),

            # cool_ratio: blue+green fraction (high = cool/wet/vegetated)
            "cool_ratio": float(np.clip(cool_ratio, 0.0, 1.0)),
        }

    def _spatial_color_stats(self, rgb: np.ndarray) -> dict[str, float]:
        """
        Compute spatial distribution of brightness across image quadrants.

        Divides the image into 4 quadrants (TL, TR, BL, BR) and computes
        the mean brightness of each. This captures spatial gradients:
          • Top-bright, bottom-dark → sun glint over water
          • Left-dark, right-bright → cloud shadow patterns
          • Uniform across quadrants → homogeneous surface
        """
        h, w = rgb.shape[:2]
        mh, mw = h // 2, w // 2

        brightness = rgb.mean(axis=2)

        tl = float(np.mean(brightness[:mh, :mw]))
        tr = float(np.mean(brightness[:mh, mw:]))
        bl = float(np.mean(brightness[mh:, :mw]))
        br = float(np.mean(brightness[mh:, mw:]))

        return {
            "quad_tl": float(np.clip(tl, 0.0, 1.0)),
            "quad_tr": float(np.clip(tr, 0.0, 1.0)),
            "quad_bl": float(np.clip(bl, 0.0, 1.0)),
            "quad_br": float(np.clip(br, 0.0, 1.0)),
            # Spatial variance: are quadrants uniform or varied?
            "spatial_variance": float(np.clip(np.std([tl, tr, bl, br]), 0.0, 1.0)),
        }
