"""
AKSHA Earth Intelligence Platform — Event Detector (Orchestrator)
=================================================================

PURPOSE:
  Orchestrate flood and anomaly detectors, merge results, and return
  a unified list of detected events with structured metadata.

PIPELINE POSITION:
  Graph Analysis → [Event Detection ← HERE] → Confidence Engine → Report
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ai.intelligence.floodDetector import FloodDetector
from ai.intelligence.anomalyDetector import AnomalyDetector


@dataclass
class DetectedEvent:
    """Unified event object from any detector."""
    event_type:  str     # "flood", "fire", "deforestation", "urban_expansion", "dense_cloud"
    severity:    str     # "Low", "Moderate", "High", "Critical"
    confidence:  float   # 0.0 – 1.0
    explanation: str
    recommended_action: str
    feature_evidence: dict[str, float]  # Key features that triggered detection


class EventDetector:
    """
    Orchestrates all event detectors and returns merged DetectedEvent list.
    """

    def __init__(self) -> None:
        self._flood    = FloodDetector()
        self._anomaly  = AnomalyDetector()

    def detect(
        self,
        features: dict[str, Any],
        metadata: dict[str, Any] | None = None,
    ) -> list[DetectedEvent]:
        """
        Run all detectors and return detected events sorted by confidence.

        Args:
          features: Feature dict from FeatureExtractor
          metadata: Optional scene metadata for context

        Returns:
          List of DetectedEvent, sorted by descending confidence
        """
        events: list[DetectedEvent] = []

        # Run flood detector (highest priority for ISRO monitoring)
        flood = self._flood.detect(features)
        if flood:
            events.append(DetectedEvent(
                event_type="flood",
                severity=flood.severity,
                confidence=flood.confidence,
                explanation=flood.explanation,
                recommended_action="Schedule RISAT-2B ScanSAR acquisition within 24h. Notify NDMA Situation Room. Activate state SDMA coordination.",
                feature_evidence={
                    "water_index":        features.get("water_index", 0),
                    "vegetation_index":   features.get("vegetation_index", 0),
                    "brightness":         features.get("brightness", 0),
                    "homogeneity":        features.get("homogeneity", 0),
                    "edge_density":       features.get("edge_density", 0),
                },
            ))

        # Run anomaly detectors
        anomalies = self._anomaly.detect(features)
        for anom in anomalies:
            events.append(DetectedEvent(
                event_type=anom.anomaly_type,
                severity=anom.severity,
                confidence=anom.confidence,
                explanation=anom.explanation,
                recommended_action=anom.recommended_action,
                feature_evidence={
                    "vegetation_index": features.get("vegetation_index", 0),
                    "water_index":      features.get("water_index", 0),
                    "brightness":       features.get("brightness", 0),
                    "edge_density":     features.get("edge_density", 0),
                },
            ))

        # Sort by confidence descending
        events.sort(key=lambda e: e.confidence, reverse=True)
        return events
