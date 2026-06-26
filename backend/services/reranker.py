"""
backend/services/reranker.py

PIPELINE STAGE: 6 — Re-ranking (optional refinement)
INPUT:  List of (id, cosine_score, rank) from similarity_search.py
        + query metadata from metadata_parser.py
        + archive metadata from metadata.json
OUTPUT: Re-ranked list with adjusted scores

PURPOSE:
  Cosine similarity on feature embeddings is a powerful but incomplete signal.
  Two scenes might have very similar pixel statistics (hence high cosine similarity)
  but differ in important contextual ways that pure feature matching misses:

    - TEMPORAL context: A flood image from 2018 is less relevant to a 2024 query
      than an equally similar flood image from 2023.
    - SENSOR context: A SAR query is more naturally compared to other SAR scenes
      than optical ones (different physics, different appearance).

  The re-ranker adjusts cosine similarity scores using these additional signals.

ML CONCEPT — SCORE FUSION:
  We combine the cosine similarity with auxiliary signals using a weighted sum:

    final_score = w_cos × cos_sim + w_temp × temporal_score + w_sensor × sensor_score

  Where:
    w_cos     = 0.80  (cosine similarity dominates — it's the most reliable signal)
    w_temp    = 0.12  (temporal recency bonus — more recent is more relevant)
    w_sensor  = 0.08  (sensor type compatibility bonus)

  This is a RANKING function, not a classification function. We don't claim
  the score represents probability — it's a relevance ordering signal.

ML CONCEPT — TEMPORAL DECAY:
  The temporal score decays exponentially with the age difference between
  the query scene's inferred date and the archive scene's acquisition date:

    temporal_score = exp(-|delta_days| / tau)

  Where tau = 365 days (1-year half-decay constant).
  This gives:
    - Same year scene: score ≈ 0.9–1.0
    - 1 year old scene: score ≈ 0.37
    - 2 years old: score ≈ 0.14
    - 5 years old: score ≈ 0.007

  WHY EXPONENTIAL DECAY: Remote sensing observations from different years may
  reflect different land use, seasonal state, or climate conditions. More
  recent analogues are generally more relevant for operational decisions.

ML CONCEPT — SENSOR COMPATIBILITY:
  Different sensor types produce images with fundamentally different physics:
    SAR (Synthetic Aperture Radar):
      - Active illumination — works through clouds at night
      - Measures surface roughness and dielectric properties
      - Dark for smooth surfaces (water), bright for rough surfaces (urban)
    Optical:
      - Passive illumination — measures reflected sunlight
      - Cloud-affected, daylight only
      - Intuitive visual appearance

  A SAR image of a flood looks completely different from an optical image of
  the same flood in raw pixels. HOWEVER, our feature extractor works in
  SEMANTIC space (water ratio, edge density, etc.), so cross-modal similarity
  is actually meaningful. A SAR flood image and an optical flood image both
  have high water_ratio (detected differently but converging to similar values).

  The sensor score gives a small bonus when the query and archive scene use
  the same sensor type (matching physics = more reliable feature comparison),
  and a smaller bonus for cross-modal matches.

WHEN RE-RANKING IS A NO-OP:
  If the query metadata has no inferred date or sensor type (e.g., uploaded
  image is an anonymous PNG with no EXIF), both temporal and sensor scores
  are set to 0.5 (neutral) and only cosine similarity determines the final order.
  The re-ranker never returns worse results than cosine similarity alone —
  it can only improve ordering when context signals are available.
"""

from __future__ import annotations

import math
from typing import Any


# ── Score fusion weights ──────────────────────────────────────────────────────
# Must sum to 1.0 so that the final score remains in [0, 1].
WEIGHT_COSINE  = 0.80  # Cosine similarity dominates
WEIGHT_TEMPORAL = 0.12  # Temporal recency bonus
WEIGHT_SENSOR   = 0.08  # Sensor type compatibility

# Temporal decay time constant in days.
# exp(-365/365) ≈ 0.37: a scene 1 year old has temporal_score ≈ 0.37.
TEMPORAL_TAU_DAYS = 365.0

# Sensor compatibility scores (lookup table)
# Symmetric: SAR-SAR = Optical-Optical = 1.0 (same physics)
# SAR-Optical = 0.70 (different physics but semantic features still comparable)
SENSOR_COMPAT: dict[tuple[str, str], float] = {
    ("SAR", "SAR"):           1.00,
    ("Optical", "Optical"):   1.00,
    ("Multispectral", "Multispectral"): 1.00,
    ("SAR", "Optical"):       0.70,
    ("Optical", "SAR"):       0.70,
    ("SAR", "Multispectral"): 0.75,
    ("Multispectral", "SAR"): 0.75,
    ("Optical", "Multispectral"): 0.90,
    ("Multispectral", "Optical"): 0.90,
}


def _temporal_score(query_date_str: str | None, archive_date_str: str | None) -> float:
    """
    Compute temporal relevance score based on date difference.

    FORMULA:
      score = exp(-|delta_days| / TEMPORAL_TAU_DAYS)

    If either date is missing, return 0.5 (neutral — neither bonus nor penalty).

    Args:
      query_date_str:   Date string "YYYY-MM-DD" for the query image, or None.
      archive_date_str: Date string "YYYY-MM-DD" for the archive scene.

    Returns:
      Float in [0.0, 1.0]. Higher = more temporally relevant.
    """
    if not query_date_str or not archive_date_str:
        return 0.5  # Neutral when date info is unavailable

    try:
        from datetime import datetime
        fmt = "%Y-%m-%d"
        q_date = datetime.strptime(query_date_str[:10], fmt)
        a_date = datetime.strptime(archive_date_str[:10], fmt)
        delta_days = abs((q_date - a_date).days)
        return math.exp(-delta_days / TEMPORAL_TAU_DAYS)
    except (ValueError, TypeError):
        return 0.5  # Neutral on parse failure


def _sensor_score(query_sensor: str | None, archive_sensor: str | None) -> float:
    """
    Compute sensor type compatibility score.

    Returns the compatibility value from SENSOR_COMPAT lookup.
    If either sensor is unknown, returns 0.5 (neutral).

    Args:
      query_sensor:   Sensor type of query image, or None.
      archive_sensor: Sensor type of archive scene, or None.

    Returns:
      Float in [0.0, 1.0]. Higher = more compatible sensor types.
    """
    if not query_sensor or not archive_sensor:
        return 0.5  # Neutral when sensor info is unavailable

    # Normalize to canonical form
    q = query_sensor.strip().capitalize()
    a = archive_sensor.strip().capitalize()

    # Try both orderings
    return SENSOR_COMPAT.get((q, a), SENSOR_COMPAT.get((a, q), 0.5))


def rerank(
    raw_results: list[dict[str, Any]],
    archive_metadata: list[dict[str, Any]],
    query_metadata: dict[str, Any],
) -> list[dict[str, Any]]:
    """
    Re-rank cosine similarity results using temporal and sensor signals.

    Each result's score is adjusted using the formula:
      final_score = WEIGHT_COSINE × cos_score
                  + WEIGHT_TEMPORAL × temporal_score
                  + WEIGHT_SENSOR × sensor_score

    The results are then re-sorted by final_score and ranks are updated.

    IMPORTANT: The cosine similarity value from similarity_search.py is
    preserved in the "cosine_score" field of the output dict, so the frontend
    can display the raw semantic similarity separately from the final score.

    Args:
      raw_results:      List of dicts from similarity_search.search().
                        Each has: id, score (cosine), rank.
      archive_metadata: Full list of archive metadata dicts loaded from metadata.json.
                        Keyed lookup to find acquisition_date and sensor_type per scene.
      query_metadata:   Dict from metadata_parser.parse_metadata().
                        Contains inferred_date, inferred_sensor_type (may be None).

    Returns:
      Re-ranked list of dicts, each with:
        "id":             archive scene ID
        "cosine_score":   original cosine similarity from embedding comparison
        "temporal_score": temporal decay score
        "sensor_score":   sensor compatibility score
        "final_score":    weighted combination (this is the displayed similarity)
        "rank":           updated rank after re-ranking
    """
    # Build a lookup from archive scene ID to its metadata dict
    meta_by_id: dict[str, dict] = {m["id"]: m for m in archive_metadata}

    # Extract query context signals
    query_date   = query_metadata.get("inferred_date")
    query_sensor = query_metadata.get("inferred_sensor_type")

    # Compute adjusted score for each result
    adjusted: list[dict[str, Any]] = []
    for result in raw_results:
        scene_id    = result["id"]
        cos_score   = float(result["score"])
        archive_meta = meta_by_id.get(scene_id, {})

        # Get archive scene's date and sensor type
        archive_date   = archive_meta.get("acquisition_date")
        archive_sensor = archive_meta.get("sensor_type")

        # Compute auxiliary scores
        temp_score   = _temporal_score(query_date, archive_date)
        sensor_score = _sensor_score(query_sensor, archive_sensor)

        # Weighted combination
        final = (
            WEIGHT_COSINE   * cos_score
            + WEIGHT_TEMPORAL * temp_score
            + WEIGHT_SENSOR   * sensor_score
        )

        adjusted.append({
            "id":             scene_id,
            "cosine_score":   cos_score,
            "temporal_score": round(temp_score, 4),
            "sensor_score":   round(sensor_score, 4),
            "final_score":    round(float(min(final, 1.0)), 4),
            "rank":           result["rank"],  # will be updated below
        })

    # Re-sort by final_score descending
    adjusted.sort(key=lambda x: x["final_score"], reverse=True)

    # Update ranks to reflect new ordering
    for i, item in enumerate(adjusted):
        item["rank"] = i + 1

    return adjusted
