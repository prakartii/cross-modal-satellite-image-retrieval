"""
backend/utils/math_utils.py

PURPOSE:
  Mathematical helper functions for the AKSHA similarity search pipeline.
  Every retrieval score in this system is computed using these functions —
  there are no hardcoded scores, random assignments, or lookup tables.

ML CONCEPTS:

  L2 NORMALIZATION:
    Given a vector v = [v1, v2, ..., vn], its L2 (Euclidean) norm is:
      ||v||_2 = sqrt(v1^2 + v2^2 + ... + vn^2)
    The normalized (unit) vector is:
      v_hat = v / ||v||_2
    After normalization, ||v_hat||_2 = 1.

    Why normalize? It places every embedding on the surface of a hypersphere.
    On a hypersphere, the only meaningful difference between two vectors is
    their DIRECTION, not their length. This ensures a flood image with many
    strong features doesn't rank higher than one with moderate features just
    because it has a larger raw vector magnitude.

  COSINE SIMILARITY:
    For two vectors a and b, cosine similarity is:
      cos(theta) = (a · b) / (||a|| × ||b||)
    where theta is the angle between them.

    For unit vectors (||a|| = ||b|| = 1), this simplifies to:
      cos(theta) = a · b   (just the dot product)

    Result interpretation:
      1.0  → identical feature profiles (angle = 0°)
      0.5  → moderate similarity (angle = 60°)
      0.0  → orthogonal feature profiles (angle = 90°)

    Since all our features are non-negative (image statistics in [0,1]),
    all embeddings point into the positive orthant and cosine similarity
    is always in [0, 1].

  BATCH MATRIX MULTIPLY:
    Computing similarity against N archive entries one-by-one would require
    N separate dot products in a Python loop. Matrix multiplication does all
    N at once in native BLAS (Basic Linear Algebra Subprograms) code:

      similarities = archive_matrix @ query_vector

    Where:
      archive_matrix: shape [N, D]  (N entries, D-dimensional embeddings)
      query_vector:   shape [D]
      result:         shape [N]     (one similarity per archive entry)

    The @ operator maps to numpy's optimized BLAS gemv (General Matrix-Vector
    multiply) routine, which uses CPU SIMD instructions and cache-prefetching.
    For N=50, D=14 this is trivial, but the same code scales to N=2.48M.
"""

from __future__ import annotations

import numpy as np


def l2_normalize(vector: np.ndarray) -> np.ndarray:
    """
    Normalize a 1-D vector to unit length (L2 norm = 1).

    This is called on the query embedding AND each archive embedding so that
    cosine similarity degenerates to a simple dot product.

    ALGORITHM:
      1. Compute the Euclidean norm: ||v|| = sqrt(sum(v_i^2))
      2. Divide each element by the norm: v_hat[i] = v[i] / ||v||

    EDGE CASE:
      If the norm is near zero, the vector is essentially all zeros (e.g., a
      completely black image). We return the zero vector unchanged rather than
      producing NaN from 0/0.

    Args:
      vector: 1-D numpy array. May be any numeric dtype.

    Returns:
      Float64 unit-norm array of the same shape, or the zero vector unchanged.
    """
    v = vector.astype(np.float64)
    norm = np.linalg.norm(v)

    if norm < 1e-10:
        # Nearly-zero vector: cannot define a direction. Return as-is.
        return v

    return v / norm


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """
    Compute cosine similarity between two ALREADY L2-NORMALIZED vectors.

    PRECONDITION: Both a and b must be unit vectors (||a|| = ||b|| = 1).
    Call l2_normalize() on them first if needed.

    MATH:
      cos(theta) = a · b = sum(a_i * b_i for i in 0..D-1)

    The result is the cosine of the angle theta between the two embedding
    vectors. For image embeddings in the positive orthant (all features >= 0),
    this is always in [0, 1]:
      1.0 → identical scene types (e.g., both are dense urban areas)
      0.0 → completely opposite feature profiles

    Args:
      a: Unit-norm 1-D numpy array of shape [D].
      b: Unit-norm 1-D numpy array of shape [D].

    Returns:
      Scalar float in [0.0, 1.0].
    """
    # np.dot computes the inner product (sum of element-wise products)
    raw = float(np.dot(a, b))

    # Clip to [0, 1] — theoretically satisfied for non-negative unit vectors,
    # but floating-point arithmetic can produce tiny negative values near 0.
    return float(np.clip(raw, 0.0, 1.0))


def batch_cosine_similarity(query: np.ndarray, archive: np.ndarray) -> np.ndarray:
    """
    Compute cosine similarity between a query embedding and ALL archive entries.

    This is the core operation of the retrieval pipeline. It replaces a loop
    of N individual dot products with a single matrix-vector multiply, enabling
    efficient nearest-neighbor search.

    ALGORITHM:
      result[i] = archive[i] · query  for each i in 0..N-1

    In matrix notation:
      result = archive @ query

    where @ is numpy's matrix multiply operator.

    TIME COMPLEXITY:
      O(N × D) total multiplications and additions.
      For N=50 archive entries and D=14 features: 700 operations.
      Performed in a single BLAS call rather than N Python function calls.

    PRECONDITION:
      Both query and all rows of archive must be L2-normalized unit vectors.

    Args:
      query:   Unit-norm 1-D array of shape [D].
      archive: Matrix of unit-norm rows, shape [N, D].

    Returns:
      Similarity scores array of shape [N], each in [0.0, 1.0].
    """
    # archive @ query: each row i of archive is dot-producted with query
    scores = archive @ query

    # Clip to [0, 1] — floating-point safety
    return np.clip(scores.astype(np.float64), 0.0, 1.0)


def top_k_indices(scores: np.ndarray, k: int) -> np.ndarray:
    """
    Return the indices of the top-K highest scores in descending order.

    ALGORITHM:
      np.argsort returns the indices that would sort the array in ascending order.
      [::-1] reverses it to descending order (highest first).
      [:k] takes the first K entries.

    Alternative approaches:
      - np.argpartition(scores, -k)[-k:] is O(N) but unordered within top-K
      - Sorting the full array is O(N log N) but produces all ranks

    For our archive size (N <= 50), full sort is perfectly fine.

    Args:
      scores: 1-D array of similarity scores.
      k:      Number of top results to return.

    Returns:
      Array of K indices into `scores`, ordered highest-to-lowest.
    """
    # argsort returns indices of ascending order; [::-1] reverses to descending
    all_ranked = np.argsort(scores)[::-1]
    return all_ranked[:k]
