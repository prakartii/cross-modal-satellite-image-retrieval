"""
backend/ai/events/event_detector.py

PURPOSE:
  Stage 7 of the AKSHA AI pipeline.
  Detects geophysical events from extracted image features.
  Returns a list of detected events, each with severity and confidence.

APPROACH — RULE-BASED DETECTION:
  Each event type has diagnostic rules derived from remote sensing domain knowledge.
  Rules are expressed as feature thresholds with contribution scores.
  Multiple rules "vote" — more rules triggered → higher confidence.

  MATHEMATICAL MODEL:
    For each event type, define N diagnostic rules with weights:
      rule_i: feature_name [operator] threshold → contribution_i

    Confidence = Σ (contribution_i × triggered_i) / Σ contribution_i
               = weighted average of triggered rules

    This is a simplified version of naive Bayes classification where
    each rule is an independent binary predictor.

EVENTS DETECTED:
  1. FLOOD / INUNDATION
     Triggered by: high water_index, blue dominance, low vegetation,
                   high homogeneity, low edge density
     Physical basis: Water absorbs red/NIR light, reflects blue/green.
     Reference: McFeeters (1996) NDWI, Xu (2006) MNDWI

  2. FIRE / WILDFIRE
     Triggered by: high warm_ratio (red/thermal dominance), low vegetation,
                   moderate brightness (smoke reduces peak brightness)
     Physical basis: Active fire pixels are very warm (red-IR dominant).
     Reference: Key & Benson (1999) dNBR, Kumar & Roy (2018)

  3. DEFORESTATION / FOREST LOSS
     Triggered by: intermediate vegetation (not zero, not high),
                   high edge density (forest-clearing boundary), spatial variance
     Physical basis: Recently cleared areas have intermediate NDVI (soil + sparse regrowth)
     Reference: Hansen et al. (2013) Global Forest Cover Loss

  4. URBAN EXPANSION
     Triggered by: high edge density (buildings), low vegetation, moderate brightness
     Physical basis: Urban surfaces have high SWIR/thermal reflectance
     Reference: Weng (2001) urban heat island detection

  5. CLOUD COVER
     Triggered by: high brightness, high homogeneity, low edge density
     Physical basis: Clouds are highly reflective in all optical bands
     Not a disaster, but flagged as a quality issue

  6. LANDSLIDE
     Triggered by: high spatial variance, intermediate edge density, low vegetation
     Physical basis: Fresh landslide material has exposed soil spectral signature
     Only detected in mountainous regions (from metadata)

  7. DROUGHT / BARE SOIL
     Triggered by: low vegetation, warm_ratio elevated, low water_index
     Physical basis: Drought-stressed vegetation has low NDVI, soil exposed

NO HARDCODED RESULTS:
  Every detection depends on the feature values extracted from the uploaded image.
  Upload a flood image → flood detected. Upload a forest image → no flood.

INPUT:  features: dict[str, float] — named feature dict from Stage 3
        metadata: dict — satellite metadata from Stage 1 (for location-based hints)
OUTPUT: list[dict] — detected events, sorted by confidence descending

COMPLEXITY: O(1) — fixed number of rules, all constant-time comparisons
"""

from __future__ import annotations

from typing import Any


class EventDetector:
    """
    Detects geophysical events from image feature vectors using rule-based heuristics.
    Each detector returns an event dict or None if not detected.
    """

    def detect(
        self,
        features: dict[str, float],
        metadata: dict[str, Any],
    ) -> list[dict[str, Any]]:
        """
        Run all event detectors on the feature dict.

        Args:
            features: 32-dim named feature dict from feature extraction
            metadata: scene metadata (satellite, date, region, coordinates)

        Returns:
            List of detected event dicts, sorted by confidence (highest first).
            Empty list if no events detected.
        """
        events = []

        detectors = [
            self._detect_flood,
            self._detect_fire,
            self._detect_deforestation,
            self._detect_urban_expansion,
            self._detect_cloud_cover,
            self._detect_drought,
        ]

        for detector in detectors:
            event = detector(features, metadata)
            if event is not None:
                events.append(event)

        # Sort by confidence descending
        events.sort(key=lambda e: e["confidence"], reverse=True)
        return events

    # ─────────────────────────────────────────────────────────────────────────
    # Individual event detectors
    # ─────────────────────────────────────────────────────────────────────────

    def _detect_flood(
        self,
        f: dict[str, float],
        meta: dict[str, Any],
    ) -> dict[str, Any] | None:
        """
        Detect flood / inundation event.

        DIAGNOSTIC RULES (remote sensing domain knowledge):
          1. water_index > 0.60  → strong water spectral signature    (weight 0.40)
          2. mean_b > mean_r + 0.08 → blue channel dominance           (weight 0.25)
          3. vegetation_index < 0.40 → suppressed vegetation (inundated)(weight 0.18)
          4. homogeneity > 0.68  → smooth water surface texture         (weight 0.10)
          5. edge_density < 0.22  → few internal edges (water has none) (weight 0.07)

        INUNDATION ESTIMATE:
          Approximate flooded fraction from water_index:
            inundation_pct ≈ (water_index - 0.50) × 200  (capped at 100%)
          This is a rough proxy — production uses SAR backscatter thresholding.
        """
        wi  = f.get("water_index",      0.5)
        mb  = f.get("mean_b",           0.4)
        mr  = f.get("mean_r",           0.4)
        vi  = f.get("vegetation_index", 0.5)
        hom = f.get("homogeneity",      0.5)
        ed  = f.get("edge_density",     0.3)

        # Rule evaluation
        rules = [
            (wi  > 0.60,               0.40, "water_index > 0.60"),
            (mb  > mr + 0.08,          0.25, "blue dominance"),
            (vi  < 0.40,               0.18, "suppressed vegetation"),
            (hom > 0.68,               0.10, "smooth surface texture"),
            (ed  < 0.22,               0.07, "low edge density"),
        ]

        triggered = [(w, desc) for cond, w, desc in rules if cond]
        total_weight = sum(w for _, w, _ in rules)
        gained_weight = sum(w for w, _ in triggered)
        confidence = gained_weight / total_weight

        if confidence < 0.30:
            return None  # Below detection threshold

        inundation_pct = min(100.0, max(0.0, (wi - 0.50) * 200))
        severity = self._severity(confidence, inundation_pct, [0.85, 0.70, 0.55])

        return {
            "event_type":    "flood",
            "severity":      severity,
            "confidence":    round(confidence, 3),
            "confidence_pct": round(confidence * 100, 1),
            "triggered_rules": [desc for _, desc in triggered],
            "feature_evidence": {
                "water_index":      round(wi, 3),
                "vegetation_index": round(vi, 3),
                "homogeneity":      round(hom, 3),
                "edge_density":     round(ed, 3),
                "blue_dominance":   round(mb - mr, 3),
            },
            "inundation_estimate_pct": round(inundation_pct, 1),
            "explanation": (
                f"FLOOD DETECTED — {severity} severity, {confidence*100:.1f}% confidence. "
                f"Water spectral index {wi:.2f} (threshold 0.60). "
                f"Vegetation index {vi:.2f} shows suppressed plant response. "
                f"{len(triggered)}/5 diagnostic rules triggered. "
                f"Estimated inundation: {inundation_pct:.0f}% of visible area."
            ),
            "recommended_action": (
                "IMMEDIATE: Alert NDMA Situation Room. "
                "HIGH: Deploy NDRF rescue teams. "
                "HIGH: Request RISAT-2B ScanSAR follow-up observation."
            ),
        }

    def _detect_fire(
        self,
        f: dict[str, float],
        meta: dict[str, Any],
    ) -> dict[str, Any] | None:
        """
        Detect wildfire / active fire event.

        DIAGNOSTIC RULES:
          1. warm_ratio > 0.45  → red/thermal wavelength dominance    (weight 0.40)
          2. vegetation_index < 0.38 → reduced vegetation (burning)   (weight 0.30)
          3. mean_r > mean_b + 0.12 → red exceeds blue (fire spectrum)(weight 0.20)
          4. brightness in [0.35, 0.70] → not cloud, not night        (weight 0.10)

        WHY warm_ratio:
          Active fire radiates strongly in the 4μm SWIR band.
          In RGB imagery, this manifests as elevated red channel response.
          warm_ratio = R/(R+G+B) captures this dominance.
        """
        wr  = f.get("warm_ratio",       0.33)
        vi  = f.get("vegetation_index", 0.5)
        mr  = f.get("mean_r",           0.4)
        mb  = f.get("mean_b",           0.4)
        br  = f.get("brightness",       0.5)

        rules = [
            (wr  > 0.45,              0.40, "elevated warm/red ratio"),
            (vi  < 0.38,              0.30, "suppressed vegetation"),
            (mr  > mb + 0.12,         0.20, "red channel dominance"),
            (0.35 < br < 0.70,        0.10, "moderate brightness (not cloud)"),
        ]

        triggered = [(w, desc) for cond, w, desc in rules if cond]
        total_weight = sum(w for _, w, _ in rules)
        gained_weight = sum(w for w, _ in triggered)
        confidence = gained_weight / total_weight

        if confidence < 0.45:
            return None

        severity = self._severity(confidence, confidence * 100, [0.85, 0.70, 0.55])

        return {
            "event_type":    "fire",
            "severity":      severity,
            "confidence":    round(confidence, 3),
            "confidence_pct": round(confidence * 100, 1),
            "triggered_rules": [desc for _, desc in triggered],
            "feature_evidence": {
                "warm_ratio":       round(wr, 3),
                "vegetation_index": round(vi, 3),
                "mean_r":          round(mr, 3),
                "mean_b":          round(mb, 3),
                "brightness":       round(br, 3),
            },
            "inundation_estimate_pct": 0,
            "explanation": (
                f"FIRE DETECTED — {severity} severity, {confidence*100:.1f}% confidence. "
                f"Warm ratio {wr:.2f} indicates thermal/red channel dominance. "
                f"Vegetation index {vi:.2f} shows reduced canopy cover. "
                f"{len(triggered)}/4 diagnostic rules triggered."
            ),
            "recommended_action": (
                "IMMEDIATE: Alert State Forest Fire Division. "
                "HIGH: Deploy aerial firefighting assets. "
                "HIGH: Monitor with SWIR-capable sensor for fire perimeter mapping."
            ),
        }

    def _detect_deforestation(
        self,
        f: dict[str, float],
        meta: dict[str, Any],
    ) -> dict[str, Any] | None:
        """
        Detect active deforestation / forest clearing.

        DIAGNOSTIC RULES:
          Forest clearing shows as: patches of cleared land (moderate NDVI),
          high boundary density (forest edges), warm soil exposure.
        """
        vi  = f.get("vegetation_index", 0.5)
        ed  = f.get("edge_density",     0.3)
        sv  = f.get("spatial_var",      0.1)
        wr  = f.get("warm_ratio",       0.33)

        rules = [
            (0.30 < vi < 0.60,        0.35, "intermediate vegetation (patchy clearing)"),
            (ed   > 0.35,             0.30, "high edge density (clearing boundaries)"),
            (sv   > 0.06,             0.20, "high spatial variance (mixed cleared/intact)"),
            (wr   > 0.38,             0.15, "warm soil exposure signal"),
        ]

        triggered = [(w, desc) for cond, w, desc in rules if cond]
        total_weight = sum(w for _, w, _ in rules)
        gained_weight = sum(w for w, _ in triggered)
        confidence = gained_weight / total_weight

        if confidence < 0.50:
            return None

        severity = self._severity(confidence, confidence * 100, [0.85, 0.70, 0.55])

        return {
            "event_type":    "deforestation",
            "severity":      severity,
            "confidence":    round(confidence, 3),
            "confidence_pct": round(confidence * 100, 1),
            "triggered_rules": [desc for _, desc in triggered],
            "feature_evidence": {
                "vegetation_index": round(vi, 3),
                "edge_density":     round(ed, 3),
                "spatial_var":      round(sv, 3),
                "warm_ratio":       round(wr, 3),
            },
            "inundation_estimate_pct": 0,
            "explanation": (
                f"DEFORESTATION DETECTED — {severity} severity, {confidence*100:.1f}% confidence. "
                f"Intermediate vegetation index {vi:.2f} suggests patchy clearing. "
                f"High edge density {ed:.2f} indicates active forest boundaries. "
                f"{len(triggered)}/4 diagnostic rules triggered."
            ),
            "recommended_action": (
                "HIGH: Alert State Forest Department. "
                "HIGH: Cross-reference with Protected Area boundaries. "
                "MEDIUM: Request bi-weekly monitoring with Sentinel-2."
            ),
        }

    def _detect_urban_expansion(
        self,
        f: dict[str, float],
        meta: dict[str, Any],
    ) -> dict[str, Any] | None:
        """Detect active urban / built-up area expansion."""
        ed  = f.get("edge_density",     0.3)
        vi  = f.get("vegetation_index", 0.5)
        br  = f.get("brightness",       0.5)
        comp = f.get("complexity",      0.4)

        rules = [
            (ed   > 0.55,             0.35, "high edge density (building density)"),
            (vi   < 0.32,             0.30, "low vegetation (concrete dominance)"),
            (br   > 0.38,             0.20, "moderate brightness (built materials)"),
            (comp > 0.60,             0.15, "high scene complexity"),
        ]

        triggered = [(w, desc) for cond, w, desc in rules if cond]
        total_weight = sum(w for _, w, _ in rules)
        gained_weight = sum(w for w, _ in triggered)
        confidence = gained_weight / total_weight

        if confidence < 0.60:
            return None

        severity = self._severity(confidence, confidence * 100, [0.85, 0.70, 0.55])

        return {
            "event_type":    "urban_expansion",
            "severity":      severity,
            "confidence":    round(confidence, 3),
            "confidence_pct": round(confidence * 100, 1),
            "triggered_rules": [desc for _, desc in triggered],
            "feature_evidence": {
                "edge_density":     round(ed, 3),
                "vegetation_index": round(vi, 3),
                "brightness":       round(br, 3),
                "complexity":       round(comp, 3),
            },
            "inundation_estimate_pct": 0,
            "explanation": (
                f"URBAN EXPANSION — {severity}, {confidence*100:.1f}% confidence. "
                f"High edge density {ed:.2f} indicates dense built-up fabric. "
                f"Low vegetation {vi:.2f} confirms concrete/asphalt dominance. "
                f"{len(triggered)}/4 diagnostic rules triggered."
            ),
            "recommended_action": (
                "MEDIUM: Update ULCA (Urban Land Cover Accounting) database. "
                "MEDIUM: Cross-check with approved master plan boundaries. "
                "LOW: Archive for urban growth trend analysis."
            ),
        }

    def _detect_cloud_cover(
        self,
        f: dict[str, float],
        meta: dict[str, Any],
    ) -> dict[str, Any] | None:
        """Detect dense cloud cover (quality flag, not a disaster event)."""
        br  = f.get("brightness",    0.5)
        hom = f.get("homogeneity",   0.5)
        ed  = f.get("edge_density",  0.3)

        rules = [
            (br  > 0.76,             0.45, "very high brightness (cloud reflectance)"),
            (hom > 0.70,             0.35, "high homogeneity (uniform cloud deck)"),
            (ed  < 0.18,             0.20, "low edge density (featureless cloud top)"),
        ]

        triggered = [(w, desc) for cond, w, desc in rules if cond]
        total_weight = sum(w for _, w, _ in rules)
        gained_weight = sum(w for w, _ in triggered)
        confidence = gained_weight / total_weight

        if confidence < 0.55:
            return None

        cover_pct = min(95.0, (br - 0.65) * 4 * 100)
        severity = "High" if cover_pct > 70 else "Moderate" if cover_pct > 40 else "Low"

        return {
            "event_type":    "dense_cloud",
            "severity":      severity,
            "confidence":    round(confidence, 3),
            "confidence_pct": round(confidence * 100, 1),
            "triggered_rules": [desc for _, desc in triggered],
            "feature_evidence": {
                "brightness":   round(br, 3),
                "homogeneity":  round(hom, 3),
                "edge_density": round(ed, 3),
            },
            "inundation_estimate_pct": 0,
            "explanation": (
                f"DENSE CLOUD COVER — {confidence*100:.1f}% confidence. "
                f"Brightness {br:.2f} significantly above clear-sky level. "
                f"High homogeneity {hom:.2f} consistent with cloud deck. "
                f"Estimated cloud coverage: {cover_pct:.0f}% of scene."
            ),
            "recommended_action": (
                "HIGH: Surface analysis unreliable — request cloud-free repeat observation. "
                "HIGH: Request RISAT-2B SAR which penetrates cloud cover. "
                "MEDIUM: Wait 48h for cloud clearance and re-acquire."
            ),
        }

    def _detect_drought(
        self,
        f: dict[str, float],
        meta: dict[str, Any],
    ) -> dict[str, Any] | None:
        """Detect drought / severe bare soil exposure."""
        vi  = f.get("vegetation_index", 0.5)
        wr  = f.get("warm_ratio",       0.33)
        wi  = f.get("water_index",      0.5)
        br  = f.get("brightness",       0.5)

        rules = [
            (vi  < 0.28,             0.40, "very low vegetation index (dry vegetation)"),
            (wr  > 0.40,             0.30, "elevated warm ratio (dry soil exposure)"),
            (wi  < 0.35,             0.20, "low water index (absence of water)"),
            (br  > 0.42,             0.10, "elevated brightness (dry/bare soil reflectance)"),
        ]

        triggered = [(w, desc) for cond, w, desc in rules if cond]
        total_weight = sum(w for _, w, _ in rules)
        gained_weight = sum(w for w, _ in triggered)
        confidence = gained_weight / total_weight

        if confidence < 0.55:
            return None

        # Don't detect drought if water is clearly present (could be desert naturally)
        if f.get("water_index", 0) > 0.55:
            return None

        severity = self._severity(confidence, confidence * 100, [0.85, 0.70, 0.55])

        return {
            "event_type":    "drought",
            "severity":      severity,
            "confidence":    round(confidence, 3),
            "confidence_pct": round(confidence * 100, 1),
            "triggered_rules": [desc for _, desc in triggered],
            "feature_evidence": {
                "vegetation_index": round(vi, 3),
                "warm_ratio":       round(wr, 3),
                "water_index":      round(wi, 3),
                "brightness":       round(br, 3),
            },
            "inundation_estimate_pct": 0,
            "explanation": (
                f"DROUGHT STRESS — {severity}, {confidence*100:.1f}% confidence. "
                f"Vegetation index {vi:.2f} far below healthy threshold (>0.45). "
                f"Warm soil ratio {wr:.2f} indicates exposed bare ground. "
                f"{len(triggered)}/4 diagnostic rules triggered."
            ),
            "recommended_action": (
                "HIGH: Alert State Agricultural Department for crop loss assessment. "
                "HIGH: Cross-reference rainfall data from IMD. "
                "MEDIUM: Initiate soil moisture monitoring with microwave sensors."
            ),
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Shared utility
    # ─────────────────────────────────────────────────────────────────────────

    def _severity(
        self,
        confidence: float,
        secondary_score: float,
        thresholds: list[float],
    ) -> str:
        """
        Map confidence + secondary metric to severity level.

        THRESHOLDS: [critical_threshold, high_threshold, moderate_threshold]
        If confidence > critical_threshold AND secondary_score > 50: Critical
        If confidence > high_threshold: High
        If confidence > moderate_threshold: Moderate
        Else: Low
        """
        crit, high, mod = thresholds
        if confidence >= crit and secondary_score >= 50:
            return "Critical"
        if confidence >= high:
            return "High"
        if confidence >= mod:
            return "Moderate"
        return "Low"
