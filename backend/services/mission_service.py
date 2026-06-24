"""
backend/services/mission_service.py

PURPOSE:
  Orchestrates the complete AKSHA AI pipeline for one satellite image upload.
  Creates a Mission object, runs all 10 stages in sequence, populates the
  Mission with results from each stage, and returns the fully-populated Mission.

  This is the "use case" or "application service" layer:
    Routes (HTTP) → MissionService (orchestration) → AI Modules (computation)

  Separation of concerns:
    - Routes handle HTTP request/response formatting
    - MissionService handles business logic and pipeline sequencing
    - AI modules handle domain-specific computation

PIPELINE SEQUENCE:
  Stage 1:  metadata_extraction    → metadata
  Stage 2:  preprocessing          → normalized image + stats
  Stage 3:  feature_extraction     → 32-dim feature vector
  Stage 4:  embedding_generation   → unit embedding
  Stage 5+6: semantic_search       → retrieval results + graph
  Stage 7:  event_detection        → detected events
  Stage 8:  confidence_estimation  → confidence scores
  Stage 9:  report + timeline + analytics → all derived outputs

INPUT:  file_bytes: bytes — raw uploaded satellite image
        filename: str — original filename
OUTPUT: Mission (fully populated, ready for JSON serialization)

ERROR HANDLING:
  Each stage is wrapped in try/except. If a stage fails, it logs the error
  and continues with degraded data (empty dict / list). The mission always
  completes — partial results are better than no results for disaster monitoring.
"""

from __future__ import annotations

import time
from typing import Any, AsyncGenerator

from models.mission import Mission
from ai.image_processing.metadata import MetadataExtractor
from ai.image_processing.preprocessing import ImagePreprocessor
from ai.image_processing.feature_extractor import FeatureExtractor
from ai.embeddings.embedding_generator import EmbeddingGenerator
from ai.search.vector_search import VectorSearch
from ai.events.event_detector import EventDetector
from ai.graph.dynamic_graph import DynamicGraphBuilder
from ai.timeline.timeline_generator import TimelineGenerator
from ai.analytics.analytics_generator import AnalyticsGenerator
from ai.reports.report_generator import ReportGenerator


class ConfidenceEngine:
    """
    Compute multi-signal confidence from pipeline outputs.

    FORMULA:
      overall = 0.40 × similarity_score
              + 0.25 × feature_consistency
              + 0.25 × historical_agreement
              + 0.10 × metadata_quality

    COMPONENT COMPUTATION:
      similarity_score:    top cosine similarity from retrieval
      feature_consistency: 1 - contradiction_score (flags impossible feature combos)
      historical_agreement: fraction of top-5 results with same category
      metadata_quality:    weighted count of present metadata fields
    """

    def compute(
        self,
        retrieval_results: list[dict[str, Any]],
        features: dict[str, float],
        metadata: dict[str, Any],
    ) -> dict[str, Any]:
        """Compute 4-signal confidence report."""
        # Signal 1: Top similarity
        sims = [r.get("similarityScore", 0) for r in retrieval_results]
        top_sim = max(sims) / 100.0 if sims else 0.5

        # Signal 2: Feature consistency (no contradictory features)
        feat_cons = self._feature_consistency(features)

        # Signal 3: Historical agreement (do top-5 results agree on scene type?)
        hist_agree = self._historical_agreement(retrieval_results)

        # Signal 4: Metadata quality (how complete is our metadata?)
        meta_qual = self._metadata_quality(metadata)

        # Weighted combination
        overall = (
            0.40 * top_sim    +
            0.25 * feat_cons  +
            0.25 * hist_agree +
            0.10 * meta_qual
        ) * 100  # percent

        overall = round(overall, 1)
        level = "High" if overall >= 75 else "Medium" if overall >= 50 else "Low"

        # Identify weakest component for explanation
        components_pct = {
            "similarity":           round(top_sim * 100, 1),
            "feature_consistency":  round(feat_cons * 100, 1),
            "historical_agreement": round(hist_agree * 100, 1),
            "metadata_quality":     round(meta_qual * 100, 1),
        }
        strongest = max(components_pct, key=components_pct.get)
        weakest   = min(components_pct, key=components_pct.get)

        return {
            "overall":    overall,
            "level":      level,
            "components": components_pct,
            "explanation": (
                f"{level} overall confidence ({overall:.1f}%). "
                f"Strongest signal: {strongest.replace('_', ' ')} ({components_pct[strongest]:.1f}%). "
                f"Weakest signal: {weakest.replace('_', ' ')} ({components_pct[weakest]:.1f}%)."
            ),
            "limitations": self._limitations(features, metadata, overall),
        }

    def _feature_consistency(self, f: dict[str, float]) -> float:
        """Check for physically impossible feature combinations."""
        contradictions = 0.0
        # Water AND high vegetation at same time is unusual (swamp possible but rare)
        if f.get("water_index", 0) > 0.70 and f.get("vegetation_index", 0) > 0.70:
            contradictions += 0.3
        # Very high brightness AND high water_index → possibly cloud over water (ambiguous)
        if f.get("brightness", 0) > 0.80 and f.get("water_index", 0) > 0.65:
            contradictions += 0.2
        # Very high edge_density AND very high homogeneity (opposite textures)
        if f.get("edge_density", 0) > 0.60 and f.get("homogeneity", 0) > 0.80:
            contradictions += 0.2
        return max(0.0, 1.0 - contradictions)

    def _historical_agreement(self, results: list[dict[str, Any]]) -> float:
        """Fraction of top-5 results with the same dominant category."""
        cats = [r.get("category", "") for r in results[:5]]
        if not cats:
            return 0.5
        from collections import Counter
        most_common_count = Counter(cats).most_common(1)[0][1]
        return most_common_count / len(cats)

    def _metadata_quality(self, metadata: dict[str, Any]) -> float:
        """Score metadata completeness (weighted fields)."""
        weights = {
            "coordinates":       0.25,
            "satellite":         0.20,
            "acquisition_date":  0.20,
            "sensor_type":       0.15,
            "resolution_m":      0.10,
            "cloud_cover_pct":   0.10,
        }
        score = 0.0
        for field, weight in weights.items():
            val = metadata.get(field)
            if val and val not in ("Unknown Satellite", "Unknown", "", 0):
                score += weight
        return score

    def _limitations(
        self,
        features: dict[str, float],
        metadata: dict[str, Any],
        overall: float,
    ) -> list[str]:
        """Identify limitations relevant to this mission."""
        lims = ["No ground truth validation — AI detection only"]
        if metadata.get("satellite", "Unknown") == "Unknown Satellite":
            lims.append("Satellite identity not confirmed from filename")
        if metadata.get("coords_source") == "default_india_center":
            lims.append("Geographic coordinates estimated — not derived from image metadata")
        if metadata.get("cloud_cover_pct", 0) > 30:
            lims.append("Elevated cloud cover may obscure surface features")
        if overall < 60:
            lims.append("Low confidence — human expert review recommended before action")
        return lims


class MissionService:
    """
    Orchestrates the complete AI pipeline for one satellite image upload.
    Returns a fully-populated Mission object.
    """

    def __init__(self) -> None:
        self._meta_extractor  = MetadataExtractor()
        self._preprocessor    = ImagePreprocessor()
        self._feat_extractor  = FeatureExtractor()
        self._emb_generator   = EmbeddingGenerator()
        self._vector_search   = VectorSearch()
        self._event_detector  = EventDetector()
        self._graph_builder   = DynamicGraphBuilder()
        self._confidence      = ConfidenceEngine()
        self._timeline_gen    = TimelineGenerator()
        self._analytics_gen   = AnalyticsGenerator()
        self._report_gen      = ReportGenerator()

    async def run_pipeline(
        self,
        file_bytes: bytes,
        filename: str,
        on_stage,  # async callback: (stage, progress, data) → None
    ) -> Mission:
        """
        Run the complete AI pipeline and stream progress via on_stage callback.

        Args:
            file_bytes: Raw uploaded file bytes
            filename: Original filename (used for metadata parsing)
            on_stage: Async callable(stage: str, progress: int, data: dict)

        Returns:
            Fully-populated Mission object
        """
        mission = Mission(filename=filename)
        t0 = time.perf_counter()
        print(f"[AKSHA Service] Mission created: {mission.id}  file={filename}")

        # ── Stage 1: Metadata Extraction ──────────────────────────────────
        print(f"[AKSHA Service] Stage 1/9: metadata_extraction")
        await on_stage("metadata_extraction", 8, {"message": "Parsing scene metadata from filename and image headers…"})
        stage_start = time.perf_counter()
        try:
            # Quick metadata pass (needs image partially loaded)
            from PIL import Image
            import io
            img_quick = Image.open(io.BytesIO(file_bytes))
            img_quick.load()
            mission.metadata = self._meta_extractor.extract(
                filename,
                img_quick,
                {},  # stats filled in by preprocessing
                len(file_bytes),
            )
        except Exception as e:
            mission.metadata = {"satellite": "Unknown", "sensor_type": "Optical", "error": str(e)}
        dur = (time.perf_counter() - stage_start) * 1000
        mission.log_stage("metadata_extraction", dur, {
            "satellite":   mission.metadata.get("satellite"),
            "sensor_type": mission.metadata.get("sensor_type"),
            "date":        mission.metadata.get("acquisition_date"),
        })
        await on_stage("metadata_extraction", 14, {"message": "Metadata extracted", "result": mission.metadata})
        print(f"[AKSHA Service]   ✓ metadata: satellite={mission.metadata.get('satellite')} sensor={mission.metadata.get('sensor_type')}")

        # ── Stage 2: Preprocessing ────────────────────────────────────────
        print("[AKSHA Service] Stage 2/9: preprocessing")
        await on_stage("preprocessing", 18, {"message": "Normalizing image to 512×512 RGB with histogram equalization…"})
        stage_start = time.perf_counter()
        try:
            img, preproc_stats = self._preprocessor.load_and_preprocess(file_bytes, filename)
            mission.preprocessing = preproc_stats
            # Generate thumbnail for Compare view
            mission.query_thumbnail_b64 = self._preprocessor.make_thumbnail_b64(img)
            # Update metadata with pixel stats
            mission.metadata.update({
                "cloud_cover_pct": self._meta_extractor._estimate_cloud(preproc_stats),
            })
        except Exception as e:
            mission.preprocessing = {"error": str(e)}
            from PIL import Image
            import io
            img = Image.new("RGB", (512, 512), (128, 128, 128))
        dur = (time.perf_counter() - stage_start) * 1000
        mission.log_stage("preprocessing", dur, {
            "normalized_size": mission.preprocessing.get("normalized_size"),
            "dynamic_range":   mission.preprocessing.get("dynamic_range"),
            "enhanced":        mission.preprocessing.get("enhanced"),
        })
        await on_stage("preprocessing", 26, {"message": "Preprocessing complete", "result": mission.preprocessing})
        print(f"[AKSHA Service]   ✓ preprocessing: {mission.preprocessing.get('normalized_size')} dynamic_range={mission.preprocessing.get('dynamic_range')}")

        # ── Stage 3: Feature Extraction ───────────────────────────────────
        print("[AKSHA Service] Stage 3/9: feature_extraction")
        await on_stage("feature_extraction", 30, {"message": "Extracting 32 texture, spectral, and spatial features…"})
        stage_start = time.perf_counter()
        try:
            feat_result = self._feat_extractor.extract(img, mission.preprocessing)
            mission.features              = feat_result["features"]
            mission.feature_vector        = feat_result["feature_vector"]
            mission.feature_vector_names  = feat_result["feature_vector_names"]
            mission.scene_type            = feat_result["scene_type"]
        except Exception as e:
            mission.features       = {}
            mission.feature_vector = [0.5] * 32
            mission.scene_type     = "unknown"
        dur = (time.perf_counter() - stage_start) * 1000
        mission.log_stage("feature_extraction", dur, {
            "feature_count": len(mission.features),
            "scene_type":    mission.scene_type,
            "key_features":  {
                k: round(mission.features.get(k, 0), 3)
                for k in ["water_index", "vegetation_index", "edge_density", "brightness"]
            },
        })
        await on_stage("feature_extraction", 42, {"message": "Features extracted", "result": {
            "feature_count": 32,
            "scene_type":    mission.scene_type,
            "key_features":  {
                "water_index":      round(mission.features.get("water_index", 0), 3),
                "vegetation_index": round(mission.features.get("vegetation_index", 0), 3),
                "edge_density":     round(mission.features.get("edge_density", 0), 3),
                "brightness":       round(mission.features.get("brightness", 0), 3),
            },
        }})

        print(f"[AKSHA Service]   ✓ features: scene_type={mission.scene_type} water={mission.features.get('water_index',0):.3f} veg={mission.features.get('vegetation_index',0):.3f}")

        # ── Stage 4: Embedding Generation ─────────────────────────────────
        print("[AKSHA Service] Stage 4/9: embedding_generation")
        await on_stage("embedding_generation", 46, {"message": "Generating normalized 32-dim unit embedding…"})
        stage_start = time.perf_counter()
        try:
            embedding, emb_stats = self._emb_generator.generate(mission.feature_vector)
            mission.embedding = embedding
        except Exception as e:
            import numpy as np
            vec = np.array(mission.feature_vector or [0.5]*32, dtype=np.float32)
            norm = float(np.linalg.norm(vec))
            mission.embedding = (vec / (norm + 1e-9)).tolist()
            emb_stats = {"error": str(e)}
        dur = (time.perf_counter() - stage_start) * 1000
        mission.log_stage("embedding_generation", dur, {"embedding_dim": len(mission.embedding)})
        await on_stage("embedding_generation", 52, {"message": "Embedding generated", "result": emb_stats})

        print(f"[AKSHA Service]   ✓ embedding: dim={len(mission.embedding)}")

        # ── Stage 5+6: Semantic Search + Graph ───────────────────────────
        print("[AKSHA Service] Stage 5/9: semantic_search")
        await on_stage("semantic_search", 56, {"message": "Computing cosine similarity with 100-scene archive…"})
        stage_start = time.perf_counter()
        try:
            results, search_stats = self._vector_search.search(
                mission.embedding,
                mission.metadata,
                mission.features,
                k=10,
                threshold=0.05,
            )
            mission.retrieval_results = results
        except Exception as e:
            mission.retrieval_results = []
            search_stats = {"error": str(e)}
        dur = (time.perf_counter() - stage_start) * 1000
        mission.log_stage("semantic_search", dur, search_stats)
        await on_stage("semantic_search", 62, {"message": "Semantic search complete", "result": search_stats})
        print(f"[AKSHA Service]   ✓ search: {len(mission.retrieval_results)} results  top={search_stats.get('top_similarity',0):.3f}")

        # Graph building
        print("[AKSHA Service] Stage 6/9: graph_reranking")
        await on_stage("graph_reranking", 66, {"message": "Building geo-semantic graph with spatial and temporal edges…"})
        stage_start = time.perf_counter()
        try:
            mission.graph = self._graph_builder.build(
                mission.retrieval_results,
                [],  # events not yet computed
                mission.metadata,
                mission.features,
            )
        except Exception as e:
            mission.graph = {"nodes": [], "edges": [], "stats": {"error": str(e)}}
        dur = (time.perf_counter() - stage_start) * 1000
        mission.log_stage("graph_reranking", dur, mission.graph.get("stats", {}))
        await on_stage("graph_reranking", 72, {"message": "Graph built", "result": mission.graph.get("stats", {})})
        print(f"[AKSHA Service]   ✓ graph: nodes={len(mission.graph.get('nodes',[]))} edges={len(mission.graph.get('edges',[]))}")

        # ── Stage 7: Event Detection ──────────────────────────────────────
        print("[AKSHA Service] Stage 7/9: event_detection")
        await on_stage("event_detection", 76, {"message": "Running rule-based event detectors on extracted features…"})
        stage_start = time.perf_counter()
        try:
            mission.events = self._event_detector.detect(mission.features, mission.metadata)
        except Exception as e:
            mission.events = []
        dur = (time.perf_counter() - stage_start) * 1000
        mission.log_stage("event_detection", dur, {
            "events_detected": len(mission.events),
            "primary_event":   mission.events[0]["event_type"] if mission.events else "none",
        })
        await on_stage("event_detection", 82, {"message": f"{len(mission.events)} event(s) detected", "result": {
            "events_detected": len(mission.events),
            "primary_event":   mission.events[0]["event_type"] if mission.events else "none",
            "primary_severity": mission.events[0]["severity"] if mission.events else "none",
        }})

        print(f"[AKSHA Service]   ✓ events: {len(mission.events)} detected  primary={mission.events[0]['event_type'] if mission.events else 'none'}")

        # ── Stage 8: Confidence Estimation ───────────────────────────────
        print("[AKSHA Service] Stage 8/9: confidence_estimation")
        await on_stage("confidence_estimation", 86, {"message": "Computing 4-signal weighted confidence score…"})
        stage_start = time.perf_counter()
        try:
            mission.confidence = self._confidence.compute(
                mission.retrieval_results,
                mission.features,
                mission.metadata,
            )
        except Exception as e:
            mission.confidence = {"overall": 50, "level": "Low", "error": str(e)}
        dur = (time.perf_counter() - stage_start) * 1000
        mission.log_stage("confidence_estimation", dur, {
            "overall": mission.confidence.get("overall"),
            "level":   mission.confidence.get("level"),
        })
        await on_stage("confidence_estimation", 91, {"message": "Confidence computed", "result": {
            "overall": mission.confidence.get("overall"),
            "level":   mission.confidence.get("level"),
            "components": mission.confidence.get("components", {}),
        }})

        print(f"[AKSHA Service]   ✓ confidence: {mission.confidence.get('overall')}% ({mission.confidence.get('level')})")

        # ── Stage 9: Report + Timeline + Analytics ────────────────────────
        print("[AKSHA Service] Stage 9/9: report_generation")
        await on_stage("report_generation", 94, {"message": "Assembling Mission Intelligence Report…"})
        stage_start = time.perf_counter()
        try:
            mission.report = self._report_gen.generate(
                mission.id, mission.metadata, mission.features,
                mission.scene_type, mission.retrieval_results,
                mission.events, mission.confidence, mission.logs,
            )
            mission.timeline = self._timeline_gen.generate(
                mission.id, mission.metadata, mission.retrieval_results,
                mission.events, mission.logs, mission.created_at,
            )
            mission.analytics = self._analytics_gen.generate(
                mission.features, mission.retrieval_results,
                mission.confidence, mission.logs, mission.metadata,
            )
        except Exception as e:
            mission.report   = {"error": str(e)}
            mission.timeline = []
            mission.analytics = {}
        dur = (time.perf_counter() - stage_start) * 1000
        mission.log_stage("report_generation", dur, {
            "report_sections":  len(mission.report),
            "timeline_items":   len(mission.timeline),
        })

        total_ms = (time.perf_counter() - t0) * 1000
        print(f"[AKSHA Service]   ✓ pipeline complete  {total_ms:.0f}ms  mission={mission.id}")

        await on_stage("report_generation", 99, {"message": f"Report complete in {total_ms:.0f}ms", "result": {
            "sections":     len(mission.report),
            "total_time_ms": round(total_ms, 1),
        }})

        return mission
