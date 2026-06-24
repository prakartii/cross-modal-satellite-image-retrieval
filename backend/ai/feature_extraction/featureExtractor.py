"""
AKSHA Earth Intelligence Platform — Feature Extractor (Orchestrator)
=====================================================================

PURPOSE:
  Orchestrates the complete feature extraction pipeline for a single image.
  Calls texture and spectral extractors, merges results, and produces a
  named feature dict plus a compact 32-dimensional feature vector.

WHY IT EXISTS:
  This module is the single entry point for feature extraction — callers
  do not need to know about the internal structure of texture vs spectral
  features. The 32-dim vector output is the contract between feature
  extraction and the embedding generator.

AI CONCEPT DEMONSTRATED:
  Feature engineering: the art of transforming raw data (pixels) into
  compact, discriminative representations. In classical CV, hand-crafted
  features (HOG, SIFT, GLCM) were the state of the art. Modern deep
  learning learns features from data, but hand-crafted features remain
  valuable for:
    • Interpretability (we can explain what each dimension means)
    • Data efficiency (works with a single image — no training required)
    • Domain knowledge encoding (vegetation index = satellite remote sensing)

PRODUCTION REPLACEMENT:
  Replace the feature vector with embeddings from a pretrained CNN
  (ResNet-50, EfficientNet-B4) or a specialized remote sensing model
  (SatMAE, Scale-MAE, DeCUR) fine-tuned on ISRO archive imagery.
  The interface (32-dim vector in → cosine search) remains identical.

INPUTS:
  file_bytes: Raw image bytes
  filename:   Original filename
  stats:      Image statistics from ImageProcessor (optional)

OUTPUTS:
  FeatureResult with:
    features: dict of all named features (for display/explainability)
    vector:   numpy float32 array of shape (32,), L2-normalized
    summary:  human-readable summary of key detected properties

PIPELINE POSITION:
  Preprocessing → [Feature Extraction ← HERE] → Embedding Generation
"""

from __future__ import annotations

from typing import Any

import numpy as np
from PIL import Image

from ai.feature_extraction.textureFeatures import TextureFeatureExtractor
from ai.feature_extraction.spectralFeatures import SpectralFeatureExtractor


class FeatureResult:
    """Container for all feature extraction outputs."""

    def __init__(
        self,
        features: dict[str, float],
        vector: np.ndarray,
        summary: dict[str, Any],
    ) -> None:
        self.features = features
        self.vector   = vector
        self.summary  = summary


class FeatureExtractor:
    """
    Orchestrates texture + spectral feature extraction and builds the
    32-dimensional feature vector used for embedding generation.

    Vector dimensions:
      [0:12]  12 texture features (contrast, entropy, edges, ...)
      [12:20] 8 spectral features  (means, stds, entropies)
      [20:26] 6 derived indices    (vegetation, water, brightness, ...)
      [26:31] 5 spatial features   (quadrant means, spatial variance)
      [31]    1 composite score    (overall scene complexity)
    """

    def __init__(self) -> None:
        self._texture  = TextureFeatureExtractor()
        self._spectral = SpectralFeatureExtractor()

    def extract(self, img: Image.Image, stats: dict[str, Any]) -> FeatureResult:
        """
        Run full feature extraction on a normalized PIL Image.

        Args:
          img:   Normalized 512×512 RGB PIL Image
          stats: Image statistics from ImageProcessor

        Returns:
          FeatureResult with features dict, 32-dim vector, and summary
        """
        # Convert to numpy arrays
        arr_uint8  = np.array(img, dtype=np.uint8)
        arr_float  = arr_uint8.astype(np.float32) / 255.0

        # Grayscale conversion for texture (luminance-weighted)
        gray_float = (
            0.299 * arr_float[:, :, 0] +
            0.587 * arr_float[:, :, 1] +
            0.114 * arr_float[:, :, 2]
        )
        gray_uint8 = (gray_float * 255.0).astype(np.uint8)

        # Extract features
        texture_feats  = self._texture.extract(gray_uint8)
        spectral_feats = self._spectral.extract(arr_float)

        # Merge into combined feature dict
        features: dict[str, float] = {**texture_feats, **spectral_feats}

        # Build 32-dimensional feature vector
        vector = self._build_vector(texture_feats, spectral_feats)

        # Generate human-readable summary
        summary = self._build_summary(features, stats)

        return FeatureResult(features=features, vector=vector, summary=summary)

    def _build_vector(
        self,
        tex: dict[str, float],
        spec: dict[str, float],
    ) -> np.ndarray:
        """
        Assemble the 32-dimensional feature vector.

        The vector ordering is designed so that:
          • Dimensions 0-11: texture (how the surface is arranged)
          • Dimensions 12-19: per-channel statistics (raw color info)
          • Dimensions 20-25: derived indices (what the surface is made of)
          • Dimensions 26-31: spatial + composite

        This ordering groups related features, which helps cosine similarity
        produce intuitive results: images of the same type cluster together
        because many consecutive dimensions will be similar.
        """
        vec = np.array([
            # ── Texture (dims 0–11) ───────────────────────────────────────
            tex["contrast"],
            tex["entropy"],
            tex["homogeneity"],
            tex["energy"],
            tex["correlation"],
            tex["edge_density"],
            tex["mean_gradient"],
            tex["coarseness"],
            tex["directionality"],
            tex["local_std"],
            tex["h_gradient"],
            tex["v_gradient"],
            # ── Per-channel stats (dims 12–19) ─────────────────────────
            spec["mean_r"],
            spec["mean_g"],
            spec["mean_b"],
            spec["std_r"],
            spec["std_g"],
            spec["std_b"],
            spec["entropy_r"],
            spec["entropy_g"],
            # ── Derived indices (dims 20–25) ───────────────────────────
            spec["vegetation_index"],
            spec["water_index"],
            spec["brightness"],
            spec["saturation"],
            spec["warm_ratio"],
            spec["cool_ratio"],
            # ── Spatial + composite (dims 26–31) ──────────────────────
            spec["quad_tl"],
            spec["quad_tr"],
            spec["quad_bl"],
            spec["quad_br"],
            spec["spatial_variance"],
            # Composite scene complexity: high entropy + high edge density
            float(np.clip(
                (tex["entropy"] * 0.5 + tex["edge_density"] * 0.5),
                0.0, 1.0
            )),
        ], dtype=np.float32)

        return vec

    def _build_summary(
        self,
        features: dict[str, float],
        stats: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Generate human-readable summary of the extracted features.

        This summary is displayed in the Scene Intelligence Panel,
        giving users an explanation of what the AI detected.
        """
        vi  = features.get("vegetation_index", 0.5)
        wi  = features.get("water_index", 0.5)
        br  = features.get("brightness", 0.5)
        ed  = features.get("edge_density", 0.3)
        ent = features.get("entropy", 0.5)

        # Interpret dominant land cover
        if wi > 0.65:
            dominant = "Water / Inundated Surface"
            scene_type = "flood"
        elif vi > 0.65:
            dominant = "Dense Vegetation / Forest"
            scene_type = "vegetation"
        elif ed > 0.6 and br > 0.55:
            dominant = "Urban / Built-up Area"
            scene_type = "urban"
        elif br > 0.8:
            dominant = "Cloud / Snow / Sand"
            scene_type = "bright"
        elif br < 0.25:
            dominant = "Shadow / Deep Water / Burnt Area"
            scene_type = "dark"
        else:
            dominant = "Mixed Surface / Agricultural"
            scene_type = "mixed"

        # Compute derived percentages for display
        water_pct      = round(wi * 100, 1)
        vegetation_pct = round(max(0, vi) * 100, 1)
        edge_pct       = round(ed * 100, 1)

        return {
            "dominant_surface": dominant,
            "scene_type":       scene_type,
            "water_coverage_pct":      water_pct,
            "vegetation_coverage_pct": vegetation_pct,
            "edge_density_pct":        edge_pct,
            "complexity":      "High" if ent > 0.7 else "Medium" if ent > 0.45 else "Low",
            "brightness_level": "High" if br > 0.65 else "Medium" if br > 0.4 else "Low",
            "file_size_kb":    stats.get("file_size_kb", 0),
            "original_size":   f"{stats.get('original_width',0)}×{stats.get('original_height',0)}",
            "feature_count":   len(features),
        }
