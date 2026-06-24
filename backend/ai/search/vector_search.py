"""
backend/ai/search/vector_search.py

PURPOSE:
  Stage 5 + 6 of the AKSHA AI pipeline.
  Given a query embedding, finds the K most similar archive entries.
  Re-ranks results using temporal, spatial, and sensor compatibility signals.

ALGORITHM — COSINE SIMILARITY SEARCH:
  Cosine similarity measures the angle between two vectors in embedding space.
  For unit vectors (L2 norm = 1.0), cosine similarity simplifies to a dot product:

    cos_sim(query, archive_entry) = query · archive_entry

  We compute this for ALL archive entries at once using matrix multiplication:
    similarities = archive_matrix @ query_vector     (shape: [N] = [100])

  This is called "exhaustive nearest neighbor search" — we check every entry.
  It's very fast for N=100 (100 × 32 multiply-adds).

  For production-scale (2.48M scenes), we'd use:
    FAISS (Facebook AI Similarity Search):
      - IVF-PQ (Inverted File + Product Quantization): ~50× speedup
      - GPU acceleration: ~300× speedup on A100
      - Approximate search: <0.1% recall loss

RE-RANKING:
  Cosine similarity alone isn't perfect. Two SAR images of different floods
  may have the same similarity score, but the one from 3 days ago is more
  useful than one from 2019.

  We re-rank using:
    Final Score = α × cosine_sim
                + β × temporal_score   (how recent is the match?)
                + γ × spatial_score    (how close geographically?)
                + δ × sensor_score     (same sensor type?)

  Where: α=0.60, β=0.18, γ=0.12, δ=0.10

  TEMPORAL SCORE: Exponential decay
    t_score = exp(-|Δdays| / λ_t)
    λ_t = 365 / ln(2) ≈ 527 days (half-life: 365 days)
    Matches from 1 year ago score ~50% of today's match

  SPATIAL SCORE: Exponential decay over great-circle distance
    d_score = exp(-dist_km / λ_d)
    λ_d = 500 / ln(2) ≈ 721 km (half-life: 500 km)
    Matches within 500 km score ~50% of same-location match

  SENSOR COMPATIBILITY:
    SAR ↔ SAR:    1.0 (same modality, direct comparison)
    SAR ↔ Optical: 0.70 (cross-modal, common in disaster monitoring)
    Optical ↔ Optical: 1.0
    Optical ↔ Multi:   0.85
    Multi ↔ Multi:     1.0

INPUT:
  query_embedding: list[float] — 32-dim unit vector from Stage 4
  query_metadata: dict — satellite, sensor_type, coordinates, date from Stage 1
  k: int = 10 — number of results to return
  threshold: float = 0.10 — minimum similarity to include

OUTPUT:
  list[dict] — top-K results with similarity, re-rank score, metadata

COMPLEXITY: O(N × D) for search where N=100 archive entries, D=32 dimensions
            O(K × log K) for sort of top-K results
"""

from __future__ import annotations

import math
from datetime import datetime
from typing import Any

import numpy as np

from data.archive_store import archive_store


# ── Re-ranking weights ─────────────────────────────────────────────────────
RERANK_WEIGHTS = {
    "similarity": 0.60,  # cosine similarity is the primary signal
    "temporal":   0.18,  # recency matters for disaster monitoring
    "spatial":    0.12,  # geographic proximity
    "sensor":     0.10,  # sensor compatibility
}

# ── Sensor compatibility matrix ───────────────────────────────────────────
SENSOR_COMPAT: dict[frozenset, float] = {
    frozenset(["SAR", "SAR"]):              1.00,
    frozenset(["Optical", "Optical"]):      1.00,
    frozenset(["Multispectral", "Multispectral"]): 1.00,
    frozenset(["SAR", "Optical"]):          0.70,
    frozenset(["SAR", "Multispectral"]):    0.75,
    frozenset(["Optical", "Multispectral"]): 0.85,
}


class VectorSearch:
    """
    Performs cosine similarity search + re-ranking against the satellite archive.
    Returns top-K results as structured dicts compatible with the frontend
    RetrievalResult TypeScript interface.
    """

    def search(
        self,
        query_embedding: list[float],
        query_metadata: dict[str, Any],
        query_features: dict[str, float],
        k: int = 10,
        threshold: float = 0.10,
    ) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        """
        Find top-K similar archive entries for the query embedding.

        Args:
            query_embedding: 32-dim unit vector
            query_metadata: {satellite, sensor_type, coordinates, acquisition_date, ...}
            query_features: named feature dict for feature similarity computation
            k: number of results to return
            threshold: minimum cosine similarity (below this = irrelevant)

        Returns:
            (results, stats) where results is list of RetrievalResult-compatible dicts
            and stats has diagnostic information.
        """
        archive = archive_store
        if archive.size == 0:
            return [], {"error": "Archive not initialized"}

        # ── Step 1: Batch cosine similarity ─────────────────────────────
        # This is the key computation: matrix multiply gives us ALL similarities at once.
        # archive.embeddings shape: (N, 32)
        # query_embedding shape:    (32,)
        # result shape:             (N,) — one similarity per archive entry
        q_vec = np.array(query_embedding, dtype=np.float32)
        sims  = archive.embeddings @ q_vec  # shape (N,)
        sims  = np.clip(sims, -1.0, 1.0)   # clamp to valid cosine range

        # ── Step 2: Get top-K indices above threshold ────────────────────
        # np.argpartition is O(N) vs O(N log N) for full sort
        # We only need the top K, so partial sort is faster for large N
        above_threshold = np.where(sims >= threshold)[0]
        if len(above_threshold) == 0:
            return [], {"matches": 0, "max_similarity": 0.0}

        if len(above_threshold) <= k:
            top_idx = above_threshold
        else:
            # Partial sort: get indices of top-K similarities
            partition_k = min(k, len(above_threshold))
            top_idx = np.argpartition(sims[above_threshold], -partition_k)[-partition_k:]
            top_idx = above_threshold[top_idx]

        # ── Step 3: Sort by cosine similarity ───────────────────────────
        top_idx_sorted = top_idx[np.argsort(sims[top_idx])[::-1]]

        # ── Step 4: Re-rank with temporal + spatial + sensor signals ────
        results = []
        query_date   = self._parse_date(query_metadata.get("acquisition_date", ""))
        query_coords = query_metadata.get("coordinates", {})
        query_sensor = query_metadata.get("sensor_type", "Optical")

        for idx in top_idx_sorted:
            entry    = archive.entries[idx]
            cos_sim  = float(sims[idx])

            # Temporal score
            entry_date   = self._parse_date(entry["date"])
            t_score      = self._temporal_score(query_date, entry_date)

            # Spatial score
            entry_coords = {"lat": entry["lat"], "lng": entry["lng"]}
            s_score      = self._spatial_score(query_coords, entry_coords)

            # Sensor compatibility
            sens_score   = self._sensor_score(query_sensor, entry["sensor_type"])

            # Weighted final score
            final_score = (
                RERANK_WEIGHTS["similarity"] * cos_sim +
                RERANK_WEIGHTS["temporal"]   * t_score +
                RERANK_WEIGHTS["spatial"]    * s_score +
                RERANK_WEIGHTS["sensor"]     * sens_score
            )

            # Feature similarity breakdown (for the explainability radar chart)
            feat_sim = self._feature_similarity(query_features, entry)

            results.append({
                "cos_sim":    cos_sim,
                "final_score": final_score,
                "entry":      entry,
                "feat_sim":   feat_sim,
                "t_score":    t_score,
                "s_score":    s_score,
                "sens_score": sens_score,
            })

        # Re-sort by final_score
        results.sort(key=lambda x: x["final_score"], reverse=True)
        results = results[:k]

        # ── Step 5: Format as RetrievalResult-compatible dicts ──────────
        formatted = []
        for rank, r in enumerate(results, start=1):
            entry = r["entry"]
            formatted.append({
                "id":            f"result_{rank}_{entry['id']}",
                "rank":          rank,
                "similarityScore": round(r["cos_sim"] * 100, 1),
                "finalScore":    round(r["final_score"] * 100, 1),
                "sensorType":    entry["sensor_type"],
                "satellite":     entry["satellite"],
                "location": {
                    "name":    entry["location"],
                    "coords":  {"lat": entry["lat"], "lng": entry["lng"]},
                    "region":  entry["location"],
                    "country": "India",
                },
                "timestamp":     entry["date"] + "T00:00:00Z",
                "resolution":    self._format_resolution(entry["resolution_m"]),
                "cloudCover":    entry.get("cloud_cover", 0),
                "thumbnailUrl":  entry["thumbnail"],
                "featureSimilarity": r["feat_sim"],
                "embeddingDistance": round(float(np.linalg.norm(
                    np.array(entry["embedding"]) - np.array(query_embedding)
                )), 4),
                "archiveSource": "ISRO Bhuvan" if "RISAT" in entry["satellite"] or "Cartosat" in entry["satellite"] else "Copernicus",
                "sceneId":       f"{entry['satellite'][:4]}_{entry['date'].replace('-', '')}_{entry['id']}",
                "eventType":     entry["event_type"],
                "category":      entry["category"],
                "matchExplanation": self._match_explanation(entry, r["cos_sim"]),
            })

        stats = {
            "archive_size":    archive.size,
            "matches_found":   len(formatted),
            "above_threshold": int(len(above_threshold)),
            "top_similarity":  round(float(sims.max()) * 100, 1),
            "mean_similarity": round(float(np.mean(sims[above_threshold])) * 100, 1) if len(above_threshold) > 0 else 0.0,
            "search_strategy": "exhaustive_cosine",
        }

        return formatted, stats

    # ─────────────────────────────────────────────────────────────────────────
    # Re-ranking helper functions
    # ─────────────────────────────────────────────────────────────────────────

    def _temporal_score(self, query_date: datetime | None, entry_date: datetime | None) -> float:
        """
        Exponential decay over time difference.

        Formula: score = exp(-|Δdays| / λ_t)
        λ_t = 365 / ln(2) ≈ 527 → half-life of 365 days

        Physics: A flood image from 3 days ago is highly relevant.
        An image from 3 years ago is historical context (less urgent).
        """
        if query_date is None or entry_date is None:
            return 0.5  # Unknown date: neutral score
        delta_days = abs((query_date - entry_date).days)
        lambda_t   = 365.0 / math.log(2)  # 527 day decay constant
        return float(math.exp(-delta_days / lambda_t))

    def _spatial_score(
        self,
        q_coords: dict[str, float],
        e_coords: dict[str, float],
    ) -> float:
        """
        Exponential decay over great-circle distance (Haversine formula).

        Formula: score = exp(-dist_km / λ_d)
        λ_d = 500 / ln(2) ≈ 721 km → half-life of 500 km

        HAVERSINE FORMULA:
          a = sin²(Δlat/2) + cos(lat1)×cos(lat2)×sin²(Δlng/2)
          c = 2×atan2(√a, √(1-a))
          dist = R × c      where R = 6371 km (Earth's radius)

        Named after the haversine function: hav(θ) = sin²(θ/2)
        Used for centuries in navigation before GPS.
        """
        lat1 = math.radians(q_coords.get("lat", 0))
        lng1 = math.radians(q_coords.get("lng", 0))
        lat2 = math.radians(e_coords.get("lat", 0))
        lng2 = math.radians(e_coords.get("lng", 0))

        dlat = lat2 - lat1
        dlng = lng2 - lng1

        a    = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlng/2)**2
        dist_km = 2 * math.asin(math.sqrt(min(a, 1.0))) * 6371.0

        lambda_d = 500.0 / math.log(2)  # 721 km decay constant
        return float(math.exp(-dist_km / lambda_d))

    def _sensor_score(self, query_sensor: str, entry_sensor: str) -> float:
        """Return sensor compatibility score between query and archive entry."""
        key = frozenset([query_sensor, entry_sensor])
        return SENSOR_COMPAT.get(key, 0.60)

    def _feature_similarity(
        self,
        query_features: dict[str, float],
        entry: dict[str, Any],
    ) -> dict[str, float]:
        """
        Compute per-category feature similarity for the explainability radar chart.
        Groups the 32 features into 5 interpretable categories.
        """
        profile = SCENE_PROFILES_LOOKUP.get(entry["category"], {})
        entry_fvec = entry.get("feature_vector", [0.5] * 32)

        # Compare query features to entry's feature vector
        def sim(q_key: str, e_idx: int) -> float:
            q_val = query_features.get(q_key, 0.5)
            e_val = entry_fvec[e_idx] if e_idx < len(entry_fvec) else 0.5
            return round(1.0 - abs(q_val - e_val), 2)

        return {
            "vegetation": sim("vegetation_index", 20),
            "water":      sim("water_index",      21),
            "texture":    sim("entropy",           1),
            "urban":      sim("edge_density",      5),
            "cloud":      sim("brightness",        22),
        }

    def _match_explanation(self, entry: dict[str, Any], cos_sim: float) -> str:
        """Generate a human-readable explanation for why this result matched."""
        cat = entry["category"]
        pct = round(cos_sim * 100, 1)
        explanations = {
            "flood":       f"{pct}% similar — both show inundated/water-dominated terrain with low vegetation response",
            "vegetation":  f"{pct}% similar — comparable forest/vegetation density and canopy texture",
            "urban":       f"{pct}% similar — matching built-up area density and geometric edge patterns",
            "agriculture": f"{pct}% similar — similar crop cover spectral indices and field pattern texture",
            "coastal":     f"{pct}% similar — matching water-land boundary spectral signature",
        }
        return explanations.get(cat, f"{pct}% embedding space similarity")

    def _parse_date(self, date_str: str) -> datetime | None:
        """Parse ISO date string to datetime, return None on failure."""
        if not date_str:
            return None
        for fmt in ("%Y-%m-%d", "%Y%m%d", "%Y-%m-%dT%H:%M:%SZ"):
            try:
                return datetime.strptime(date_str[:len(fmt.replace('%Y', '2024').replace('%m','01').replace('%d','01').replace('%H','00').replace('%M','00').replace('%S','00').replace('T','T').replace('Z',''))], fmt)
            except ValueError:
                continue
        return None

    def _format_resolution(self, res_m: int) -> str:
        if res_m == 0:
            return "<1m"
        return f"{res_m}m"


# Lookup table for feature profiles (used in feature similarity computation)
try:
    from data.archive_store import SCENE_PROFILES
    SCENE_PROFILES_LOOKUP = {
        k: {f"feat_{i}": float(v[i]) for i in range(32)}
        for k, v in SCENE_PROFILES.items()
    }
except ImportError:
    SCENE_PROFILES_LOOKUP = {}
