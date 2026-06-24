"""
AKSHA Earth Intelligence Platform — Similarity Computation
==========================================================

PURPOSE:
  Compute cosine similarity between a query embedding and all archive
  embeddings. This is the core retrieval operation of the AKSHA platform.

WHY IT EXISTS:
  Cosine similarity measures the angle between two vectors in embedding
  space. Because all embeddings are L2-normalized (unit norm), cosine
  similarity reduces to a dot product:

    cosine_similarity(a, b) = a · b / (|a| × |b|) = a · b

  This is both mathematically correct and computationally efficient.

AI CONCEPT DEMONSTRATED:
  Maximum Inner Product Search (MIPS) — the inner loop of every neural
  retrieval system. In production, this is accelerated using:
    • FAISS (Facebook AI Similarity Search) — GPU-accelerated exact search
    • ScaNN (Google) — optimized approximate nearest neighbor search
    • Annoy (Spotify) — approximate search using random projection trees
    • HNSW (Hierarchical Navigable Small World) — graph-based ANN

  For a 50-scene archive, exact search is faster than any ANN index.
  At 2.48M scenes (the real ISRO Bhuvan scale), FAISS or HNSW is necessary.

PRODUCTION REPLACEMENT:
  Use FAISS FlatIP (exact) or IVFFlat (approximate) index for production scale.
  The interface (query embedding + archive matrix → top-K results) is identical.

INPUTS:
  query:   float32 array (32,) — L2-normalized query embedding
  archive: float32 array (N, 32) — L2-normalized archive embeddings

OUTPUTS:
  similarities: float32 array (N,) — cosine similarity scores in [-1, 1]
  top_k_result: list of (index, score) tuples, sorted by descending score

PIPELINE POSITION:
  Embedding Generation → [Similarity Computation ← HERE] → Semantic Search
"""

from __future__ import annotations

import numpy as np


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """
    Compute cosine similarity between two unit-norm vectors.

    For unit vectors: cosine_similarity(a, b) = dot(a, b)
    Result is in [-1.0, 1.0]:
      1.0  → identical embedding (same image content)
      0.0  → orthogonal (completely different)
     -1.0  → opposite (maximally dissimilar)

    Args:
      a: float array (D,), should be L2-normalized
      b: float array (D,), should be L2-normalized

    Returns:
      float similarity in [-1.0, 1.0]
    """
    return float(np.clip(np.dot(a, b), -1.0, 1.0))


def batch_cosine_similarity(query: np.ndarray, archive: np.ndarray) -> np.ndarray:
    """
    Compute cosine similarity between a query and all archive embeddings.

    This is an efficient matrix-vector product: archive @ query
    Equivalent to N individual dot products but uses BLAS optimizations.

    Args:
      query:   float32 array (D,) — the query embedding
      archive: float32 array (N, D) — all archive embeddings as rows

    Returns:
      float32 array (N,) — similarity score for each archive entry
    """
    return np.clip(archive @ query, -1.0, 1.0).astype(np.float32)


def top_k(
    similarities: np.ndarray,
    k: int = 10,
    threshold: float = 0.0,
) -> list[tuple[int, float]]:
    """
    Return indices and scores of the top-K most similar archive entries.

    Uses numpy argpartition for O(N) selection (faster than full sort
    for large N). Only entries above the similarity threshold are included.

    Args:
      similarities: float array (N,) — similarity scores from batch_cosine
      k:            maximum number of results to return
      threshold:    minimum similarity score to include in results

    Returns:
      list of (index, score) tuples, sorted by descending similarity score
    """
    # Filter by threshold first
    valid_indices = np.where(similarities >= threshold)[0]
    if len(valid_indices) == 0:
        return []

    valid_sims = similarities[valid_indices]

    # Select top-K using partial sort (O(N) vs O(N log N) for full sort)
    k_actual = min(k, len(valid_sims))
    if k_actual < len(valid_sims):
        # argpartition: O(N) — only guarantees top-K are in position, unsorted
        part = np.argpartition(valid_sims, -k_actual)[-k_actual:]
        top_local = part
    else:
        top_local = np.arange(len(valid_sims))

    # Full sort of just the top-K candidates
    top_sorted = top_local[np.argsort(valid_sims[top_local])[::-1]]

    return [
        (int(valid_indices[i]), float(valid_sims[i]))
        for i in top_sorted
    ]


def embedding_distance(a: np.ndarray, b: np.ndarray) -> float:
    """
    Euclidean distance between two embeddings (alternative to cosine).

    For unit-norm vectors:
      ||a - b||² = 2 - 2·(a·b) = 2 × (1 - cosine_similarity)

    So distance and cosine similarity are interchangeable for ranking.
    Distance is used for some visualization tools (t-SNE, UMAP).

    Args:
      a, b: float arrays of the same shape, L2-normalized

    Returns:
      float distance in [0, 2]
    """
    return float(np.linalg.norm(a - b))
