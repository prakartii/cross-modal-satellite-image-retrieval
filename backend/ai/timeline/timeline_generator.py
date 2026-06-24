"""
backend/ai/timeline/timeline_generator.py

PURPOSE:
  Stage 9 of the AKSHA AI pipeline.
  Generates a chronological timeline combining pipeline events and
  historical archive matches, sorted by timestamp.

  The timeline shows the operator:
    1. What happened during AI processing (pipeline events)
    2. Historical analogues from the archive (ordered by date)

  Nothing is hardcoded — every event comes from mission data.

OUTPUT FORMAT:
  Each timeline item:
    timestamp: ISO date string
    event_type: "upload" | "pipeline" | "historical" | "event"
    title: short display label
    description: one-sentence explanation
    data: relevant metadata dict
    category: color coding category for the UI
"""

from __future__ import annotations

from datetime import datetime
from typing import Any


class TimelineGenerator:
    """
    Builds a chronological timeline from mission data.
    """

    def generate(
        self,
        mission_id: str,
        metadata: dict[str, Any],
        retrieval_results: list[dict[str, Any]],
        events: list[dict[str, Any]],
        logs: list[dict[str, Any]],
        created_at: str,
    ) -> list[dict[str, Any]]:
        """
        Generate a full mission timeline.

        Returns list of timeline items sorted by timestamp (oldest first).
        """
        items: list[dict[str, Any]] = []

        # ── 1. Upload event ──────────────────────────────────────────────
        items.append({
            "timestamp":   created_at,
            "event_type":  "upload",
            "title":       "Image Uploaded",
            "description": f"Satellite image uploaded to AKSHA pipeline · Mission {mission_id}",
            "category":    "pipeline",
            "data":        {
                "filename": metadata.get("scene_id", "unknown"),
                "satellite": metadata.get("satellite", "Unknown"),
                "sensor":    metadata.get("sensor_type", "Unknown"),
            },
        })

        # ── 2. Pipeline processing events (from logs) ────────────────────
        stage_display = {
            "metadata_extraction":  ("Metadata Extracted",   "Satellite, sensor, date, coordinates parsed"),
            "preprocessing":        ("Image Preprocessed",   "Normalized to 512×512 RGB with histogram equalization"),
            "feature_extraction":   ("Features Extracted",   "32-dimensional feature vector computed from pixels"),
            "embedding_generation": ("Embedding Generated",  "Unit embedding derived via weighted L2 normalization"),
            "semantic_search":      ("Semantic Search Done", "Cosine similarity computed against 100-scene archive"),
            "graph_reranking":      ("Graph Built",          "Geo-semantic graph constructed; spatial/temporal edges added"),
            "event_detection":      ("Events Detected",      "Rule-based detectors applied to feature vector"),
            "confidence_estimation":("Confidence Scored",    "Multi-signal confidence computed from 4 components"),
            "report_generation":    ("Report Generated",     "Mission Intelligence Report assembled"),
        }

        for log_entry in logs:
            stage = log_entry.get("stage", "")
            display = stage_display.get(stage, (stage, "Processing stage complete"))
            title, desc = display

            # Use log timestamp if available, else use created_at
            ts = log_entry.get("timestamp", created_at)

            items.append({
                "timestamp":   ts,
                "event_type":  "pipeline",
                "title":       title,
                "description": desc + f" · {log_entry.get('duration_ms', 0):.0f}ms",
                "category":    "pipeline",
                "data":        log_entry.get("summary", {}),
            })

        # ── 3. Detected events ───────────────────────────────────────────
        acq_date = metadata.get("acquisition_date", "")
        for ev in events:
            items.append({
                "timestamp":   acq_date + "T00:00:00Z" if acq_date else created_at,
                "event_type":  "event",
                "title":       f"{ev['event_type'].replace('_', ' ').title()} Detected [{ev['severity']}]",
                "description": ev.get("explanation", "")[:150],
                "category":    self._event_category(ev["event_type"]),
                "data":        {
                    "event_type":    ev["event_type"],
                    "severity":      ev["severity"],
                    "confidence_pct": ev.get("confidence_pct", 0),
                    "feature_evidence": ev.get("feature_evidence", {}),
                },
            })

        # ── 4. Historical archive matches (sorted by date) ──────────────
        for result in retrieval_results:
            ts_raw = (result.get("timestamp") or "2020-01-01T00:00:00Z")[:10]
            loc    = result.get("location", {})
            items.append({
                "timestamp":   ts_raw + "T00:00:00Z",
                "event_type":  "historical",
                "title":       f"{result.get('satellite', 'Unknown')} · {loc.get('name', 'Unknown')}",
                "description": (
                    f"{result.get('similarityScore', 0):.1f}% similar. "
                    f"{result.get('matchExplanation', 'Archive match')}."
                ),
                "category":    self._scene_category(result.get("category", "")),
                "data":        {
                    "rank":          result.get("rank", 0),
                    "similarity":    result.get("similarityScore", 0),
                    "satellite":     result.get("satellite", ""),
                    "sensor_type":   result.get("sensorType", ""),
                    "location":      loc.get("name", ""),
                    "coords":        loc.get("coords", {}),
                    "event_type":    result.get("eventType", ""),
                    "thumbnail":     result.get("thumbnailUrl", ""),
                    "resolution":    result.get("resolution", ""),
                },
            })

        # Sort by timestamp ascending (oldest first)
        items.sort(key=lambda x: x.get("timestamp", ""))

        return items

    def _event_category(self, event_type: str) -> str:
        mapping = {
            "flood":           "disaster",
            "fire":            "disaster",
            "deforestation":   "environment",
            "urban_expansion": "urban",
            "dense_cloud":     "quality",
            "drought":         "environment",
        }
        return mapping.get(event_type, "event")

    def _scene_category(self, category: str) -> str:
        mapping = {
            "flood":       "disaster",
            "vegetation":  "environment",
            "urban":       "urban",
            "agriculture": "agriculture",
            "coastal":     "water",
        }
        return mapping.get(category, "historical")
