"""
AKSHA Earth Intelligence Platform — Confidence Engine
=====================================================

PURPOSE:
  Compute an overall confidence level for the intelligence pipeline output
  using multiple evidence signals: similarity score, feature consistency,
  metadata quality, and historical agreement.

WHY IT EXISTS:
  A single number ("94% match") is not enough for operational decision-making.
  Analysts need to know WHY the system is confident:
    • Is it because the image features are very distinctive?
    • Is it because multiple archive scenes agree?
    • Is it because the metadata (satellite, date, location) is high quality?
    • Is it because the detected events are corroborated by historical data?

  Breaking confidence into components makes the AI explainable and
  actionable — analysts can identify which component to strengthen.

AI CONCEPT DEMONSTRATED:
  Calibrated confidence estimation. Modern ML systems often produce
  overconfident predictions — high probability even when wrong. Calibration
  techniques (Platt scaling, isotonic regression, temperature scaling)
  adjust raw model scores to match true empirical frequencies.

  This module demonstrates manual calibration:
    • Similarity alone is overconfident (embedding similarity ≠ semantic similarity)
    • We temper with feature consistency and metadata quality signals
    • Historical agreement adds a "prior" based on known event patterns

PRODUCTION REPLACEMENT:
  Conformal prediction: a calibrated framework that guarantees coverage
  probability. Given a confidence interval [low, high], the true answer
  falls within it with specified probability (e.g., 90%).

INPUTS:
  similarity:   float [0,1] — top cosine similarity score
  feature_consistency: float [0,1] — how consistent extracted features are
  metadata_quality:    float [0,1] — completeness of available metadata
  historical_agreement: float [0,1] — fraction of top-K results in same event category

OUTPUTS:
  ConfidenceReport: overall level, component scores, explanation

PIPELINE POSITION:
  Event Detection → [Confidence Engine ← HERE] → Report Generation
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class ConfidenceReport:
    """Full confidence analysis with component breakdown."""
    overall:    float   # 0.0 – 1.0 composite score
    level:      str     # "Low", "Medium", "High"
    components: dict[str, float]   # component name → score
    explanation: str
    limitations: list[str]


class ConfidenceEngine:
    """
    Computes multi-signal confidence for the intelligence pipeline output.

    Component weights sum to 1.0:
      similarity:          0.40 (dominant signal — embedding match quality)
      feature_consistency: 0.25 (are extracted features coherent?)
      historical_agreement:0.25 (does the top-K archive support the finding?)
      metadata_quality:    0.10 (how complete is the metadata?)
    """

    WEIGHTS = {
        "similarity":           0.40,
        "feature_consistency":  0.25,
        "historical_agreement": 0.25,
        "metadata_quality":     0.10,
    }

    def compute(
        self,
        similarity: float,
        feature_consistency: float,
        metadata_quality: float,
        historical_agreement: float,
    ) -> ConfidenceReport:
        """
        Compute weighted confidence score from four input signals.

        Args:
          similarity:           Top cosine similarity score (0–1)
          feature_consistency:  Measure of feature coherence (0–1)
          metadata_quality:     Metadata completeness score (0–1)
          historical_agreement: Top-K result category agreement (0–1)

        Returns:
          ConfidenceReport with overall score, level, components, explanation
        """
        components = {
            "similarity":           float(similarity),
            "feature_consistency":  float(feature_consistency),
            "historical_agreement": float(historical_agreement),
            "metadata_quality":     float(metadata_quality),
        }

        # Weighted sum
        overall = sum(
            self.WEIGHTS[k] * v for k, v in components.items()
        )
        overall = min(0.99, max(0.01, overall))

        level = self._classify(overall)
        explanation = self._explain(overall, level, components)
        limitations = self._identify_limitations(components)

        return ConfidenceReport(
            overall=round(overall, 3),
            level=level,
            components={k: round(v, 3) for k, v in components.items()},
            explanation=explanation,
            limitations=limitations,
        )

    def compute_feature_consistency(self, features: dict[str, float]) -> float:
        """
        Estimate internal consistency of the feature vector.

        A coherent scene (e.g., open water) will have consistent signals:
          high water index AND low vegetation AND smooth texture AND blue dominant.

        An incoherent scene (e.g., partial cloud) will have contradictory signals.
        We measure coherence as 1 - mean pairwise contradiction score.
        """
        water    = features.get("water_index",       0.5)
        veg      = features.get("vegetation_index",  0.5)
        bright   = features.get("brightness",        0.5)
        edge     = features.get("edge_density",      0.5)
        homogen  = features.get("homogeneity",       0.5)

        contradictions = []

        # Water and vegetation should be inversely related
        if water > 0.6 and veg > 0.6:
            contradictions.append(0.3)  # Both high → unusual, contradictory

        # High brightness with high water → cloud or snow, not flood
        if bright > 0.75 and water > 0.65:
            contradictions.append(0.2)

        # High edge density with very high homogeneity → contradictory
        if edge > 0.7 and homogen > 0.8:
            contradictions.append(0.25)

        contradiction_score = min(1.0, sum(contradictions))
        return max(0.0, 1.0 - contradiction_score)

    def compute_metadata_quality(self, metadata: dict[str, Any]) -> float:
        """
        Score metadata completeness on a 0–1 scale.

        High-quality metadata includes: satellite name, acquisition date,
        geographic coordinates, sensor type, and processing level.
        Missing fields reduce the score.
        """
        checks = [
            ("satellite",        0.20),  # Essential for provenance
            ("acquisition_date", 0.20),  # Essential for temporal reasoning
            ("coords",           0.25),  # Essential for spatial search
            ("sensor_type",      0.15),  # Important for cross-modal matching
            ("processing_level", 0.10),  # Important for radiometric consistency
            ("resolution",       0.10),  # Important for scale matching
        ]

        score = 0.0
        for field, weight in checks:
            val = metadata.get(field)
            if val and val not in ("Unknown", "Unknown Satellite", None, ""):
                score += weight
                # Bonus for high-quality coords (non-zero, non-default)
                if field == "coords" and isinstance(val, dict):
                    if abs(val.get("lat", 0)) > 0.01 or abs(val.get("lng", 0)) > 0.01:
                        score += 0.05  # Coords are specific, not default 0,0

        return min(1.0, score)

    def compute_historical_agreement(self, results: list[Any]) -> float:
        """
        Compute agreement score from top-K search results.

        If the top-5 results all have the same event_type (e.g., all flood),
        confidence is higher than if results are mixed across categories.

        Agreement = fraction of top-5 results with the most common category.
        """
        if not results:
            return 0.5

        top5 = results[:5]
        event_types = [r.entry.get("profile", "mixed") for r in top5]

        # Count most common category
        from collections import Counter
        counts = Counter(event_types)
        most_common_count = counts.most_common(1)[0][1]
        agreement = most_common_count / len(top5)

        # High agreement → high confidence; low agreement → uncertain
        return float(agreement)

    def _classify(self, score: float) -> str:
        """Classify overall score into a named confidence level."""
        if score >= 0.75:
            return "High"
        elif score >= 0.50:
            return "Medium"
        return "Low"

    def _explain(
        self,
        overall: float,
        level: str,
        components: dict[str, float],
    ) -> str:
        """Generate natural-language confidence explanation."""
        pct = round(overall * 100, 1)
        strongest = max(components, key=components.get)
        weakest   = min(components, key=components.get)
        comp_pct  = {k: round(v*100,1) for k, v in components.items()}

        return (
            f"{level} confidence ({pct}%). "
            f"Strongest signal: {strongest} ({comp_pct[strongest]}%). "
            f"Weakest signal: {weakest} ({comp_pct[weakest]}%). "
            f"Similarity: {comp_pct['similarity']}%, "
            f"Feature coherence: {comp_pct['feature_consistency']}%, "
            f"Historical agreement: {comp_pct['historical_agreement']}%, "
            f"Metadata quality: {comp_pct['metadata_quality']}%."
        )

    def _identify_limitations(
        self,
        components: dict[str, float],
    ) -> list[str]:
        """Identify confidence-limiting factors for analyst review."""
        limitations = []
        if components["metadata_quality"] < 0.50:
            limitations.append("Incomplete metadata — coordinates or acquisition date missing")
        if components["feature_consistency"] < 0.60:
            limitations.append("Mixed feature signals — scene may contain multiple land cover types")
        if components["similarity"] < 0.55:
            limitations.append("Low archive similarity — scene may be novel or underrepresented in archive")
        if components["historical_agreement"] < 0.50:
            limitations.append("Diverse top-K results — event type is uncertain")
        if not limitations:
            limitations.append("No significant limitations identified")
        return limitations
