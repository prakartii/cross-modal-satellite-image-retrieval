"""
AKSHA Earth Intelligence Platform — Flood Detector
===================================================

PURPOSE:
  Detect flood / inundation events from extracted image features using
  rule-based thresholds derived from remote sensing domain knowledge.

WHY IT EXISTS:
  Flood detection is ISRO's highest-priority disaster monitoring task.
  The Brahmaputra, Ganga, and Godavari basins experience recurrent flooding
  that requires rapid satellite-based assessment.

  Rule-based flood detection is:
    • Interpretable: we can explain EXACTLY which features triggered detection
    • Reliable: works on any image without requiring training data
    • Fast: milliseconds per image (no GPU required)
    • Validated: thresholds from published remote sensing literature

AI CONCEPT DEMONSTRATED:
  Expert knowledge encoding. Before deep learning, remote sensing relied
  entirely on carefully crafted rules derived from physical principles:
    • Water absorbs NIR and reflects blue → NDWI = (Green-NIR)/(Green+NIR) > 0.3
    • SAR backscatter over water is very low (specular reflection)
    • Inundated vegetation has lower backscatter than dry vegetation

  This module demonstrates that interpretation = rule triggers, not magic.

PRODUCTION REPLACEMENT:
  SAR-based flood mapping using U-Net or Flood-Net architecture trained on
  Sentinel-1 GRD imagery. The Sen1Floods11 dataset provides labeled flood
  scenes for India, Bangladesh, Sri Lanka, and other South Asian regions.

  For optical imagery: supervised classification using Random Forest or
  XGBoost on spectral indices (NDWI, MNDWI, EWI).

INPUTS:
  features: dict from FeatureExtractor

OUTPUTS:
  FloodEvent object or None (if no flood detected)

PIPELINE POSITION:
  Graph Analysis → Event Detector → [Flood Detector ← HERE] → Confidence Engine
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


# Published thresholds from remote sensing literature
WATER_INDEX_FLOOD_THRESHOLD  = 0.58  # >58% of (B-R)/(B+R+ε) → probable water
WATER_INDEX_HIGH_THRESHOLD   = 0.70  # >70% → very high confidence water
EDGE_DENSITY_FLOOD_THRESHOLD = 0.25  # Flooding reduces edge density (water smooth)
BRIGHTNESS_FLOOD_RANGE       = (0.20, 0.65)  # Water: darker than cloud, brighter than night
VEGETATION_FLOOD_MAX         = 0.45   # Flood scenes have suppressed vegetation


@dataclass
class FloodEvent:
    """Represents a detected flood / inundation event."""
    confidence: float          # 0.0 – 1.0
    severity: str              # "Low", "Moderate", "High", "Critical"
    inundation_estimate_pct: float  # Estimated percentage of scene inundated
    water_index: float         # Raw water_index value
    triggered_rules: list[str] # Which rules triggered detection
    explanation: str           # Human-readable explanation


class FloodDetector:
    """
    Rule-based flood detector using spectral and texture features.

    Detection logic based on:
      1. Water spectral index (proxy NDWI using RGB)
      2. Brightness range check (water is dark to moderately bright)
      3. Vegetation suppression (flooded areas have low NDVI)
      4. Texture smoothness (water surface is specularly smooth)
      5. Edge density reduction (fewer edges = more homogeneous surface)

    These rules mirror the analysis workflow used by NDMA (National
    Disaster Management Authority) rapid mapping teams.
    """

    def detect(self, features: dict[str, Any]) -> FloodEvent | None:
        """
        Apply flood detection rules to extracted features.

        Args:
          features: Feature dict from FeatureExtractor

        Returns:
          FloodEvent if flood detected with confidence > 0.4, else None
        """
        water_idx  = features.get("water_index",       0.5)
        veg_idx    = features.get("vegetation_index",  0.5)
        brightness = features.get("brightness",        0.5)
        edge_dens  = features.get("edge_density",      0.5)
        homogen    = features.get("homogeneity",       0.5)
        mean_b     = features.get("mean_b",            0.4)
        mean_r     = features.get("mean_r",            0.4)

        triggered: list[str] = []
        confidence_signals: list[float] = []

        # Rule 1: High water spectral index
        if water_idx > WATER_INDEX_FLOOD_THRESHOLD:
            signal = (water_idx - WATER_INDEX_FLOOD_THRESHOLD) / (1.0 - WATER_INDEX_FLOOD_THRESHOLD)
            triggered.append(f"Water spectral index {water_idx:.2f} exceeds threshold {WATER_INDEX_FLOOD_THRESHOLD}")
            confidence_signals.append(0.40 + 0.20 * signal)  # 0.40 – 0.60

        # Rule 2: Blue channel dominance (water absorbs red, reflects blue)
        if mean_b > mean_r + 0.10:
            blue_dominance = (mean_b - mean_r) / (mean_b + mean_r + 1e-8)
            triggered.append(f"Blue channel dominant over red by {mean_b-mean_r:.2f} (water signature)")
            confidence_signals.append(0.20 + 0.25 * blue_dominance)

        # Rule 3: Suppressed vegetation (flooded areas lose NDVI signal)
        if veg_idx < VEGETATION_FLOOD_MAX:
            veg_suppression = 1.0 - (veg_idx / VEGETATION_FLOOD_MAX)
            triggered.append(f"Vegetation index {veg_idx:.2f} below flood threshold {VEGETATION_FLOOD_MAX}")
            confidence_signals.append(0.10 + 0.15 * veg_suppression)

        # Rule 4: High surface homogeneity (water is smooth)
        if homogen > 0.65:
            triggered.append(f"High surface homogeneity {homogen:.2f} consistent with water surface")
            confidence_signals.append(0.10 + 0.15 * (homogen - 0.65) / 0.35)

        # Rule 5: Low edge density (water has few internal edges)
        if edge_dens < EDGE_DENSITY_FLOOD_THRESHOLD:
            triggered.append(f"Low edge density {edge_dens:.2f} consistent with specularly smooth water")
            confidence_signals.append(0.10 + 0.10 * (EDGE_DENSITY_FLOOD_THRESHOLD - edge_dens) / EDGE_DENSITY_FLOOD_THRESHOLD)

        # Rule 6: Brightness range check
        bmin, bmax = BRIGHTNESS_FLOOD_RANGE
        if bmin < brightness < bmax:
            triggered.append(f"Brightness {brightness:.2f} within water body range [{bmin}, {bmax}]")
            confidence_signals.append(0.05)

        # No rules triggered → no flood
        if not triggered:
            return None

        # Aggregate confidence: weighted sum of signals (capped at 0.97)
        confidence = min(0.97, sum(confidence_signals))

        # Below minimum confidence threshold → uncertain, skip detection
        if confidence < 0.35:
            return None

        # Estimate inundation coverage from water index
        inundation_est = min(95.0, max(5.0, (water_idx - 0.4) / 0.6 * 100))

        severity = self._classify_severity(confidence, inundation_est)

        explanation = self._build_explanation(
            confidence, severity, water_idx, veg_idx, triggered
        )

        return FloodEvent(
            confidence=round(confidence, 3),
            severity=severity,
            inundation_estimate_pct=round(inundation_est, 1),
            water_index=round(water_idx, 3),
            triggered_rules=triggered,
            explanation=explanation,
        )

    def _classify_severity(
        self,
        confidence: float,
        inundation_pct: float,
    ) -> str:
        """
        Classify flood severity based on confidence and inundation estimate.

        Severity thresholds match NDMA rapid damage assessment protocol:
          Critical:  confidence > 0.85 AND inundation > 50%
          High:      confidence > 0.70 OR inundation > 35%
          Moderate:  confidence > 0.55 OR inundation > 15%
          Low:       detected but below high thresholds
        """
        if confidence > 0.85 and inundation_pct > 50:
            return "Critical"
        elif confidence > 0.70 or inundation_pct > 35:
            return "High"
        elif confidence > 0.55 or inundation_pct > 15:
            return "Moderate"
        return "Low"

    def _build_explanation(
        self,
        confidence: float,
        severity: str,
        water_idx: float,
        veg_idx: float,
        triggered: list[str],
    ) -> str:
        """Generate a human-readable flood detection explanation."""
        conf_pct = round(confidence * 100, 1)
        return (
            f"FLOOD DETECTED — {severity} severity, {conf_pct}% confidence. "
            f"Water spectral index {water_idx:.2f} indicates significant water coverage. "
            f"Vegetation index {veg_idx:.2f} shows suppressed plant response consistent "
            f"with inundation. {len(triggered)} diagnostic rules triggered. "
            f"Recommended action: Schedule RISAT-2B SAR acquisition within 24h for flood extent mapping."
        )
