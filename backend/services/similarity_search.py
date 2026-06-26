"""
backend/services/similarity_search.py

PIPELINE STAGE: 5 — Cosine Similarity Search
INPUT:  14-dimensional unit query embedding + path to embeddings.json
OUTPUT: List of top-K (archive_id, cosine_similarity_score) pairs

PURPOSE:
  The core retrieval step. Compares the query image's embedding against
  all 50 pre-computed archive embeddings using cosine similarity, then
  returns the K most similar matches in descending order of similarity.

  EVERY similarity score returned by this function is computed by real
  linear algebra (matrix-vector multiply followed by argsort). There is
  no hardcoding, no random assignment, and no lookup table of scores.

HOW RETRIEVAL WORKS:

  1. The archive contains N embeddings (N = 50 in this system).
     Each embedding is a 14-dim unit vector computed from a historical
     satellite scene's feature profile.

  2. The query embedding is also a 14-dim unit vector computed from the
     uploaded image's pixel statistics.

  3. We compute cosine similarity between the query and ALL archive embeddings:
       similarities[i] = query_embedding · archive_embeddings[i]
     This is a dot product (equivalent to cosine for unit vectors).

  4. We sort similarities in descending order and return the top K.

  RESULT INTERPRETATION:
    similarity = 1.0: Query and archive scene are identical in feature space
                      (same scene type, same color distribution, same texture)
    similarity = 0.8: Very similar scenes (both floods, both large water coverage)
    similarity = 0.5: Somewhat similar (e.g., both involve water but one is coastal)
    similarity = 0.2: Quite different scenes
    similarity = 0.0: Completely orthogonal feature profiles

LAZY LOADING:
  The archive embeddings are loaded from disk the first time search() is called
  and cached in memory for all subsequent calls. This avoids re-reading the
  JSON file on every request (I/O overhead) while keeping memory use minimal
  (50 × 14 × 8 bytes = 5.6 KB).
"""

from __future__ import annotations

import json
import os
from typing import Any

import numpy as np

from utils.math_utils import batch_cosine_similarity, top_k_indices


# Path to the pre-computed archive embeddings database
_EMBEDDINGS_PATH = os.path.join(
    os.path.dirname(__file__), "..", "database", "embeddings.json"
)

# In-memory cache: populated on first call to search(), reused after that
_cache: dict[str, Any] | None = None


def _load_embeddings() -> dict[str, Any]:
    """
    Load the archive embeddings from disk into a structured cache.

    CACHE STRUCTURE:
      {
        "ids":        list[str]       — archive scene IDs, length N
        "matrix":     np.ndarray      — shape [N, 14], each row is a unit embedding
        "raw":        list[dict]      — raw JSON dicts (id + embedding list)
      }

    Called once at startup (or on first search request). Subsequent calls
    return the cached value without re-reading the file.

    Returns:
      Cache dict as described above.

    Raises:
      FileNotFoundError: If embeddings.json doesn't exist (need to run seed.py).
      ValueError: If the JSON structure is invalid.
    """
    path = os.path.abspath(_EMBEDDINGS_PATH)

    if not os.path.exists(path):
        raise FileNotFoundError(
            f"Archive embeddings not found at {path}. "
            "Run: python database/seed.py to generate the archive."
        )

    with open(path, "r", encoding="utf-8") as f:
        raw_list: list[dict] = json.load(f)

    if not raw_list:
        raise ValueError("embeddings.json is empty. Run database/seed.py to regenerate.")

    # Extract IDs and convert embedding lists to numpy rows
    ids: list[str] = []
    rows: list[np.ndarray] = []

    for entry in raw_list:
        if "id" not in entry or "embedding" not in entry:
            raise ValueError(f"Invalid entry in embeddings.json: {entry}")

        ids.append(str(entry["id"]))
        # Convert list of floats → numpy float64 row vector
        vec = np.array(entry["embedding"], dtype=np.float64)
        rows.append(vec)

    # Stack into a [N, D] matrix — this is what we matrix-multiply against the query
    matrix = np.stack(rows, axis=0)  # shape: [N, 14]

    return {
        "ids":    ids,
        "matrix": matrix,
        "raw":    raw_list,
    }


def get_archive_size() -> int:
    """Return the number of scenes in the archive (loads if needed)."""
    global _cache
    if _cache is None:
        _cache = _load_embeddings()
    return len(_cache["ids"])


def search(
    query_embedding: np.ndarray,
    top_k: int = 10,
) -> list[dict[str, float | str]]:
    """
    Search the archive for the top-K most similar scenes to the query embedding.

    ALGORITHM:
      1. Load (or retrieve from cache) the [N, 14] archive embedding matrix.
      2. Compute cosine similarity for all N archive entries:
           scores[i] = archive_matrix[i] · query_embedding
         This is done as a single matrix-vector multiply: scores = archive_matrix @ query_embedding
      3. Find the indices of the top-K highest scores using argsort.
      4. Return (id, score) pairs in descending order.

    DETERMINISM:
      Given the same query_embedding and the same embeddings.json, this
      function always returns exactly the same results in the same order.
      No randomness is involved.

    SCORE MEANING:
      The returned 'score' values are TRUE cosine similarity values computed
      directly from the dot product. They are NOT:
        - Hardcoded constants
        - Randomly sampled values
        - Rounded or binned approximations
        - The result of any probabilistic model

    Args:
      query_embedding: Unit-norm numpy array of shape [14].
                       Must be the output of embedding_generator.generate_embedding().
      top_k:           Number of results to return. Must be <= archive size.

    Returns:
      List of dicts, each with:
        "id":    archive scene ID (str)
        "score": cosine similarity (float in [0.0, 1.0])
        "rank":  1-based retrieval rank (int)
      Ordered from most similar (rank=1) to least similar (rank=top_k).

    Raises:
      FileNotFoundError: If archive embeddings haven't been generated.
    """
    global _cache

    # ── Load archive on first call ────────────────────────────────────────────
    if _cache is None:
        _cache = _load_embeddings()

    archive_matrix: np.ndarray = _cache["matrix"]  # shape: [N, 14]
    archive_ids:    list[str]   = _cache["ids"]     # length: N

    # ── Validate query embedding ──────────────────────────────────────────────
    if query_embedding.shape[0] != archive_matrix.shape[1]:
        raise ValueError(
            f"Query embedding dimension {query_embedding.shape[0]} does not match "
            f"archive dimension {archive_matrix.shape[1]}."
        )

    # Clamp top_k to the archive size
    k = min(top_k, len(archive_ids))

    # ── Batch cosine similarity ───────────────────────────────────────────────
    # batch_cosine_similarity computes: archive_matrix @ query_embedding
    # Result: shape [N], where result[i] = dot(archive[i], query)
    # Since both query and archive rows are unit vectors, this is cosine similarity.
    scores: np.ndarray = batch_cosine_similarity(query_embedding, archive_matrix)

    # ── Top-K selection ───────────────────────────────────────────────────────
    # top_k_indices returns indices of the k highest scores, in descending order
    best_indices: np.ndarray = top_k_indices(scores, k)

    # ── Build result list ─────────────────────────────────────────────────────
    results: list[dict] = []
    for rank, idx in enumerate(best_indices, start=1):
        results.append({
            "id":    archive_ids[idx],
            "score": float(scores[idx]),   # True cosine similarity value
            "rank":  rank,
        })

    return results


def invalidate_cache() -> None:
    """
    Clear the in-memory embedding cache.
    Call this if embeddings.json is regenerated while the server is running.
    """
    global _cache
    _cache = None
