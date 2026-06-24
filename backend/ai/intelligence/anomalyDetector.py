"""
AKSHA Earth Intelligence Platform — Anomaly Detector
=====================================================

PURPOSE:
  Detect general anomalies beyond flood — including fire/burn scars,
  deforestation, urban expansion, bare soil exposure, and cloud cover.

WHY IT EXISTS:
  Not all significant Earth observation events are floods. ISRO's NRSC
  monitors a wide range of change detection scenarios:
    • Forest fire burn scars (Uttarakhand, Northeast India)
    • Rapid urban expansion (Delhi, Bangalore periphery)
    • Deforestation (Western Ghats, Andaman Islands)
    • Agricultural burning (Punjab stubble burning)
    • Glacier retreat (Himalayan glaciers)

AI CONCEPT DEMONSTRATED:
  Multi-class anomaly detection. Each detector checks for a specific
  deviation from "typical" land cover for a scene type. This is related to:
    • One-class SVM (detect anomalies vs a "normal" distribution)
    • Isolation Forest (anomaly = short isolation path in random trees)
    • Autoencoder reconstruction error (anomaly = high reconstruction error)

PRODUCTION REPLACEMENT:
  Change detection models comparing two-date composites:
    • COBRA (Change Detection Based on Random Forests)
    • U-Net binary change detection
    • VHR change detection using Cartosat-3 pairs

INPUTS:
  features: dict from FeatureExtractor

OUTPUTS:
  list of Anomaly objects (may be empty if no anomalies detected)

PIPELINE POSITION:
  Event Detector → [Anomaly Detector ← HERE] → Confidence Engine
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Anomaly:
    """Represents a detected non-flood anomaly."""
    anomaly_type:  str    # "fire", "deforestation", "urban_expansion", "bare_soil", "dense_cloud"
    severity:      str    # "Low", "Moderate", "High"
    confidence:    float  # 0.0 – 1.0
    feature_value: float  # The key feature value that triggered detection
    explanation:   str
    recommended_action: str


class AnomalyDetector:
    """
    Detects non-flood anomalies using rule-based feature thresholds.

    Each detector method checks a specific hypothesis about the scene
    and returns an Anomaly if the evidence is strong enough.
    """

    def detect(self, features: dict[str, Any]) -> list[Anomaly]:
        """
        Run all anomaly detectors and return any detected events.

        Args:
          features: Feature dict from FeatureExtractor

        Returns:
          list of Anomaly objects (may be empty)
        """
        anomalies: list[Anomaly] = []

        fire = self._detect_fire(features)
        if fire:
            anomalies.append(fire)

        deforestation = self._detect_deforestation(features)
        if deforestation:
            anomalies.append(deforestation)

        urban = self._detect_urban_expansion(features)
        if urban:
            anomalies.append(urban)

        cloud = self._detect_dense_cloud(features)
        if cloud:
            anomalies.append(cloud)

        return anomalies

    def _detect_fire(self, features: dict[str, Any]) -> Anomaly | None:
        """
        Detect fire / burn scar from spectral and texture features.

        Fire indicators (RGB imagery):
          • Low NIR reflection (RGB proxy: low mean_g, low mean_b)
          • High red reflection from fire glow
          • High contrast (fire boundary with unburnt vegetation)
          • Low vegetation index (burn suppresses NDVI)
          • High texture entropy (char patterns are complex)

        Burn scar indicators (post-fire):
          • Very dark pixels (high absorption by char)
          • Low vegetation index
          • High contrast (char vs remaining vegetation)
        """
        veg_idx    = features.get("vegetation_index", 0.5)
        warm_ratio = features.get("warm_ratio", 0.4)
        brightness = features.get("brightness", 0.5)
        contrast   = features.get("contrast", 0.3)
        mean_r     = features.get("mean_r", 0.4)
        mean_b     = features.get("mean_b", 0.4)

        # Fire: warm (high red), dark-medium overall, low vegetation
        if (warm_ratio > 0.50 and veg_idx < 0.35 and brightness < 0.55
                and mean_r > mean_b + 0.12):
            conf = min(0.92, warm_ratio * 0.5 + (1.0 - veg_idx) * 0.3 + (0.35 - veg_idx) * 0.2)
            if conf > 0.40:
                return Anomaly(
                    anomaly_type="fire",
                    severity="High" if conf > 0.75 else "Moderate",
                    confidence=round(conf, 3),
                    feature_value=round(warm_ratio, 3),
                    explanation=(
                        f"Possible fire or burn scar: warm spectral ratio {warm_ratio:.2f}, "
                        f"vegetation index {veg_idx:.2f} (suppressed). "
                        f"Red channel dominance with dark overall brightness suggests "
                        f"active fire glow or post-fire char signature."
                    ),
                    recommended_action="Cross-check with MODIS FIRMS fire detection; schedule RISAT-2B nocturnal SAR pass.",
                )
        return None

    def _detect_deforestation(self, features: dict[str, Any]) -> Anomaly | None:
        """
        Detect potential deforestation — abrupt vegetation loss.

        In the absence of a pre-event reference image, we look for
        mixed vegetation + bare soil signatures that might indicate
        recent clearing:
          • Moderate-low vegetation index (some canopy remaining)
          • Moderate warm ratio (exposed soil)
          • Medium-high contrast (cleared patches next to standing forest)
          • High edge density (clearing boundaries)
        """
        veg_idx    = features.get("vegetation_index", 0.5)
        edge_dens  = features.get("edge_density",    0.3)
        warm_ratio = features.get("warm_ratio",       0.4)
        spatial_var= features.get("spatial_variance", 0.1)

        # Deforestation: medium vegetation loss + high spatial contrast
        if (0.30 < veg_idx < 0.60 and edge_dens > 0.45 and
                warm_ratio > 0.40 and spatial_var > 0.08):
            conf = min(0.85, edge_dens * 0.4 + (0.6 - veg_idx) * 0.3 + spatial_var * 2)
            if conf > 0.38:
                return Anomaly(
                    anomaly_type="deforestation",
                    severity="Moderate" if conf < 0.70 else "High",
                    confidence=round(conf, 3),
                    feature_value=round(veg_idx, 3),
                    explanation=(
                        f"Possible deforestation signature: vegetation index {veg_idx:.2f} "
                        f"with high edge density {edge_dens:.2f} suggests fragmented canopy. "
                        f"Spatial variance {spatial_var:.3f} indicates patchy land cover "
                        f"typical of partial forest clearing."
                    ),
                    recommended_action="Compare with ISRO AWiFS vegetation archive; compute bi-annual NDVI trend.",
                )
        return None

    def _detect_urban_expansion(self, features: dict[str, Any]) -> Anomaly | None:
        """
        Detect urban / built-up area expansion.

        Urban areas have:
          • High edge density (road network, building boundaries)
          • Moderate brightness (concrete, asphalt, roof materials)
          • Low vegetation
          • High texture contrast
          • Moderate-high spatial variance (heterogeneous urban fabric)
        """
        edge_dens  = features.get("edge_density", 0.3)
        veg_idx    = features.get("vegetation_index", 0.5)
        brightness = features.get("brightness", 0.5)
        contrast   = features.get("contrast", 0.3)

        if (edge_dens > 0.60 and veg_idx < 0.30 and
                0.35 < brightness < 0.80 and contrast > 0.45):
            conf = min(0.90, edge_dens * 0.5 + (0.30 - veg_idx) * 0.3 + contrast * 0.2)
            if conf > 0.42:
                return Anomaly(
                    anomaly_type="urban_expansion",
                    severity="Low" if conf < 0.65 else "Moderate",
                    confidence=round(conf, 3),
                    feature_value=round(edge_dens, 3),
                    explanation=(
                        f"High urban density signature: edge density {edge_dens:.2f} "
                        f"with suppressed vegetation ({veg_idx:.2f}). "
                        f"Pattern consistent with dense built-up fabric. "
                        f"Cross-reference with settlement boundary data."
                    ),
                    recommended_action="Generate urban growth index using Cartosat-3 time series; compare with master plan.",
                )
        return None

    def _detect_dense_cloud(self, features: dict[str, Any]) -> Anomaly | None:
        """
        Detect dense cloud cover that may obscure surface features.

        Clouds are:
          • Very bright (high reflectance across all bands)
          • Uniform / homogeneous
          • Low edge density (except at cloud boundaries)
          • Low vegetation and water signal
        """
        brightness = features.get("brightness", 0.5)
        homogen    = features.get("homogeneity", 0.5)
        veg_idx    = features.get("vegetation_index", 0.5)
        water_idx  = features.get("water_index", 0.5)

        if brightness > 0.78 and homogen > 0.65:
            # Estimate cloud fraction from brightness + homogeneity
            cloud_fraction = min(0.98, brightness * 0.6 + homogen * 0.3)
            conf = min(0.95, cloud_fraction)
            return Anomaly(
                anomaly_type="dense_cloud",
                severity="High" if cloud_fraction > 0.80 else "Moderate",
                confidence=round(conf, 3),
                feature_value=round(brightness, 3),
                explanation=(
                    f"Dense cloud cover detected: brightness {brightness:.2f}, "
                    f"homogeneity {homogen:.2f}. Estimated {round(cloud_fraction*100)}% cloud coverage. "
                    f"Surface features may be obscured — recommend SAR acquisition for cloud-penetrating imagery."
                ),
                recommended_action="Switch to SAR (RISAT-2B or Sentinel-1) which penetrates cloud cover; reschedule optical acquisition.",
            )
        return None
