"""
backend/ai/graph/dynamic_graph.py

PURPOSE:
  Stage 6 (parallel branch) of the AKSHA AI pipeline.
  Builds a geo-semantic knowledge graph from the retrieval results.
  The graph connects: query image, retrieved scenes, satellite platforms,
  detected events, and geographic regions.

  Every graph is unique — it changes with every uploaded image.
  No hardcoded nodes or edges.

GRAPH STRUCTURE:
  Nodes:
    - query     : The uploaded image (center of the graph)
    - result    : Each retrieved archive scene (up to 10)
    - satellite : The satellite that captured each scene (deduplicated)
    - event     : Any detected geophysical event
    - region    : Geographic region cluster (coarse-grained grouping)

  Edges:
    - semantic  : Connects query to each result (strength = cosine similarity)
    - provenance: Connects each result to its capturing satellite
    - spatial   : Connects results that are geographically close (< 500km)
    - temporal  : Connects results from the same year
    - event_rel : Connects events to scenes that triggered detection

WHY A KNOWLEDGE GRAPH:
  A flat ranked list loses relationship information.
  The graph reveals:
    - Which satellite missions contributed most (degree of satellite nodes)
    - Whether results cluster geographically (spatial edges)
    - Whether multiple sources corroborate an event (event edges to multiple results)
    - Temporal patterns (temporal edges linking monsoon flood sequences)

PAGERANK (applied in graphRanker.py):
  After building the graph, PageRank scores node importance.
  A result connected to many other results (corroborated by multiple sources)
  receives a higher PageRank → rises in ranking.

INPUT:
  results: list[dict] — formatted retrieval results from vector_search
  events: list[dict] — detected events from event_detector
  metadata: dict — query scene metadata

OUTPUT:
  graph_dict: {nodes: list, edges: list, stats: dict}
  Compatible with the GraphNode / GraphEdge TypeScript interfaces.

COMPLEXITY: O(K²) for spatial/temporal edge computation where K = number of results
"""

from __future__ import annotations

import math
from typing import Any


# Maximum distance for a "spatial" edge between two scenes
SPATIAL_EDGE_THRESHOLD_KM = 600.0


class DynamicGraphBuilder:
    """
    Builds a geo-semantic graph from mission data.
    Every call returns a different graph — no static structure.
    """

    def build(
        self,
        results: list[dict[str, Any]],
        events: list[dict[str, Any]],
        metadata: dict[str, Any],
        features: dict[str, float],
    ) -> dict[str, Any]:
        """
        Build the complete geo-semantic graph for this mission.

        Args:
            results: Top-K retrieval results from vector search
            events: Detected events from event detection stage
            metadata: Query scene metadata (satellite, coords, date)
            features: Query image feature dict

        Returns:
            {nodes: list[GraphNode], edges: list[GraphEdge], stats: dict}
        """
        nodes: list[dict[str, Any]] = []
        edges: list[dict[str, Any]] = []
        edge_id = 0

        q_coords  = metadata.get("coordinates", {"lat": 20.59, "lng": 78.96})
        q_date    = metadata.get("acquisition_date", "")
        q_sensor  = metadata.get("sensor_type", "Optical")
        q_region  = metadata.get("region", "India")
        scene_type = features.get("scene_type", "unknown") if isinstance(features, dict) else "unknown"
        # features is a dict but scene_type isn't in it — it's from the extractor
        # We'll handle this gracefully

        # ── Query node (always node 0, center of graph) ───────────────────
        nodes.append({
            "id":           "query",
            "label":        "Uploaded Scene",
            "type":         "query",
            "sensorType":   q_sensor,
            "coords":       q_coords,
            "timestamp":    q_date,
            "description":  f"{metadata.get('satellite', 'Unknown')} · {q_sensor} · {q_date}",
            "aiExplanation": "The uploaded satellite image — center of the semantic search",
            "similarityScore": 100,
        })

        # ── Satellite nodes (deduplicated from results) ───────────────────
        satellites_seen: set[str] = set()
        satellite_node_ids: dict[str, str] = {}  # satellite_name → node_id

        for r in results:
            sat = r.get("satellite", "Unknown")
            if sat not in satellites_seen:
                sat_id = f"sat_{sat.replace('-', '').replace(' ', '_').lower()}"
                nodes.append({
                    "id":    sat_id,
                    "label": sat,
                    "type":  "satellite",
                    "description": f"{r.get('sensorType', '')} platform",
                    "aiExplanation": f"Satellite platform that captured {len([x for x in results if x.get('satellite') == sat])} archive scene(s) in this graph",
                    "similarityScore": 0,
                })
                satellites_seen.add(sat)
                satellite_node_ids[sat] = sat_id

        # ── Event nodes (one per detected event) ─────────────────────────
        event_node_ids: list[str] = []
        for i, ev in enumerate(events):
            ev_id = f"event_{ev['event_type']}_{i}"
            nodes.append({
                "id":       ev_id,
                "label":    f"{ev['event_type'].replace('_', ' ').title()} [{ev['severity']}]",
                "type":     "event",
                "eventType": ev["event_type"],
                "description": ev.get("explanation", "")[:100],
                "aiExplanation": f"Detected {ev['event_type']} at {ev['confidence_pct']}% confidence from image features",
                "similarityScore": ev.get("confidence_pct", 0),
            })
            event_node_ids.append(ev_id)

            # Event → query edge
            edges.append({
                "id":              f"e{edge_id}",
                "source":          "query",
                "target":          ev_id,
                "strength":        ev.get("confidence", 0.5),
                "relationshipType": "event",
                "label":           f"{ev['event_type']} detected",
                "aiExplanation":   f"{ev['event_type']} detected from query image features at {ev['confidence_pct']}% confidence",
            })
            edge_id += 1

        # ── Result nodes + semantic edges ─────────────────────────────────
        result_node_ids: list[str] = []
        for r in results:
            r_id  = f"result_{r['id']}"
            cos   = r.get("similarityScore", 50) / 100.0
            loc   = r.get("location", {})
            rcoords = loc.get("coords", {"lat": 0, "lng": 0})

            nodes.append({
                "id":           r_id,
                "label":        loc.get("name", "Unknown")[:35],
                "type":         "result",
                "sensorType":   r.get("sensorType"),
                "similarityScore": r.get("similarityScore", 50),
                "coords":       rcoords,
                "timestamp":    r.get("timestamp", "")[:10],
                "description":  (
                    f"{r.get('satellite', '')} · {r.get('timestamp', '')[:10]} · "
                    f"{r.get('resolution', '')} · "
                    f"Cloud: {r.get('cloudCover', 0):.0f}%"
                ),
                "aiExplanation": r.get("matchExplanation", ""),
                "eventType":    r.get("eventType", ""),
            })
            result_node_ids.append(r_id)

            # Semantic edge: query → result
            edges.append({
                "id":              f"e{edge_id}",
                "source":          "query",
                "target":          r_id,
                "strength":        cos,
                "relationshipType": "semantic",
                "label":           f"{r.get('similarityScore', 0):.1f}%",
                "aiExplanation":   f"Cosine similarity {r.get('similarityScore', 0):.1f}% in 32-dim embedding space",
            })
            edge_id += 1

            # Provenance edge: result → satellite
            sat = r.get("satellite", "")
            if sat in satellite_node_ids:
                edges.append({
                    "id":              f"e{edge_id}",
                    "source":          satellite_node_ids[sat],
                    "target":          r_id,
                    "strength":        0.5,
                    "relationshipType": "provenance",
                    "label":           "captured by",
                    "aiExplanation":   f"Scene was acquired by the {sat} platform",
                })
                edge_id += 1

            # Event relation edge (if result has same event type as detected events)
            for ev_idx, ev in enumerate(events):
                if r.get("eventType") == ev["event_type"]:
                    edges.append({
                        "id":              f"e{edge_id}",
                        "source":          r_id,
                        "target":          event_node_ids[ev_idx],
                        "strength":        cos * 0.8,
                        "relationshipType": "event",
                        "label":           "corroborates",
                        "aiExplanation":   f"Archive scene also shows {ev['event_type']} event — provides historical corroboration",
                    })
                    edge_id += 1

        # ── Spatial edges between results ─────────────────────────────────
        for i in range(len(results)):
            for j in range(i + 1, len(results)):
                ri = results[i]
                rj = results[j]
                ci = ri.get("location", {}).get("coords", {})
                cj = rj.get("location", {}).get("coords", {})
                dist = self._haversine_km(
                    ci.get("lat", 0), ci.get("lng", 0),
                    cj.get("lat", 0), cj.get("lng", 0),
                )
                if dist < SPATIAL_EDGE_THRESHOLD_KM:
                    strength = max(0.1, 1.0 - dist / SPATIAL_EDGE_THRESHOLD_KM)
                    edges.append({
                        "id":              f"e{edge_id}",
                        "source":          f"result_{ri['id']}",
                        "target":          f"result_{rj['id']}",
                        "strength":        round(strength, 3),
                        "relationshipType": "spatial",
                        "label":           f"{dist:.0f} km",
                        "aiExplanation":   f"These scenes are {dist:.0f} km apart — geographically proximate",
                    })
                    edge_id += 1

        # ── Temporal edges between results ────────────────────────────────
        for i in range(len(results)):
            for j in range(i + 1, len(results)):
                ri = results[i]
                rj = results[j]
                ti = (ri.get("timestamp") or "")[:4]  # year
                tj = (rj.get("timestamp") or "")[:4]
                if ti and tj and ti == tj:
                    edges.append({
                        "id":              f"e{edge_id}",
                        "source":          f"result_{ri['id']}",
                        "target":          f"result_{rj['id']}",
                        "strength":        0.35,
                        "relationshipType": "temporal",
                        "label":           f"same year ({ti})",
                        "aiExplanation":   f"Both scenes acquired in {ti} — temporal co-occurrence",
                    })
                    edge_id += 1

        stats = {
            "total_nodes":    len(nodes),
            "total_edges":    len(edges),
            "result_nodes":   len(results),
            "satellite_nodes": len(satellites_seen),
            "event_nodes":    len(events),
            "spatial_edges":  sum(1 for e in edges if e["relationshipType"] == "spatial"),
            "temporal_edges": sum(1 for e in edges if e["relationshipType"] == "temporal"),
            "semantic_edges": sum(1 for e in edges if e["relationshipType"] == "semantic"),
        }

        return {"nodes": nodes, "edges": edges, "stats": stats}

    def _haversine_km(
        self, lat1: float, lng1: float, lat2: float, lng2: float
    ) -> float:
        """Haversine great-circle distance between two coordinate pairs."""
        R = 6371.0
        dlat = math.radians(lat2 - lat1)
        dlng = math.radians(lng2 - lng1)
        a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlng/2)**2
        return 2 * math.asin(math.sqrt(min(a, 1.0))) * R
