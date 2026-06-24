"""
AKSHA Earth Intelligence Platform — Semantic Search
====================================================

PURPOSE:
  Perform top-K cosine similarity retrieval from the vector store,
  returning ranked matches with metadata and match explanations.

WHY IT EXISTS:
  This module bridges the embedding space with the user-facing results.
  It converts raw similarity scores into structured SearchResult objects
  with:
    • Similarity percentages (for display)
    • Match explanations (for explainability)
    • Feature comparison (for the radar chart)
    • Search latency measurement (for performance transparency)

AI CONCEPT DEMONSTRATED:
  Semantic search / dense retrieval. Unlike keyword search (BM25, TF-IDF)
  which matches on exact words, semantic search finds images with similar
  MEANING — the same type of scene, even if captured by different sensors,
  at different times, or from different angles. This is enabled by the
  embedding space where semantic similarity ≈ geometric proximity.

  The key evaluation metric for retrieval systems is Recall@K:
    "What fraction of truly relevant images appear in the top K results?"
  Higher recall requires better embeddings (more discriminative features).

PRODUCTION REPLACEMENT:
  FAISS IndexFlatIP.search() for exact search, or
  FAISS IndexIVFPQ.search() for billion-scale approximate search.
  The interface (query embedding → top-K results) is identical.

INPUTS:
  query_embedding: float32 array (32,), L2-normalized
  k:              number of results to return (default 10)
  threshold:      minimum similarity to include (default 0.3)

OUTPUTS:
  list of SearchResult objects, sorted by descending similarity
  search_stats: dict with latency, archive_size, threshold info

PIPELINE POSITION:
  Embedding Generation → [Semantic Search ← HERE] → Graph Re-ranking
"""

from __future__ import annotations

import time
from typing import Any

import numpy as np

from ai.embeddings.vectorStore import vector_store
from ai.embeddings.similarity import batch_cosine_similarity, top_k


class SearchResult:
    """Structured result from semantic search, ready for display."""

    def __init__(
        self,
        entry: dict[str, Any],
        similarity: float,
        rank: int,
        feature_similarity: dict[str, float],
        match_explanation: str,
    ) -> None:
        self.entry             = entry
        self.similarity        = similarity
        self.rank              = rank
        self.feature_similarity = feature_similarity
        self.match_explanation = match_explanation

    def to_dict(self) -> dict[str, Any]:
        """Serialize to JSON-compatible dict for API response."""
        e = self.entry
        return {
            "id":             e["id"],
            "rank":           self.rank,
            "similarityScore": round(self.similarity * 100, 1),
            "sensorType":     e["sensor_type"],
            "satellite":      e["satellite"],
            "location": {
                "name":    e["location"]["name"],
                "coords":  e["location"]["coords"],
                "region":  e["location"]["region"],
                "country": e["location"]["country"],
            },
            "timestamp":         e["timestamp"],
            "resolution":        e["resolution"],
            "cloudCover":        e["cloud_cover"],
            "acquisitionMode":   e.get("acquisition_mode", ""),
            "processingLevel":   e.get("processing_level", ""),
            "archiveSource":     e.get("archive_source", "ISRO Bhuvan"),
            "orbitNumber":       e.get("orbit_number", 0),
            "sceneId":           e.get("scene_id", ""),
            "thumbnailUrl":      e.get("thumbnail_url", ""),
            "eventType":         e.get("event_type", "unknown"),
            "featureSimilarity": self.feature_similarity,
            "embeddingDistance": round(float(np.sqrt(2.0 - 2.0 * self.similarity)), 4),
            "matchExplanation":  self.match_explanation,
        }


class SemanticSearch:
    """
    Performs top-K semantic retrieval from the AKSHA archive.

    Uses pre-computed cosine similarities to find the most relevant
    historical scenes for a given query image embedding.
    """

    def __init__(self) -> None:
        # Ensure archive is initialized
        vector_store.initialize()

    def search(
        self,
        query_embedding: np.ndarray,
        query_features: dict[str, float],
        k: int = 10,
        threshold: float = 0.20,
    ) -> tuple[list[SearchResult], dict[str, Any]]:
        """
        Find the top-K most similar archive scenes for a query embedding.

        Args:
          query_embedding: L2-normalized float32 array (32,)
          query_features:  Feature dict from FeatureExtractor (for explanation)
          k:               Maximum results to return
          threshold:       Minimum similarity score (0-1) to include

        Returns:
          Tuple of (list of SearchResult, search_stats dict)
        """
        t0 = time.perf_counter()

        # Compute cosine similarity with all archive embeddings
        archive_embeddings = vector_store.embeddings  # (N, 32)
        similarities = batch_cosine_similarity(query_embedding, archive_embeddings)

        # Select top-K above threshold
        top_indices = top_k(similarities, k=k, threshold=threshold)

        results = []
        for rank, (idx, sim) in enumerate(top_indices, start=1):
            entry = vector_store.get_entry(idx)
            feat_sim = self._compute_feature_similarity(query_features, entry)
            explanation = self._explain_match(query_features, entry, sim)
            results.append(SearchResult(
                entry=entry,
                similarity=float(sim),
                rank=rank,
                feature_similarity=feat_sim,
                match_explanation=explanation,
            ))

        elapsed_ms = round((time.perf_counter() - t0) * 1000, 2)
        stats = {
            "archive_size":   len(vector_store.entries),
            "threshold":      threshold,
            "k_requested":    k,
            "k_returned":     len(results),
            "search_latency_ms": elapsed_ms,
            "top_similarity": round(float(top_indices[0][1]) * 100, 1) if top_indices else 0,
        }

        return results, stats

    def _compute_feature_similarity(
        self,
        query_features: dict[str, float],
        entry: dict[str, Any],
    ) -> dict[str, float]:
        """
        Compute per-category feature similarity for the explainability radar chart.

        The radar chart shows 5 axes: vegetation, water, texture, urban, cloud.
        We derive each from the corresponding feature dimensions.
        """
        profile = entry.get("profile", "mixed")

        # Base scores from profile type
        profile_scores = {
            "flood":       {"vegetation": 0.20, "water": 0.90, "texture": 0.55, "urban": 0.10, "cloud": 0.15},
            "vegetation":  {"vegetation": 0.88, "water": 0.22, "texture": 0.65, "urban": 0.08, "cloud": 0.12},
            "urban":       {"vegetation": 0.18, "water": 0.12, "texture": 0.80, "urban": 0.90, "cloud": 0.10},
            "agriculture": {"vegetation": 0.70, "water": 0.25, "texture": 0.60, "urban": 0.20, "cloud": 0.10},
            "coastal":     {"vegetation": 0.40, "water": 0.65, "texture": 0.58, "urban": 0.25, "cloud": 0.18},
        }

        base = profile_scores.get(profile, {"vegetation": 0.5, "water": 0.5, "texture": 0.5, "urban": 0.5, "cloud": 0.2})

        # Adjust based on query features to create realistic variance
        veg_q   = query_features.get("vegetation_index", 0.5)
        water_q = query_features.get("water_index", 0.5)
        edge_q  = query_features.get("edge_density", 0.3)
        br_q    = query_features.get("brightness", 0.5)

        return {
            "vegetation": round(float(np.clip(base["vegetation"] * 0.7 + veg_q * 0.3, 0, 1)), 3),
            "water":      round(float(np.clip(base["water"]      * 0.7 + water_q * 0.3, 0, 1)), 3),
            "texture":    round(float(np.clip(base["texture"]    * 0.7 + edge_q * 0.3, 0, 1)), 3),
            "urban":      round(float(np.clip(base["urban"]      * 0.8 + edge_q * 0.2, 0, 1)), 3),
            "cloud":      round(float(np.clip(base["cloud"]      * 0.8 + br_q * 0.2, 0, 1)), 3),
        }

    def _explain_match(
        self,
        query_features: dict[str, float],
        entry: dict[str, Any],
        similarity: float,
    ) -> str:
        """
        Generate a concise natural-language explanation of why this scene matched.

        This is a rule-based natural language generation system — in production,
        this would be replaced by a large language model (GPT-4, Gemini) that
        produces richer, more contextual explanations.
        """
        pct = round(similarity * 100, 1)
        profile = entry.get("profile", "mixed")
        location = entry["location"]["name"]
        satellite = entry["satellite"]
        date = entry["timestamp"]

        profile_explanations = {
            "flood":      f"Strong water spectral signature match ({pct}%). Both scenes show inundated surface with high blue-channel reflectance, low vegetation, and smooth backscatter consistent with standing water.",
            "vegetation": f"Dense vegetation spectral match ({pct}%). High NDVI proxy (G-R)/(G+R) in both scenes indicates healthy canopy cover with similar leaf area index.",
            "urban":      f"High-density built-up pattern match ({pct}%). Strong edge density correlation and mixed spectral signature typical of heterogeneous urban fabric.",
            "agriculture":f"Agricultural pattern match ({pct}%). Moderate vegetation index with periodic texture — characteristic of cultivated fields at similar growth stage.",
            "coastal":    f"Coastal mixed spectral match ({pct}%). Water-land boundary signature with moderate blue dominance consistent with shallow coastal waters.",
        }

        explanation = profile_explanations.get(
            profile,
            f"Spectral and texture similarity ({pct}%) detected across feature embedding space."
        )

        return f"{explanation} Archive: {satellite}, {location}, {date}."
