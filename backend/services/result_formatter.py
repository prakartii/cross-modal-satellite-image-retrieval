"""
backend/services/result_formatter.py

PIPELINE STAGE: 7 — Result Formatting
INPUT:  Re-ranked results from reranker.py
        + full archive metadata list from metadata.json
        + query feature dict from feature_extractor.py
OUTPUT: List of SearchResult dicts ready for JSON serialization

PURPOSE:
  Combines the ranked (id, score) pairs from the search pipeline with the
  full scene metadata from metadata.json, and computes the per-feature
  similarity breakdown for each result.

  The output is the complete, frontend-ready representation of each retrieved
  scene — every field that appears in the RetrievalResults UI is constructed here.

FEATURE SIMILARITY (PER-RESULT RADAR CHART DATA):
  For each result, we compute how similar the query image is to that archive
  scene in each of 5 feature groups:

    water:      1 - |query.water_ratio - archive.water_ratio|
    vegetation: 1 - |query.vegetation_ratio - archive.vegetation_ratio|
    urban:      1 - |query.urban_density - archive.urban_density|
    texture:    1 - |query.entropy - archive.entropy|
    spectral:   1 - mean(|query.mean_rgb - archive.mean_rgb|) across R,G,B

  The formula `1 - |a - b|` converts a distance metric (absolute difference)
  into a similarity metric. Range: [0.0, 1.0].
    1.0 → query and archive have identical values for this feature group
    0.5 → moderate difference
    0.0 → maximum possible difference (features at opposite extremes of [0,1])

  This breakdown is displayed as a radar chart in the frontend, showing the
  user WHY a particular scene was retrieved — not just that it was similar,
  but WHICH aspects of it are similar.

MATCH EXPLANATION:
  We generate a natural-language explanation for each match based on the
  dominant feature similarities. For example:
    "Strong water coverage match (98% similar). Both scenes show open water
    extending over 70% of the scene. Retrieved from flood archive of Bihar 2022."
  This is computed deterministically from the feature values — not LLM-generated.

THUMBNAIL URLs:
  Each archive entry in metadata.json contains a curated thumbnail_url pointing
  to an Unsplash photo that visually represents the scene type (flood, forest,
  urban, agriculture, coast). These are consistent visual aids — the same URL
  always maps to the same archive scene.
"""

from __future__ import annotations

from typing import Any


# Feature group keys used to compute per-group similarity
_WATER_KEYS      = ["water_ratio"]
_VEG_KEYS        = ["vegetation_ratio"]
_URBAN_KEYS      = ["urban_density"]
_TEXTURE_KEYS    = ["entropy", "contrast"]
_SPECTRAL_KEYS   = ["mean_r", "mean_g", "mean_b"]


def _feature_group_similarity(
    query_features: dict[str, float],
    archive_features: dict[str, float],
    keys: list[str],
) -> float:
    """
    Compute average feature similarity for a group of feature keys.

    FORMULA:
      For each key k in the group:
        component_similarity[k] = 1 - |query[k] - archive[k]|
      group_similarity = mean(component_similarity values)

    The `1 - |diff|` formula:
      - When query[k] == archive[k]: 1 - 0 = 1.0 (perfect similarity)
      - When they differ by 0.5: 1 - 0.5 = 0.5 (moderate similarity)
      - When at opposite ends (0 vs 1): 1 - 1 = 0.0 (no similarity)

    Args:
      query_features:   Feature dict of the query image.
      archive_features: Feature dict of the archive scene.
      keys:             List of feature keys to average.

    Returns:
      Float in [0.0, 1.0]. Higher = more similar for this feature group.
    """
    if not keys:
        return 0.5  # Neutral if no keys specified

    similarities = []
    for key in keys:
        q_val = query_features.get(key, 0.0)
        a_val = archive_features.get(key, 0.0)
        # |diff| is always in [0, 1] because both values are in [0, 1]
        sim = 1.0 - abs(q_val - a_val)
        similarities.append(sim)

    return round(sum(similarities) / len(similarities), 4)


def _build_match_explanation(
    final_score: float,
    cosine_score: float,
    archive_meta: dict[str, Any],
    query_features: dict[str, float],
    archive_features: dict[str, float],
) -> str:
    """
    Generate a natural-language explanation of why this scene was retrieved.

    The explanation is fully deterministic — derived from actual feature values,
    not from a language model or template randomization.

    LOGIC:
      1. Find which feature group has the highest similarity (the "lead match")
      2. Report the actual feature values for that group
      3. Add scene context (region, date, satellite)

    Args:
      final_score:      Final re-ranked score [0,1].
      cosine_score:     Pure cosine similarity [0,1].
      archive_meta:     Full metadata dict for this archive scene.
      query_features:   14-feature dict of the query image.
      archive_features: 14-feature dict of the archive scene.

    Returns:
      Multi-sentence explanation string.
    """
    region   = archive_meta.get("region", "Unknown region")
    sat      = archive_meta.get("satellite", "Unknown satellite")
    date     = archive_meta.get("acquisition_date", "Unknown date")
    stype    = archive_meta.get("scene_type", "unknown")

    # ── Identify dominant similarity signal ───────────────────────────────────
    q_water = query_features.get("water_ratio", 0.0)
    a_water = archive_features.get("water_ratio", 0.0)
    q_veg   = query_features.get("vegetation_ratio", 0.0)
    a_veg   = archive_features.get("vegetation_ratio", 0.0)
    q_urban = query_features.get("urban_density", 0.0)
    a_urban = archive_features.get("urban_density", 0.0)

    # Similarity for each major feature group
    water_sim = 1.0 - abs(q_water - a_water)
    veg_sim   = 1.0 - abs(q_veg   - a_veg)
    urban_sim = 1.0 - abs(q_urban - a_urban)

    parts: list[str] = []

    # Lead with the overall cosine score
    parts.append(
        f"Embedding similarity {cosine_score * 100:.1f}% (cosine distance in 14-dim feature space)."
    )

    # Report the dominant match reason
    if water_sim >= veg_sim and water_sim >= urban_sim and q_water > 0.25:
        parts.append(
            f"Strong water coverage match: query {q_water*100:.0f}% ≈ archive {a_water*100:.0f}%."
        )
    elif veg_sim >= water_sim and veg_sim >= urban_sim and q_veg > 0.20:
        parts.append(
            f"Vegetation coverage match: query {q_veg*100:.0f}% ≈ archive {a_veg*100:.0f}%."
        )
    elif q_urban > 0.25:
        parts.append(
            f"Urban density match: query {q_urban*100:.0f}% ≈ archive {a_urban*100:.0f}%."
        )

    # Add archive scene context
    parts.append(
        f"Retrieved from {stype} archive: {region}, {sat}, acquired {date}."
    )

    return " ".join(parts)


def format_results(
    ranked_results: list[dict[str, Any]],
    archive_metadata: list[dict[str, Any]],
    query_features:   dict[str, float],
) -> list[dict[str, Any]]:
    """
    Combine ranked search results with archive metadata into frontend-ready dicts.

    For each result, this function:
      1. Looks up the archive scene's full metadata by scene ID
      2. Computes 5 feature-group similarity scores for the radar chart
      3. Generates a natural-language match explanation
      4. Assembles all fields into a single result dict

    FIELDS IN OUTPUT:
      Each dict in the returned list contains ALL fields needed to render a
      ResultCard component in the frontend — no additional API calls required.

    Args:
      ranked_results:   Output of reranker.rerank() — list of dicts with id, scores.
      archive_metadata: All 50 scene metadata dicts from metadata.json.
      query_features:   14-feature dict from feature_extractor.extract_all_features().

    Returns:
      List of result dicts, one per ranked match, ordered by rank.
    """
    # Build O(1) lookup from scene ID to its full metadata dict
    meta_by_id: dict[str, dict] = {m["id"]: m for m in archive_metadata}

    formatted: list[dict[str, Any]] = []

    for result in ranked_results:
        scene_id  = result["id"]
        meta      = meta_by_id.get(scene_id)

        if meta is None:
            # Archive metadata missing for this ID — skip this result
            continue

        # The archive features stored in metadata.json (the feature profile)
        archive_features: dict[str, float] = meta.get("features", {})

        # ── Per-feature-group similarity ──────────────────────────────────────
        # These values power the radar chart in the frontend
        water_sim   = _feature_group_similarity(query_features, archive_features, _WATER_KEYS)
        veg_sim     = _feature_group_similarity(query_features, archive_features, _VEG_KEYS)
        urban_sim   = _feature_group_similarity(query_features, archive_features, _URBAN_KEYS)
        texture_sim = _feature_group_similarity(query_features, archive_features, _TEXTURE_KEYS)
        spectral_sim = _feature_group_similarity(query_features, archive_features, _SPECTRAL_KEYS)

        # ── Match explanation ─────────────────────────────────────────────────
        explanation = _build_match_explanation(
            final_score      = result.get("final_score", result.get("score", 0.0)),
            cosine_score     = result.get("cosine_score", result.get("score", 0.0)),
            archive_meta     = meta,
            query_features   = query_features,
            archive_features = archive_features,
        )

        # ── Assemble result dict ──────────────────────────────────────────────
        # Use "final_score" from reranker if available, else use cosine score
        display_score = result.get("final_score", result.get("score", 0.0))

        formatted.append({
            "id":               scene_id,
            "rank":             result["rank"],
            "similarity_score": round(display_score, 4),
            "cosine_score":     round(result.get("cosine_score", result.get("score", 0.0)), 4),
            "satellite":        meta.get("satellite", "Unknown"),
            "sensor_type":      meta.get("sensor_type", "Optical"),
            "acquisition_date": meta.get("acquisition_date", ""),
            "resolution":       meta.get("resolution", ""),
            "cloud_cover":      float(meta.get("cloud_cover", 0)),
            "scene_type":       meta.get("scene_type", ""),
            "processing_level": meta.get("processing_level", ""),
            "orbit_number":     int(meta.get("orbit_number", 0)),
            "archive_source":   meta.get("archive_source", "ISRO-BHUVAN"),
            "thumbnail_url":    meta.get("thumbnail_url", ""),
            "description":      meta.get("description", ""),
            "match_explanation": explanation,
            "location": {
                "name":    meta.get("region", ""),
                "region":  meta.get("state", meta.get("region", "")),
                "country": meta.get("country", "India"),
                "lat":     float(meta.get("lat", 0.0)),
                "lng":     float(meta.get("lng", 0.0)),
            },
            "feature_similarity": {
                "water":      water_sim,
                "vegetation": veg_sim,
                "urban":      urban_sim,
                "texture":    texture_sim,
                "spectral":   spectral_sim,
            },
            # Include archive feature profile for detailed comparison in frontend
            "archive_features": archive_features,
        })

    return formatted
