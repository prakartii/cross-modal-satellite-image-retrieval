"""
backend/ai/embeddings/embedding_generator.py

PURPOSE:
  Stage 4 of the AKSHA AI pipeline.
  Converts the 32-dimensional feature vector into a unit embedding vector
  suitable for cosine similarity search.

MATHEMATICAL BACKGROUND — EMBEDDINGS:
  An embedding is a mapping from a high-dimensional space to a lower-dimensional
  dense vector space where semantically similar items are geometrically close.

  In deep learning, embeddings are learned by neural networks (e.g., ResNet-50
  trained on satellite imagery with contrastive loss). In our system, we derive
  the embedding directly from hand-crafted features.

  The key operation: L2 NORMALIZATION
    embedding = (weighted_features) / ||weighted_features||₂

  Where ||v||₂ = sqrt(Σ vᵢ²) is the Euclidean norm (L2 norm).

  After normalization, all embeddings lie on a unit hypersphere.
  On a unit hypersphere, the dot product between two vectors equals cosine similarity:
    cos(θ) = a·b / (|a| × |b|) = a·b  (since |a| = |b| = 1)

  WHY COSINE SIMILARITY:
    Cosine similarity measures the ANGLE between vectors, not their magnitude.
    This makes it scale-invariant: a bright image and a dark image of the same scene
    (flood vs flood at different times of day) will have high similarity because
    their spectral RATIOS are the same, even if raw values differ.

  WHY WEIGHTED FEATURES:
    Some features are more discriminative than others.
    vegetation_index and water_index alone can distinguish most scene types.
    We multiply these by higher weights before normalization so they contribute
    more to the embedding direction.

    Without weighting: all 32 features contribute equally, and subtle texture
    features might drown out the physically meaningful spectral indices.

    With weighting: the embedding "points toward" the scene's dominant physical property.
    → flood image → large water_index × 1.5 → embedding points toward "water" direction
    → archive flood entries → same direction → high dot product → high cosine similarity

DETERMINISM GUARANTEE:
  The same feature vector ALWAYS produces the same embedding.
  There is no randomness in this function.
  This is critical for reproducibility and for building the archive deterministically.

INPUT:  feature_vector: list[float] — 32-dim, values in [0, 1]
OUTPUT: (embedding: list[float], stats: dict) — 32-dim unit vector

PRODUCTION UPGRADE:
  Replace this function with a fine-tuned encoder:
    - Pre-trained on Sentinel-2 + RISAT-2B imagery
    - Using SimCLR or BYOL self-supervised contrastive learning
    - Output dimension: 128 or 256 (richer representation)
    - Stored in a FAISS IVF-PQ index for billion-scale search
"""

from __future__ import annotations

from typing import Any

import numpy as np


# ── Feature weights ────────────────────────────────────────────────────────
# Indexed by position, matching FEATURE_NAMES in feature_extractor.py
# Weights > 1.0 amplify that dimension's contribution to the embedding direction.
# These weights encode our domain knowledge about which features matter most.
#
# How to read:
#   1.5 × water_index → flood images will cluster strongly together
#   1.5 × vegetation_index → forest images will cluster strongly together
#   1.3 × edge_density → urban images separate from natural ones
#   1.2 × entropy, brightness → help separate cloud/snow from everything else
#   ≤1.0 for most texture dims → they help fine-grained similarity, not coarse matching
FEATURE_WEIGHTS = np.array([
    0.8,  # 0:  contrast
    1.2,  # 1:  entropy          — information richness separates complex from simple scenes
    0.7,  # 2:  homogeneity
    0.6,  # 3:  energy
    0.7,  # 4:  correlation
    1.3,  # 5:  edge_density     — urban vs. natural surface discriminator
    0.9,  # 6:  mean_gradient
    0.6,  # 7:  coarseness
    0.5,  # 8:  directionality
    0.7,  # 9:  local_std
    0.5,  # 10: h_gradient
    0.5,  # 11: v_gradient
    0.8,  # 12: mean_r
    0.8,  # 13: mean_g
    0.9,  # 14: mean_b           — blue important for water detection
    0.6,  # 15: std_r
    0.6,  # 16: std_g
    0.6,  # 17: std_b
    0.7,  # 18: entropy_r
    0.7,  # 19: entropy_g
    1.5,  # 20: vegetation_index — MOST IMPORTANT: primary land cover discriminator
    1.5,  # 21: water_index      — MOST IMPORTANT: flood / water body discriminator
    1.2,  # 22: brightness       — cloud / snow / night discriminator
    0.9,  # 23: saturation
    0.8,  # 24: warm_ratio
    0.8,  # 25: cool_ratio
    0.5,  # 26: quad_tl
    0.5,  # 27: quad_tr
    0.5,  # 28: quad_bl
    0.5,  # 29: quad_br
    0.6,  # 30: spatial_var
    1.1,  # 31: complexity       — separates heterogeneous from homogeneous scenes
], dtype=np.float32)


class EmbeddingGenerator:
    """
    Converts a feature vector into a unit embedding via weighted L2 normalization.

    The embedding is deterministic: same features → same embedding.
    Similar scenes (same scene type) → nearby embeddings in L2 space.
    """

    def generate(self, feature_vector: list[float]) -> tuple[list[float], dict[str, Any]]:
        """
        Generate a unit embedding from a 32-dimensional feature vector.

        Algorithm:
          1. Load feature vector as float32 NumPy array
          2. Multiply element-wise by FEATURE_WEIGHTS
          3. Compute L2 norm of the weighted vector
          4. Divide by L2 norm → unit vector

        Args:
            feature_vector: 32 float values in [0, 1] from feature extraction

        Returns:
            (embedding, stats) where:
              embedding: 32-dim unit float list (L2 norm = 1.0)
              stats: diagnostic information about the embedding

        Raises:
            ValueError: If feature vector has wrong dimension or is all zeros
        """
        vec = np.array(feature_vector, dtype=np.float32)

        if len(vec) != 32:
            raise ValueError(f"Feature vector must be 32-dim, got {len(vec)}")

        # Apply per-dimension weights
        # This "rotates" the embedding to emphasize discriminative features
        weighted = vec * FEATURE_WEIGHTS

        # L2 normalize to get unit vector
        # L2 norm = sqrt(w₀² + w₁² + ... + w₃₁²)
        norm = float(np.linalg.norm(weighted))
        if norm < 1e-9:
            raise ValueError("Feature vector is all zeros — cannot generate embedding")

        embedding = weighted / norm

        # Verify the result is a unit vector (sanity check)
        actual_norm = float(np.linalg.norm(embedding))
        assert abs(actual_norm - 1.0) < 1e-5, f"Normalization failed: norm = {actual_norm}"

        # Diagnostic stats (useful for debugging similarity scores)
        top3_idx = np.argsort(np.abs(embedding))[-3:][::-1].tolist()

        stats = {
            "embedding_dim":          32,
            "pre_norm_magnitude":     round(norm, 4),
            "post_norm_magnitude":    round(actual_norm, 4),
            "top_3_dimensions":       top3_idx,
            "mean_abs_embedding":     round(float(np.mean(np.abs(embedding))), 4),
            "max_abs_embedding":      round(float(np.max(np.abs(embedding))), 4),
        }

        return embedding.tolist(), stats
