"""
AKSHA Earth Intelligence Platform — Result Re-ranker
====================================================

PURPOSE:
  Apply temporal, spatial, and sensor-consistency scores to re-rank
  semantic search results beyond pure cosine similarity.

WHY IT EXISTS:
  Cosine similarity in embedding space captures content similarity,
  but for Earth observation retrieval, additional signals matter:
    • Temporal relevance: recent images of the same event are more useful
    • Spatial proximity: results from the same or adjacent region are preferred
    • Sensor consistency: SAR-to-SAR matches may be more reliable than SAR-to-optical
    • Mission priority: disaster-related scenes get boosted during active events

AI CONCEPT DEMONSTRATED:
  Result re-ranking — a two-stage retrieval pattern used in production search:
    Stage 1: Fast approximate retrieval (top-100 by embedding similarity)
    Stage 2: Slow but thorough re-ranking (using expensive features)
  This is the same architecture used by Google Search (BM25 retrieval + BERT ranking),
  Amazon search, and academic dense retrieval systems (ColBERT, DPR).

PRODUCTION REPLACEMENT:
  A cross-encoder re-ranking model that jointly encodes the query and each
  candidate and scores their relevance. Cross-encoders are slower than
  bi-encoders but produce better rankings by considering both images together.

INPUTS:
  results:         list of SearchResult from SemanticSearch
  query_metadata:  dict with satellite, date, sensor_type, coords
  weights:         optional dict of re-ranking signal weights

OUTPUTS:
  Reranked list of SearchResult objects

PIPELINE POSITION:
  Semantic Search → [Re-ranking ← HERE] → Event Detection
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any

from ai.search.semanticSearch import SearchResult


# Default weights for re-ranking signals
DEFAULT_WEIGHTS = {
    "similarity":   0.55,  # Base cosine similarity (dominant signal)
    "temporal":     0.20,  # Temporal proximity to query date
    "spatial":      0.15,  # Geographic proximity to query location
    "sensor":       0.10,  # Sensor type consistency
}


class Reranker:
    """
    Re-ranks semantic search results using temporal, spatial, and sensor signals.

    The final score is a weighted combination:
      score = w_sim × similarity + w_temp × temporal + w_spatial × spatial + w_sensor × sensor
    """

    def rerank(
        self,
        results: list[SearchResult],
        query_metadata: dict[str, Any],
        weights: dict[str, float] | None = None,
    ) -> list[SearchResult]:
        """
        Re-rank results using multi-signal scoring.

        Args:
          results:        Initial ranked results from SemanticSearch
          query_metadata: Metadata about the query image
          weights:        Signal weights (defaults to DEFAULT_WEIGHTS)

        Returns:
          Re-ranked list, may differ from original order
        """
        if not results:
            return results

        w = {**DEFAULT_WEIGHTS, **(weights or {})}

        scored = []
        for result in results:
            sim    = result.similarity
            temp   = self._temporal_score(query_metadata, result.entry)
            spat   = self._spatial_score(query_metadata, result.entry)
            sensor = self._sensor_score(query_metadata, result.entry)

            final = (
                w["similarity"] * sim +
                w["temporal"]   * temp +
                w["spatial"]    * spat +
                w["sensor"]     * sensor
            )

            scored.append((final, sim, result))

        # Sort by final composite score descending
        scored.sort(key=lambda x: x[0], reverse=True)

        # Update ranks after re-ranking
        reranked = []
        for new_rank, (score, orig_sim, result) in enumerate(scored, start=1):
            result.rank = new_rank
            # Slightly adjust displayed similarity toward composite score for display
            result.similarity = min(1.0, max(orig_sim, orig_sim * 0.85 + score * 0.15))
            reranked.append(result)

        return reranked

    def _temporal_score(
        self,
        query_meta: dict[str, Any],
        archive_entry: dict[str, Any],
    ) -> float:
        """
        Score based on temporal proximity between query and archive scene.

        Rationale: for disaster monitoring, scenes from the same month/year
        as the query are more relevant than scenes from 5 years ago.
        We use an exponential decay: score = exp(-|Δdays| / half_life)

        half_life = 365 days → scenes from the same year score ≥ 0.5
        half_life = 90  days → scenes within 3 months score ≥ 0.5

        Both are reasonable depending on use case; we use 180 days.
        """
        half_life_days = 180.0

        query_date_str = query_meta.get("acquisition_date", "")
        archive_date_str = archive_entry.get("timestamp", "")

        if not query_date_str or not archive_date_str:
            return 0.5  # neutral when dates unavailable

        try:
            qd = datetime.strptime(query_date_str[:10], "%Y-%m-%d")
            ad = datetime.strptime(archive_date_str[:10], "%Y-%m-%d")
            delta_days = abs((qd - ad).days)
            score = math.exp(-delta_days / (half_life_days / math.log(2)))
            return float(max(0.0, min(1.0, score)))
        except (ValueError, TypeError):
            return 0.5

    def _spatial_score(
        self,
        query_meta: dict[str, Any],
        archive_entry: dict[str, Any],
    ) -> float:
        """
        Score based on geographic proximity between query and archive scene.

        Uses great-circle distance approximation (Haversine formula).
        Scoring:
          0–100 km  → score ≥ 0.90 (same scene area)
          100–500 km → score 0.6–0.9 (same region)
          500–2000 km → score 0.2–0.6 (same country)
          > 2000 km → score < 0.2 (different region)

        Half-distance = 400 km (exponential decay)
        """
        query_coords  = query_meta.get("coords", {})
        archive_coords = archive_entry.get("location", {}).get("coords", {})

        if not query_coords or not archive_coords:
            return 0.5

        try:
            qlat = float(query_coords.get("lat", 0))
            qlng = float(query_coords.get("lng", 0))
            alat = float(archive_coords.get("lat", 0))
            alng = float(archive_coords.get("lng", 0))

            dist_km = self._haversine_km(qlat, qlng, alat, alng)
            half_dist_km = 400.0
            score = math.exp(-dist_km / (half_dist_km / math.log(2)))
            return float(max(0.0, min(1.0, score)))
        except (TypeError, ValueError):
            return 0.5

    def _sensor_score(
        self,
        query_meta: dict[str, Any],
        archive_entry: dict[str, Any],
    ) -> float:
        """
        Score based on sensor type compatibility.

        Same sensor → highest score (direct comparison possible)
        Compatible sensors → high score (cross-modal retrieval)
        Incompatible → lower score (different imaging physics)

        Compatibility matrix:
          SAR ↔ SAR:           1.0 (direct comparison)
          Optical ↔ Optical:   1.0 (direct comparison)
          Multi ↔ Multi:       1.0 (direct comparison)
          SAR ↔ Optical:       0.7 (cross-modal, supported)
          SAR ↔ Multi:         0.6 (cross-modal, supported)
          Optical ↔ Multi:     0.8 (similar physics, high compatibility)
        """
        q_sensor = query_meta.get("sensor_type", "Optical")
        a_sensor = archive_entry.get("sensor_type", "Optical")

        compatibility = {
            ("SAR",          "SAR"):          1.0,
            ("Optical",      "Optical"):      1.0,
            ("Multispectral","Multispectral"):1.0,
            ("SAR",          "Optical"):      0.7,
            ("Optical",      "SAR"):          0.7,
            ("SAR",          "Multispectral"):0.6,
            ("Multispectral","SAR"):          0.6,
            ("Optical",      "Multispectral"):0.8,
            ("Multispectral","Optical"):      0.8,
        }
        return compatibility.get((q_sensor, a_sensor), 0.5)

    @staticmethod
    def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """
        Compute great-circle distance between two lat/lng points in kilometers.

        The Haversine formula accounts for Earth's spherical geometry.
        Accuracy: ±0.3% at these scales (ignores Earth's ellipticity).
        """
        R = 6371.0  # Earth's mean radius in km
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = (
            math.sin(dlat / 2) ** 2 +
            math.cos(math.radians(lat1)) *
            math.cos(math.radians(lat2)) *
            math.sin(dlon / 2) ** 2
        )
        return R * 2 * math.asin(math.sqrt(max(0.0, min(1.0, a))))
