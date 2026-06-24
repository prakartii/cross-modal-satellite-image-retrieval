"""
AKSHA Earth Intelligence Platform — Embedding Generator
=======================================================

PURPOSE:
  Convert the 32-dimensional feature vector from FeatureExtractor into a
  normalized unit embedding suitable for cosine similarity search.

WHY IT EXISTS:
  Raw feature vectors are not ideal for similarity search because:
    • Features have different scales (contrast ~0-1, entropy ~0-8)
    • Some features are more discriminative than others
    • Cosine similarity requires unit-norm vectors

  This module normalizes, optionally weights, and L2-normalizes the
  feature vector to produce a compact unit embedding.

AI CONCEPT DEMONSTRATED:
  Embedding generation — the core of modern neural retrieval systems.
  In production, embeddings come from:
    • Siamese networks trained on matching pairs (same location, different time)
    • Contrastive learning (CLIP, SatCLIP) on satellite image-text pairs
    • Self-supervised models (MAE, DINO) pretrained on large image archives
  The key insight: good embeddings place semantically similar images close
  together in embedding space. Cosine similarity in this space becomes a
  measure of semantic similarity, not just pixel similarity.

PRODUCTION REPLACEMENT:
  Replace this module with inference from a pretrained satellite embedding
  model (e.g., SatMAE, Scale-MAE, or a fine-tuned CLIP model). The output
  interface (unit vector of fixed dimension) remains identical.

INPUTS:
  feature_vector: numpy float32 array of shape (32,) from FeatureExtractor

OUTPUTS:
  embedding: numpy float32 array of shape (32,), L2-normalized (unit norm)
  embedding_stats: dict with norm, dominant_dims, magnitude info

PIPELINE POSITION:
  Feature Extraction → [Embedding Generation ← HERE] → Semantic Search
"""

from __future__ import annotations

from typing import Any

import numpy as np


# Per-dimension weights that emphasize more discriminative features.
# These are manually tuned based on domain knowledge:
#   • Water index (dim 21) is very discriminative for flood detection
#   • Vegetation index (dim 20) is highly discriminative for land cover
#   • Edge density (dim 5) distinguishes urban from natural surfaces
#   • Brightness (dim 22) distinguishes cloud/snow from dark surfaces
FEATURE_WEIGHTS = np.array([
    # Texture (dims 0-11)
    1.0,  # contrast
    1.2,  # entropy      (higher weight — complex scenes are distinctive)
    0.8,  # homogeneity
    0.8,  # energy
    0.9,  # correlation
    1.3,  # edge_density (higher weight — structural feature)
    1.0,  # mean_gradient
    0.7,  # coarseness
    0.8,  # directionality
    0.9,  # local_std
    0.6,  # h_gradient
    0.6,  # v_gradient
    # Per-channel (dims 12-19)
    0.9,  # mean_r
    1.1,  # mean_g       (slightly higher — NDVI relates to green)
    1.0,  # mean_b
    0.8,  # std_r
    0.8,  # std_g
    0.8,  # std_b
    0.7,  # entropy_r
    0.7,  # entropy_g
    # Derived indices (dims 20-25)
    1.5,  # vegetation_index (most discriminative physical feature)
    1.5,  # water_index      (most discriminative physical feature)
    1.2,  # brightness
    1.1,  # saturation
    1.0,  # warm_ratio
    1.0,  # cool_ratio
    # Spatial (dims 26-31)
    0.6,  # quad_tl
    0.6,  # quad_tr
    0.6,  # quad_bl
    0.6,  # quad_br
    0.9,  # spatial_variance
    1.1,  # scene_complexity
], dtype=np.float32)


class EmbeddingGenerator:
    """
    Generates a normalized unit embedding from the feature vector.

    The embedding is suitable for cosine similarity search:
      cosine_similarity(a, b) = dot(a, b)  (since |a| = |b| = 1)

    This reduces similarity computation to a single dot product, which
    is highly optimized (BLAS routines, SIMD instructions, GPU batching).
    """

    def generate(self, feature_vector: np.ndarray) -> tuple[np.ndarray, dict[str, Any]]:
        """
        Apply weighting and L2 normalization to the feature vector.

        Args:
          feature_vector: float32 array of shape (32,) from FeatureExtractor

        Returns:
          Tuple of:
            embedding: L2-normalized float32 array of shape (32,)
            stats:     dict with diagnostic information about the embedding
        """
        # Step 1: Apply feature weights (emphasize discriminative dimensions)
        w = FEATURE_WEIGHTS[:len(feature_vector)]
        weighted = feature_vector * w

        # Step 2: L2 normalization → unit vector
        norm = float(np.linalg.norm(weighted))
        if norm < 1e-10:
            # Degenerate case: all-zero image (black frame)
            embedding = np.ones(len(feature_vector), dtype=np.float32) / np.sqrt(len(feature_vector))
        else:
            embedding = (weighted / norm).astype(np.float32)

        # Step 3: Compute diagnostic stats
        top3_dims = np.argsort(np.abs(embedding))[-3:][::-1].tolist()
        stats: dict[str, Any] = {
            "embedding_dim":   len(embedding),
            "pre_norm_magnitude": round(norm, 4),
            "post_norm_magnitude": round(float(np.linalg.norm(embedding)), 6),
            "top_3_dimensions": top3_dims,
            "mean_abs_value":  round(float(np.mean(np.abs(embedding))), 4),
            "sparsity":        round(float(np.mean(np.abs(embedding) < 0.01)), 3),
        }

        return embedding, stats

    def normalize(self, vector: np.ndarray) -> np.ndarray:
        """
        L2-normalize a vector to unit norm.

        Args:
          vector: float array of any shape

        Returns:
          Unit-norm vector of the same shape
        """
        norm = np.linalg.norm(vector)
        if norm < 1e-10:
            return vector.copy()
        return (vector / norm).astype(np.float32)
