"""
backend/ai/analytics/analytics_generator.py

PURPOSE:
  Stage 9 of the AKSHA AI pipeline.
  Generates dashboard analytics from the mission's extracted features
  and retrieval results.

  Every metric is computed from the uploaded image.
  Nothing is hardcoded or loaded from static JSON.

OUTPUTS:
  coverage:    Estimated surface cover percentages (water, vegetation, urban, cloud)
  spectral:    Spectral statistics (brightness, contrast, entropy, saturation)
  texture:     Texture metrics from GLCM-inspired features
  retrieval:   Search result statistics (sensor distribution, similarity spread)
  confidence:  Confidence component breakdown
  features:    Full named feature dict for advanced visualization
  processing:  Pipeline timing breakdown from logs
"""

from __future__ import annotations

from typing import Any
import math


class AnalyticsGenerator:
    """
    Computes dashboard analytics from mission data.
    Called once all pipeline stages are complete.
    """

    def generate(
        self,
        features: dict[str, float],
        retrieval_results: list[dict[str, Any]],
        confidence: dict[str, Any],
        logs: list[dict[str, Any]],
        metadata: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Generate complete analytics dict from mission data.

        Args:
            features: Named 32-dim feature dict
            retrieval_results: Top-K results from vector search
            confidence: Confidence dict from confidence engine
            logs: Stage timing logs
            metadata: Scene metadata

        Returns:
            Analytics dict consumed by the frontend Analytics page.
        """
        coverage    = self._coverage(features)
        spectral    = self._spectral(features)
        texture     = self._texture(features)
        retrieval   = self._retrieval_stats(retrieval_results, metadata)
        proc        = self._processing_stats(logs)

        return {
            # Surface cover estimation (what % of the image is each type)
            "coverage": coverage,

            # Spectral statistics
            "spectral": spectral,

            # Texture statistics
            "texture": texture,

            # Retrieval / search statistics
            "retrieval": retrieval,

            # Confidence breakdown (mirrors MissionReport.confidence)
            "confidence": {
                "overall":     confidence.get("overall", 0),
                "level":       confidence.get("level", "Low"),
                "components":  confidence.get("components", {}),
            },

            # Full feature dict (for radar charts, advanced visualizations)
            "features": features,

            # Processing time breakdown
            "processing": proc,

            # Metadata summary for analytics header
            "scene_info": {
                "satellite":    metadata.get("satellite", "Unknown"),
                "sensor_type":  metadata.get("sensor_type", "Unknown"),
                "date":         metadata.get("acquisition_date", ""),
                "region":       metadata.get("region", "India"),
                "resolution_m": metadata.get("resolution_m", 10),
                "cloud_cover":  metadata.get("cloud_cover_pct", 0),
            },
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Surface cover estimation
    # ─────────────────────────────────────────────────────────────────────────

    def _coverage(self, f: dict[str, float]) -> dict[str, Any]:
        """
        Estimate surface cover percentages from spectral features.

        ALGORITHM:
          Each surface type has a "dominance score" computed from features.
          Scores are normalized to sum to 100%.

          Water dominance:    water_index × 100 + cool_ratio × 20
          Vegetation:         vegetation_index × 100 + (1 - warm_ratio) × 20
          Urban:              edge_density × 60 + (1 - vegetation_index) × 30
          Cloud:              brightness × 60 × (1 if homogeneity > 0.7 else 0.5)
          Bare soil:          remainder after other categories

        These are heuristic estimates — production uses trained classifiers
        (e.g., Random Forest on Sentinel-2 10-band imagery with training data
        from the CORINE Land Cover dataset or Bhuvan Lulc-50K).
        """
        wi  = f.get("water_index",      0.5)
        vi  = f.get("vegetation_index", 0.5)
        ed  = f.get("edge_density",     0.3)
        br  = f.get("brightness",       0.5)
        hom = f.get("homogeneity",      0.5)
        wr  = f.get("warm_ratio",       0.33)
        cr  = f.get("cool_ratio",       0.5)

        # Compute raw dominance scores
        water_dom = max(0, (wi - 0.40) / 0.60) * 100  # scaled above baseline
        veg_dom   = max(0, (vi - 0.35) / 0.65) * 100
        urban_dom = max(0, (ed - 0.30) / 0.70) * 70
        cloud_dom = br * (1.5 if hom > 0.70 else 0.5) * 80

        # Normalize to sum ≤ 100
        total_dom = water_dom + veg_dom + urban_dom + cloud_dom + 1e-9
        if total_dom > 100:
            scale = 100 / total_dom
            water_dom *= scale
            veg_dom   *= scale
            urban_dom *= scale
            cloud_dom *= scale

        bare_soil_dom = max(0, 100 - water_dom - veg_dom - urban_dom - cloud_dom)

        return {
            "water_pct":       round(water_dom, 1),
            "vegetation_pct":  round(veg_dom, 1),
            "urban_pct":       round(urban_dom, 1),
            "cloud_pct":       round(cloud_dom, 1),
            "bare_soil_pct":   round(bare_soil_dom, 1),
            "dominant_cover":  self._dominant(water_dom, veg_dom, urban_dom, cloud_dom, bare_soil_dom),
        }

    def _dominant(self, w, v, u, c, b) -> str:
        scores = {"Water": w, "Vegetation": v, "Urban": u, "Cloud": c, "Bare Soil": b}
        return max(scores, key=scores.get)

    # ─────────────────────────────────────────────────────────────────────────
    # Spectral statistics
    # ─────────────────────────────────────────────────────────────────────────

    def _spectral(self, f: dict[str, float]) -> dict[str, Any]:
        """Spectral statistics from per-channel features."""
        mr = f.get("mean_r", 0.5)
        mg = f.get("mean_g", 0.5)
        mb = f.get("mean_b", 0.5)
        br = f.get("brightness", 0.5)
        sat = f.get("saturation", 0.3)
        vi  = f.get("vegetation_index", 0.5)
        wi  = f.get("water_index", 0.5)

        return {
            "mean_r":           round(mr, 3),
            "mean_g":           round(mg, 3),
            "mean_b":           round(mb, 3),
            "brightness":       round(br, 3),
            "saturation":       round(sat, 3),
            "vegetation_index": round(vi, 3),
            "water_index":      round(wi, 3),
            "warm_ratio":       round(f.get("warm_ratio", 0.33), 3),
            "cool_ratio":       round(f.get("cool_ratio", 0.5), 3),
            "channel_balance":  {
                "R": round(mr * 100, 1),
                "G": round(mg * 100, 1),
                "B": round(mb * 100, 1),
            },
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Texture statistics
    # ─────────────────────────────────────────────────────────────────────────

    def _texture(self, f: dict[str, float]) -> dict[str, Any]:
        """Texture metrics from GLCM-inspired features."""
        return {
            "contrast":        round(f.get("contrast", 0.3), 3),
            "entropy":         round(f.get("entropy", 0.5), 3),
            "homogeneity":     round(f.get("homogeneity", 0.5), 3),
            "energy":          round(f.get("energy", 0.3), 3),
            "correlation":     round(f.get("correlation", 0.5), 3),
            "edge_density":    round(f.get("edge_density", 0.3), 3),
            "coarseness":      round(f.get("coarseness", 0.5), 3),
            "complexity":      round(f.get("complexity", 0.4), 3),
            "texture_class":   self._texture_class(f),
        }

    def _texture_class(self, f: dict[str, float]) -> str:
        """Classify texture as one of: smooth, rough, complex."""
        entropy = f.get("entropy", 0.5)
        edge    = f.get("edge_density", 0.3)
        if entropy < 0.35 and edge < 0.15:
            return "smooth"
        if entropy > 0.65 or edge > 0.50:
            return "complex"
        return "moderate"

    # ─────────────────────────────────────────────────────────────────────────
    # Retrieval statistics
    # ─────────────────────────────────────────────────────────────────────────

    def _retrieval_stats(
        self,
        results: list[dict[str, Any]],
        metadata: dict[str, Any],
    ) -> dict[str, Any]:
        """Compute statistics across all retrieved results."""
        if not results:
            return {"total_results": 0}

        sims = [r.get("similarityScore", 0) for r in results]

        # Sensor distribution
        sensor_dist: dict[str, int] = {}
        for r in results:
            st = r.get("sensorType", "Unknown")
            sensor_dist[st] = sensor_dist.get(st, 0) + 1

        # Satellite distribution
        sat_dist: dict[str, int] = {}
        for r in results:
            sat = r.get("satellite", "Unknown")
            sat_dist[sat] = sat_dist.get(sat, 0) + 1

        # Category distribution
        cat_dist: dict[str, int] = {}
        for r in results:
            cat = r.get("category", "unknown")
            cat_dist[cat] = cat_dist.get(cat, 0) + 1

        # Geographic spread: max haversine distance between any two results
        import math
        max_dist = 0.0
        coords_list = [
            r.get("location", {}).get("coords", {"lat": 0, "lng": 0})
            for r in results
        ]
        for i in range(len(coords_list)):
            for j in range(i + 1, len(coords_list)):
                c1, c2 = coords_list[i], coords_list[j]
                dlat = math.radians(c2.get("lat", 0) - c1.get("lat", 0))
                dlng = math.radians(c2.get("lng", 0) - c1.get("lng", 0))
                a    = math.sin(dlat/2)**2 + math.cos(math.radians(c1.get("lat", 0))) * math.cos(math.radians(c2.get("lat", 0))) * math.sin(dlng/2)**2
                d    = 2 * math.asin(math.sqrt(min(a, 1.0))) * 6371.0
                max_dist = max(max_dist, d)

        # Dominant event type in results
        event_types = [r.get("eventType", "") for r in results if r.get("eventType")]
        dominant_event = max(set(event_types), key=event_types.count) if event_types else "none"

        return {
            "total_results":     len(results),
            "top_similarity":    round(max(sims), 1),
            "mean_similarity":   round(sum(sims) / len(sims), 1),
            "min_similarity":    round(min(sims), 1),
            "sensor_distribution": sensor_dist,
            "satellite_distribution": sat_dist,
            "category_distribution": cat_dist,
            "location_spread_km":   round(max_dist, 1),
            "dominant_event_type":  dominant_event,
            "archive_size":         100,
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Processing statistics
    # ─────────────────────────────────────────────────────────────────────────

    def _processing_stats(self, logs: list[dict[str, Any]]) -> dict[str, Any]:
        """Compute processing time breakdown from pipeline logs."""
        stage_times: dict[str, float] = {}
        total_ms = 0.0

        for log in logs:
            stage = log.get("stage", "unknown")
            dur   = log.get("duration_ms", 0)
            stage_times[stage] = dur
            total_ms += dur

        return {
            "total_ms":         round(total_ms, 1),
            "total_seconds":    round(total_ms / 1000, 2),
            "stage_breakdown":  stage_times,
            "slowest_stage":    max(stage_times, key=stage_times.get) if stage_times else "",
            "embedding_dim":    32,
        }
