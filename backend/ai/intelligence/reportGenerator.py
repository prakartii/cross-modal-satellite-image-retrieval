"""
AKSHA Earth Intelligence Platform — Mission Report Generator
============================================================

PURPOSE:
  Generate a structured Mission Intelligence Report summarizing all
  pipeline outputs: detected events, confidence, search results,
  and recommended actions for field operations teams.

WHY IT EXISTS:
  Raw pipeline outputs (embeddings, similarity scores, feature vectors)
  are not useful for decision-makers. They need:
    • A clear summary of what the AI found
    • Confidence levels with explanations
    • Actionable recommendations (which satellite to schedule, who to notify)
    • Historical context (has this happened before?)
    • A timeline of the intelligence process

  This module bridges the gap between AI computation and human action.

AI CONCEPT DEMONSTRATED:
  Template-based Natural Language Generation (NLG). Before large language
  models (GPT-4, Gemini), NLG used template systems with conditional
  logic to produce domain-specific text. This is still used in production
  for high-stakes domains where exact phrasing matters:
    • Aviation NOTAM (Notice to Airmen) generation
    • Medical report generation
    • Financial regulatory filings
    • Military intelligence reporting (the original use case)

PRODUCTION REPLACEMENT:
  Integrate with Claude (claude-opus-4 or claude-sonnet-4) to generate
  richer, more contextual reports that draw on broader knowledge.
  The structured data (events, results, confidence) becomes the context
  for the LLM, which generates natural prose. The interface (data in →
  report dict out) remains identical.

INPUTS:
  features:   dict from FeatureExtractor
  results:    list of SearchResult from search pipeline
  events:     list of DetectedEvent from EventDetector
  confidence: ConfidenceReport from ConfidenceEngine
  metadata:   dict from MetadataParser

OUTPUTS:
  MissionReport dict — fully structured for frontend rendering

PIPELINE POSITION:
  Confidence Engine → [Report Generation ← HERE] → Dashboard Update
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from ai.intelligence.confidenceEngine import ConfidenceReport
from ai.intelligence.eventDetector import DetectedEvent
from ai.search.semanticSearch import SearchResult


class ReportGenerator:
    """
    Generates structured Mission Intelligence Reports from pipeline outputs.
    """

    def generate(
        self,
        features: dict[str, Any],
        results: list[SearchResult],
        events: list[DetectedEvent],
        confidence: ConfidenceReport,
        metadata: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Assemble the complete Mission Intelligence Report.

        Args:
          features:   Extracted image features
          results:    Ranked search results
          events:     Detected events
          confidence: Confidence analysis
          metadata:   Scene metadata

        Returns:
          JSON-serializable report dict
        """
        now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        primary_event = events[0] if events else None

        report = {
            "generated_at":    now,
            "mission_id":      metadata.get("scene_id", f"AKSHA_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"),
            "analyst_version": "AKSHA-AI v1.0 · ISRO Earth Intelligence Platform",

            # ── Executive Summary ──────────────────────────────────────────
            "executive_summary": self._executive_summary(primary_event, confidence, metadata, results),

            # ── Scene Metadata ─────────────────────────────────────────────
            "scene_metadata": {
                "satellite":        metadata.get("satellite", "Unknown"),
                "sensor_type":      metadata.get("sensor_type", "Optical"),
                "acquisition_date": metadata.get("acquisition_date", "Unknown"),
                "region":           metadata.get("region", "Unknown Region"),
                "coordinates":      metadata.get("coords", {"lat": 0, "lng": 0}),
                "resolution":       metadata.get("resolution", "Unknown"),
                "cloud_cover_pct":  metadata.get("cloud_cover", 0),
                "scene_id":         metadata.get("scene_id", ""),
                "archive_source":   metadata.get("archive_source", "ISRO Bhuvan"),
                "processing_level": metadata.get("processing_level", "L1B"),
            },

            # ── Detected Events ────────────────────────────────────────────
            "detected_events": [
                {
                    "event_type":    e.event_type,
                    "severity":      e.severity,
                    "confidence":    round(e.confidence * 100, 1),
                    "explanation":   e.explanation,
                    "recommended_action": e.recommended_action,
                    "feature_evidence": {k: round(v, 3) for k, v in e.feature_evidence.items()},
                }
                for e in events
            ],

            # ── Search Results Summary ─────────────────────────────────────
            "search_summary": {
                "total_matches":      len(results),
                "top_match_score":    round(results[0].similarity * 100, 1) if results else 0,
                "archive_size":       50,  # Our synthetic archive
                "top_matches": [
                    {
                        "rank":       r.rank,
                        "similarity": round(r.similarity * 100, 1),
                        "satellite":  r.entry["satellite"],
                        "location":   r.entry["location"]["name"],
                        "date":       r.entry["timestamp"],
                        "event_type": r.entry.get("event_type", ""),
                        "event_label": r.entry.get("event_label", ""),
                    }
                    for r in results[:5]
                ],
            },

            # ── Confidence Report ──────────────────────────────────────────
            "confidence": {
                "overall":    round(confidence.overall * 100, 1),
                "level":      confidence.level,
                "components": {k: round(v*100,1) for k, v in confidence.components.items()},
                "explanation": confidence.explanation,
                "limitations": confidence.limitations,
            },

            # ── Feature Analysis ───────────────────────────────────────────
            "feature_analysis": {
                "water_coverage_pct":      round(features.get("water_index", 0.5) * 100, 1),
                "vegetation_coverage_pct": round(max(0, features.get("vegetation_index", 0.5)) * 100, 1),
                "edge_density_pct":        round(features.get("edge_density", 0.3) * 100, 1),
                "brightness_level":        "High" if features.get("brightness", 0.5) > 0.65 else "Medium" if features.get("brightness", 0.5) > 0.4 else "Low",
                "texture_complexity":      "High" if features.get("entropy", 0.5) > 0.7 else "Medium" if features.get("entropy", 0.5) > 0.45 else "Low",
                "dominant_surface":        self._dominant_surface(features),
            },

            # ── Historical Context ─────────────────────────────────────────
            "historical_context": self._historical_context(results, events),

            # ── Recommended Actions ────────────────────────────────────────
            "recommended_actions": self._recommended_actions(events, metadata, confidence),

            # ── Intelligence Timeline ─────────────────────────────────────
            "pipeline_timeline": self._timeline(),
        }

        return report

    def _executive_summary(
        self,
        primary_event: DetectedEvent | None,
        confidence: ConfidenceReport,
        metadata: dict[str, Any],
        results: list[SearchResult],
    ) -> str:
        """Generate the executive summary paragraph."""
        region = metadata.get("region", "Unknown Region")
        satellite = metadata.get("satellite", "Unknown Satellite")
        date = metadata.get("acquisition_date", "Unknown Date")
        top_sim = round(results[0].similarity * 100, 1) if results else 0
        conf_pct = round(confidence.overall * 100, 1)
        conf_level = confidence.level

        if primary_event:
            event_type = primary_event.event_type.replace("_", " ").title()
            severity   = primary_event.severity
            return (
                f"AKSHA Intelligence Analysis — {region}. "
                f"Scene acquired by {satellite} on {date}. "
                f"AI pipeline detected {event_type} ({severity} severity) with "
                f"{round(primary_event.confidence*100,1)}% event confidence. "
                f"Archive retrieval identified {top_sim}% match with historical archive. "
                f"Overall intelligence confidence: {conf_level} ({conf_pct}%). "
                f"Immediate action recommended per NDMA rapid response protocol."
            )
        else:
            return (
                f"AKSHA Intelligence Analysis — {region}. "
                f"Scene acquired by {satellite} on {date}. "
                f"No critical events detected. Archive retrieval similarity: {top_sim}%. "
                f"Overall confidence: {conf_level} ({conf_pct}%). "
                f"Scene classified as routine monitoring acquisition."
            )

    def _dominant_surface(self, features: dict[str, Any]) -> str:
        """Identify dominant surface type from features."""
        wi  = features.get("water_index", 0.5)
        vi  = features.get("vegetation_index", 0.5)
        ed  = features.get("edge_density", 0.3)
        br  = features.get("brightness", 0.5)
        if wi > 0.65:   return "Water / Inundated Surface"
        if vi > 0.65:   return "Dense Vegetation / Forest"
        if ed > 0.6 and br > 0.5: return "Urban / Built-up Area"
        if br > 0.80:   return "Cloud / Snow / Bright Surface"
        return "Mixed / Agricultural Surface"

    def _historical_context(
        self,
        results: list[SearchResult],
        events: list[DetectedEvent],
    ) -> dict[str, Any]:
        """Summarize historical context from top archive matches."""
        if not results:
            return {"message": "No archive matches found."}

        event_types = [r.entry.get("profile", "mixed") for r in results[:5]]
        from collections import Counter
        dominant = Counter(event_types).most_common(1)[0][0]

        analogues = [
            {
                "event":      r.entry.get("event_label", "Historical scene"),
                "satellite":  r.entry["satellite"],
                "date":       r.entry["timestamp"],
                "similarity": round(r.similarity * 100, 1),
            }
            for r in results[:3]
            if r.entry.get("event_label") and r.entry.get("event_label") != "None"
        ]

        return {
            "dominant_historical_type": dominant,
            "notable_analogues": analogues,
            "archive_coverage_years": "2019–2024",
            "archive_scene_count": 50,
        }

    def _recommended_actions(
        self,
        events: list[DetectedEvent],
        metadata: dict[str, Any],
        confidence: ConfidenceReport,
    ) -> list[dict[str, str]]:
        """Generate prioritized recommended actions list."""
        actions: list[dict[str, str]] = []

        if events:
            primary = events[0]
            if primary.event_type == "flood":
                actions.extend([
                    {"priority": "IMMEDIATE", "action": "Notify NDMA Situation Room, New Delhi"},
                    {"priority": "IMMEDIATE", "action": "Activate State Disaster Management Authority in affected region"},
                    {"priority": "HIGH",      "action": "Schedule RISAT-2B ScanSAR acquisition within 24h for flood extent mapping"},
                    {"priority": "HIGH",      "action": "Request Sentinel-1 repeat-pass SAR from ESA Emergency Management Service"},
                    {"priority": "MEDIUM",    "action": "Initiate population exposure analysis using Census 2011 grid"},
                    {"priority": "MEDIUM",    "action": "Brief NDRF (National Disaster Response Force) team deployment"},
                    {"priority": "LOW",       "action": "Generate MODIS-derived flood extent comparison for validation"},
                ])
            elif primary.event_type == "fire":
                actions.extend([
                    {"priority": "IMMEDIATE", "action": "Cross-check with MODIS FIRMS active fire detection"},
                    {"priority": "HIGH",      "action": "Notify Forest Survey of India district office"},
                    {"priority": "HIGH",      "action": "Schedule RISAT-2B nocturnal SAR for active fire confirmation"},
                    {"priority": "MEDIUM",    "action": "Compute burn severity using NBR index from pre/post Sentinel-2"},
                ])
            elif primary.event_type == "dense_cloud":
                actions.extend([
                    {"priority": "HIGH",      "action": "Switch to SAR acquisition — RISAT-2B penetrates cloud cover"},
                    {"priority": "MEDIUM",    "action": "Monitor Meteosat-12 cloud motion for clearance window"},
                    {"priority": "LOW",       "action": "Reschedule Cartosat-3 optical acquisition"},
                ])
        else:
            actions.extend([
                {"priority": "ROUTINE", "action": "Archive scene in ISRO Bhuvan operational database"},
                {"priority": "ROUTINE", "action": "Update monitoring region baseline statistics"},
                {"priority": "LOW",     "action": "Schedule next planned acquisition per mission calendar"},
            ])

        # Always recommend confidence improvement if low
        if confidence.level == "Low":
            actions.append({
                "priority": "MEDIUM",
                "action": "Acquire additional scenes for cross-validation — low confidence requires corroboration",
            })

        return actions

    def _timeline(self) -> list[dict[str, str]]:
        """Return the AI pipeline timeline for display."""
        return [
            {"stage": "Image Upload",          "description": "Satellite imagery ingested into AKSHA pipeline"},
            {"stage": "Metadata Extraction",   "description": "Scene ID, satellite, sensor, date, coordinates parsed"},
            {"stage": "Preprocessing",         "description": "Image normalized to 512×512 RGB with auto-enhancement"},
            {"stage": "Feature Extraction",    "description": "32 texture + spectral features computed from pixel statistics"},
            {"stage": "Embedding Generation",  "description": "Feature vector normalized to unit embedding (L2 norm = 1.0)"},
            {"stage": "Semantic Search",       "description": "Cosine similarity computed against 50-scene archive"},
            {"stage": "Graph Analysis",        "description": "Geo-semantic graph built; PageRank re-ranking applied"},
            {"stage": "Event Detection",       "description": "Rule-based flood and anomaly detectors executed"},
            {"stage": "Confidence Estimation", "description": "4-signal confidence computed with component breakdown"},
            {"stage": "Report Generation",     "description": "Mission Intelligence Report assembled and streamed"},
        ]
