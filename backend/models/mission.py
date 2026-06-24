"""
backend/models/mission.py

PURPOSE:
  Defines the Mission dataclass — the central data object that flows through
  the entire AKSHA AI pipeline. Every page in the frontend reads from Mission.
  Nothing in the system returns hardcoded values; all data is derived from
  the uploaded satellite image.

WHY A SINGLE OBJECT:
  Modern AI systems use "request context" objects to carry state through a
  pipeline. Instead of passing 20 arguments between functions, we pass one
  Mission object. Each pipeline stage fills in its section and passes the
  object forward. This is similar to how gRPC protobuf messages work.

DATA FLOW:
  Upload → Mission(id, filename, image_bytes)
       Stage 1 → mission.metadata populated
       Stage 2 → mission.preprocessing populated
       Stage 3 → mission.features, mission.feature_vector populated
       Stage 4 → mission.embedding populated
       Stage 5 → mission.retrieval_results populated
       Stage 6 → mission.graph populated
       Stage 7 → mission.events populated
       Stage 8 → mission.confidence populated
       Stage 9 → mission.timeline, mission.analytics, mission.report populated
  Frontend reads mission.* for every page (Results, Graph, Analytics, Timeline, Compare)

INPUT: raw bytes from HTTP multipart upload
OUTPUT: fully-populated Mission object serialized to JSON
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


@dataclass
class Mission:
    """
    The central data object for one AKSHA intelligence mission.

    Lifecycle: created empty at upload time, populated stage-by-stage
    through the AI pipeline, stored in memory, served to frontend.

    Every field has a default value so the object can be created
    incrementally — you don't need all data at construction time.
    """

    # ── Identity ──────────────────────────────────────────────────────────────
    id: str = field(default_factory=lambda: f"AKSHA-{uuid.uuid4().hex[:8].upper()}")
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    filename: str = ""

    # ── Stage 1: Image stored for Compare view ────────────────────────────────
    # We store a small base64 thumbnail of the uploaded image so the
    # Compare page can show the query image side-by-side with retrieved images.
    # Full image bytes are NOT stored (memory efficiency).
    query_thumbnail_b64: str = ""   # Base64 PNG, 256×256 max

    # ── Stage 1: Metadata ─────────────────────────────────────────────────────
    # What do we know about WHERE and WHEN this image was taken?
    # Extracted from filename patterns, EXIF, and GeoTIFF headers.
    metadata: dict[str, Any] = field(default_factory=dict)
    # Example:
    # {
    #   "satellite": "Sentinel-2A",
    #   "sensor_type": "Optical",
    #   "acquisition_date": "2024-07-15",
    #   "region": "Assam, India",
    #   "coordinates": {"lat": 26.14, "lng": 91.73},
    #   "resolution_m": 10,
    #   "cloud_cover_pct": 12,
    #   "scene_id": "S2A_MSIL2A_20240715"
    # }

    # ── Stage 2: Preprocessing stats ─────────────────────────────────────────
    # What happened during image normalization?
    preprocessing: dict[str, Any] = field(default_factory=dict)
    # Example:
    # {
    #   "original_size": [4096, 4096],
    #   "normalized_size": [512, 512],
    #   "original_mode": "RGB",
    #   "file_size_kb": 4821,
    #   "dynamic_range": 211,
    #   "mean_rgb": [0.42, 0.48, 0.51],
    #   "enhanced": false
    # }

    # ── Stage 3: Feature extraction ───────────────────────────────────────────
    # WHAT does the image look like, numerically?
    # 32 named features capturing texture, spectral, and spatial properties.
    #
    # MATHEMATICAL BACKGROUND:
    # Feature engineering converts raw pixel data into a structured representation
    # that an algorithm can reason about. Instead of comparing images pixel-by-pixel
    # (expensive and noise-sensitive), we compare their feature vectors.
    # This is the foundation of classical computer vision before deep learning.
    features: dict[str, float] = field(default_factory=dict)
    feature_vector: list[float] = field(default_factory=list)  # 32-dim, values in [0,1]
    feature_vector_names: list[str] = field(default_factory=list)  # names aligned to vector
    scene_type: str = ""  # Inferred scene type: "flood" | "vegetation" | "urban" | etc.

    # ── Stage 4: Embedding ────────────────────────────────────────────────────
    # A unit vector in 32-dim space that represents this image's "semantic position".
    #
    # MATHEMATICAL BACKGROUND:
    # An embedding maps a high-dimensional object (image) to a lower-dimensional
    # dense vector. L2-normalization (dividing by the vector's length) ensures all
    # embeddings lie on a unit hypersphere. On a unit hypersphere, the dot product
    # between two vectors equals their cosine similarity:
    #   cosine_similarity(a, b) = a · b / (|a| × |b|) = a · b  (for unit vectors)
    # This makes semantic search a simple matrix multiplication.
    embedding: list[float] = field(default_factory=list)  # 32-dim, L2-norm = 1.0

    # ── Stage 5+6: Retrieval results ──────────────────────────────────────────
    # The top-K archive scenes most similar to the uploaded image.
    # Sorted by final_score (similarity + temporal + spatial + sensor).
    # Each result is a dict matching the RetrievalResult TypeScript interface.
    retrieval_results: list[dict[str, Any]] = field(default_factory=list)

    # ── Stage 6 (parallel): Graph ─────────────────────────────────────────────
    # A knowledge graph connecting the query to retrieved scenes, satellites,
    # events, and geographic regions. Dynamic — changes with every upload.
    # Matches the GraphNode / GraphEdge TypeScript interfaces.
    graph: dict[str, Any] = field(default_factory=lambda: {"nodes": [], "edges": [], "stats": {}})

    # ── Stage 7: Events ───────────────────────────────────────────────────────
    # Detected geophysical events (flood, fire, deforestation, etc.)
    # based on feature thresholds. Not hardcoded — depends on uploaded image.
    events: list[dict[str, Any]] = field(default_factory=list)

    # ── Stage 8: Confidence ───────────────────────────────────────────────────
    # Multi-signal confidence estimation.
    # Tells the operator HOW MUCH to trust the system's conclusions.
    confidence: dict[str, Any] = field(default_factory=dict)

    # ── Stage 9: Derived outputs ──────────────────────────────────────────────
    # These are generated FROM the mission data, not hardcoded.

    # Timeline: chronological sequence of pipeline events + historical matches
    # Drives the Timeline view in the frontend.
    timeline: list[dict[str, Any]] = field(default_factory=list)

    # Analytics: derived metrics from features + retrieval results
    # Drives the Analytics page (coverage %, sensor distribution, etc.)
    analytics: dict[str, Any] = field(default_factory=dict)

    # Report: structured mission intelligence report
    # Drives the MissionReport overlay in the frontend.
    report: dict[str, Any] = field(default_factory=dict)

    # ── Processing log ────────────────────────────────────────────────────────
    # Each stage appends a log entry with stage name, duration, and key outputs.
    # Used for the pipeline timeline display and debugging.
    logs: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """
        Serialize the Mission to a plain dict for JSON serialization.
        FastAPI will convert this to a JSON HTTP response.
        """
        return {
            "id":                    self.id,
            "created_at":            self.created_at,
            "filename":              self.filename,
            "query_thumbnail_b64":   self.query_thumbnail_b64,
            "metadata":              self.metadata,
            "preprocessing":         self.preprocessing,
            "features":              self.features,
            "feature_vector":        self.feature_vector,
            "feature_vector_names":  self.feature_vector_names,
            "scene_type":            self.scene_type,
            "embedding":             self.embedding,
            "retrieval_results":     self.retrieval_results,
            "graph":                 self.graph,
            "events":                self.events,
            "confidence":            self.confidence,
            "timeline":              self.timeline,
            "analytics":             self.analytics,
            "report":                self.report,
            "logs":                  self.logs,
        }

    def log_stage(self, stage: str, duration_ms: float, summary: dict[str, Any]) -> None:
        """Record a pipeline stage completion to the mission log."""
        self.logs.append({
            "stage":       stage,
            "duration_ms": round(duration_ms, 1),
            "summary":     summary,
            "timestamp":   datetime.utcnow().isoformat() + "Z",
        })
