"""
backend/services/embedding_generator.py

PIPELINE STAGE: 4 — Embedding Generation
INPUT:  Dict of 14 named features from feature_extractor.py
OUTPUT: 14-dimensional unit vector (numpy float64 array, L2-norm = 1.0)

PURPOSE:
  Converts the raw 14-dimensional feature dict into a normalized "embedding"
  vector that represents the image as a single point on a 14-dimensional
  unit hypersphere. Two images with similar scene properties (e.g., both
  flooded plains) will have embeddings that point in similar directions,
  while images with different properties (flood vs. dense urban) will have
  embeddings that point in very different directions.

  This embedding is then compared against all 50 archive embeddings using
  cosine similarity to find the most similar historical scenes.

ML CONCEPTS:

  FEATURE WEIGHTING:
    Not all 14 features are equally discriminative. For example:
      - water_ratio is extremely distinctive: a flooded scene has water_ratio ≈ 0.75,
        while an urban scene has water_ratio ≈ 0.03. This 25× ratio means
        water_ratio carries much more information than, say, mean_r.
      - mean_r varies less across scene types — all natural scenes have
        moderate red reflectance.

    We multiply each feature by a weight before L2-normalizing.
    Higher weight → that feature contributes more to the embedding direction
    → that feature has more influence on which archive scenes are retrieved.

    Weight values were chosen based on empirical discrimination:
      water_ratio = 2.0      (most discriminative for flood detection)
      vegetation_ratio = 2.0 (most discriminative for vegetation)
      urban_density = 1.8    (strong for urban classification)
      mean_b = 1.5           (water reflects blue strongly)
      edge_density = 1.5     (important for structural complexity)
      entropy = 1.3          (scene complexity)
      mean_g = 1.3           (vegetation reflects green)
      contrast = 1.2         (texture variation)
      All others = 1.0       (standard contribution)

  L2 NORMALIZATION:
    After weighting, we compute the Euclidean length of the weighted vector
    and divide each component by this length. This maps every embedding onto
    the surface of a 14-dimensional unit sphere.

    Why normalize? Because:
      1. Cosine similarity between unit vectors is just a dot product (fast, simple).
      2. All archive embeddings are also unit-normalized, ensuring a fair comparison.
      3. Without normalization, scenes with many non-zero features would have
         longer raw vectors and would unfairly rank higher regardless of actual
         feature similarity.

  UNIT HYPERSPHERE:
    After normalization, every embedding vector has length exactly 1.0.
    The "direction" of the vector encodes the scene's feature profile.
    Cosine similarity between two unit vectors measures how similar their
    directions are — which is exactly what we want: similar scenes should
    point in similar directions in the 14-dimensional feature space.

DETERMINISM GUARANTEE:
  For the same input image, this function always returns exactly the same
  embedding. There is no randomness. The pipeline is fully deterministic
  because all computations are deterministic mathematical operations on
  pixel values (numpy operations on floats with no random seed needed).
"""

from __future__ import annotations

import numpy as np

from utils.math_utils import l2_normalize


# ── Feature ordering ──────────────────────────────────────────────────────────
# This list defines the exact order in which features are read from the
# feature dict and placed into the embedding vector.
# The SAME ordering is used in seed.py to compute archive embeddings.
# Changing this order would break all existing archive embeddings.
FEATURE_KEYS: list[str] = [
    "mean_r",           # [0]  Mean red channel value
    "mean_g",           # [1]  Mean green channel value
    "mean_b",           # [2]  Mean blue channel value
    "std_r",            # [3]  Standard deviation of red channel
    "std_g",            # [4]  Standard deviation of green channel
    "std_b",            # [5]  Standard deviation of blue channel
    "contrast",         # [6]  GLCM contrast approximation
    "entropy",          # [7]  Shannon entropy of pixel distribution
    "homogeneity",      # [8]  GLCM homogeneity approximation
    "energy",           # [9]  GLCM energy approximation
    "edge_density",     # [10] Fraction of Sobel-detected edge pixels
    "water_ratio",      # [11] Fraction of NDWI-positive pixels
    "vegetation_ratio", # [12] Fraction of NDVI-positive pixels
    "urban_density",    # [13] Fraction of urban-signature pixels
]

# ── Feature weights ───────────────────────────────────────────────────────────
# Parallel array to FEATURE_KEYS. FEATURE_WEIGHTS[i] is the weight for FEATURE_KEYS[i].
# These weights are applied by MULTIPLYING each feature value before L2-normalization.
#
# Higher weight = larger contribution to the embedding direction.
# This makes the embedding more sensitive to changes in that feature,
# which in turn makes cosine similarity more sensitive to that feature.
#
# The weights encode domain knowledge about feature discrimination:
FEATURE_WEIGHTS: np.ndarray = np.array([
    1.0,   # mean_r:           Moderate discriminator; warm vs cool tones
    1.3,   # mean_g:           Slightly higher; green channel key for vegetation
    1.5,   # mean_b:           Higher; blue key indicator for open water
    1.0,   # std_r:            Standard
    1.0,   # std_g:            Standard
    1.0,   # std_b:            Standard
    1.2,   # contrast:         Structural variation is mildly discriminative
    1.3,   # entropy:          Scene complexity is a meaningful discriminator
    1.0,   # homogeneity:      Standard
    1.0,   # energy:           Standard
    1.5,   # edge_density:     Structural complexity; key for urban detection
    2.0,   # water_ratio:      Highest; most discriminative feature for floods
    2.0,   # vegetation_ratio: Highest; most discriminative for forest/crops
    1.8,   # urban_density:    Very high; strong urban vs natural discriminator
], dtype=np.float64)

# Dimension of the embedding vector (equals len(FEATURE_KEYS))
EMBEDDING_DIM: int = len(FEATURE_KEYS)


def features_to_vector(features: dict[str, float]) -> np.ndarray:
    """
    Convert a feature dict into a raw (un-normalized) numpy array.

    This extracts feature values in the canonical FEATURE_KEYS order,
    replacing any missing key with 0.0.

    Args:
      features: Dict mapping feature name → float value in [0, 1].

    Returns:
      Float64 numpy array of shape [EMBEDDING_DIM].
    """
    # Build a 1-D array by reading features in the specified order
    return np.array(
        [features.get(key, 0.0) for key in FEATURE_KEYS],
        dtype=np.float64,
    )


def apply_weights(raw_vector: np.ndarray) -> np.ndarray:
    """
    Multiply each feature by its corresponding weight.

    EFFECT OF WEIGHTING:
      A feature with weight 2.0 contributes twice as much to the final
      unit vector direction as a feature with weight 1.0.

      Example (flood image):
        water_ratio = 0.80, weight = 2.0 → weighted = 1.60
        mean_r      = 0.33, weight = 1.0 → weighted = 0.33
        After normalization, water_ratio's component is ~5× larger than mean_r's,
        so cosine similarity is much more sensitive to water_ratio differences.

    Args:
      raw_vector: Un-weighted feature array of shape [EMBEDDING_DIM].

    Returns:
      Element-wise product of raw_vector and FEATURE_WEIGHTS.
      Shape: [EMBEDDING_DIM].
    """
    # numpy element-wise multiply: raw_vector[i] * FEATURE_WEIGHTS[i] for each i
    return raw_vector * FEATURE_WEIGHTS


def generate_embedding(features: dict[str, float]) -> np.ndarray:
    """
    Convert a feature dict into a 14-dimensional unit embedding vector.

    ALGORITHM:
      1. Extract feature values in canonical order → raw vector [14]
      2. Apply discriminative weights → weighted vector [14]
      3. L2-normalize → unit embedding [14] with ||embedding|| = 1.0

    GUARANTEE:
      The returned vector always has L2-norm exactly 1.0 (unit length),
      unless all features are zero (edge case for blank images).

    This embedding is the basis for ALL similarity comparisons in the pipeline.
    The archive was built using the same weight scheme and normalization,
    so cosine similarity between this embedding and archive embeddings measures
    true feature-space similarity.

    Args:
      features: Dict of 14 named features from feature_extractor.extract_all_features().

    Returns:
      Float64 numpy array of shape [14]. Unit vector on the 14-dim hypersphere.
    """
    # Step 1: Convert dict to ordered array
    raw = features_to_vector(features)

    # Step 2: Apply discriminative weights
    weighted = apply_weights(raw)

    # Step 3: L2-normalize to unit length
    embedding = l2_normalize(weighted)

    return embedding
