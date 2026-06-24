"""
AKSHA Earth Intelligence Platform — Graph Builder
==================================================

PURPOSE:
  Construct a geo-semantic relationship graph from search results.
  Nodes represent images, satellites, locations, and events.
  Edges represent similarity, spatial, temporal, and mission relationships.

WHY IT EXISTS:
  Linear similarity ranking misses structural relationships between results:
    • Two images from the same satellite form a provenance chain
    • Two images of the same location at different times form a temporal series
    • Images from geographically adjacent areas are spatially correlated
    • Images involving the same type of event form an event cluster

  A graph captures all these relationships simultaneously, enabling
  graph-based re-ranking and structured explainability (why is this image
  connected to that one?).

AI CONCEPT DEMONSTRATED:
  Knowledge graph construction for information retrieval. This is related to:
    • Graph Neural Networks (GNNs) for node classification
    • Link prediction in knowledge graphs
    • Graph-based recommendation systems (Pinterest GraphSage)
    • Geographic information systems (spatial graphs)

PRODUCTION REPLACEMENT:
  Neo4j graph database with Cypher queries for dynamic graph construction,
  or a GNN (Graph Attention Network) trained on Earth observation metadata
  to learn which relationships are most predictive of relevance.

INPUTS:
  results:        list of SearchResult from SemanticSearch
  query_metadata: dict with query image metadata

OUTPUTS:
  graph_dict: serializable dict with nodes[] and edges[] for frontend visualization

PIPELINE POSITION:
  Re-ranking → [Graph Builder ← HERE] → Graph Ranker → Event Detection
"""

from __future__ import annotations

import math
from typing import Any

from ai.search.semanticSearch import SearchResult
from ai.search.reranker import Reranker


class GraphBuilder:
    """
    Builds a geo-semantic graph from search results and query metadata.

    Graph structure:
      Nodes: query_image, result_images, satellites, location_clusters, events
      Edges: semantic (embedding similarity), spatial (haversine proximity),
             temporal (date closeness), provenance (same satellite lineage)
    """

    def __init__(self) -> None:
        self._reranker = Reranker()

    def build(
        self,
        results: list[SearchResult],
        query_metadata: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Build and return the graph as a JSON-serializable dict.

        Args:
          results:        Re-ranked search results
          query_metadata: Query image metadata

        Returns:
          dict with keys: nodes, edges, stats
        """
        nodes: list[dict] = []
        edges: list[dict] = []
        node_ids: set[str] = set()

        # ── Add query node ─────────────────────────────────────────────────
        query_node_id = "QUERY"
        nodes.append({
            "id":    query_node_id,
            "label": "Query Image",
            "type":  "query",
            "sensorType":      query_metadata.get("sensor_type", "Optical"),
            "similarityScore": 100.0,
            "coords":          query_metadata.get("coords"),
            "timestamp":       query_metadata.get("acquisition_date"),
            "agency":          query_metadata.get("agency", "Upload"),
            "description":     "Uploaded query image for cross-modal retrieval",
            "aiExplanation":   "This is the reference image uploaded by the analyst. All other nodes show archive scenes ranked by semantic similarity to this image.",
        })
        node_ids.add(query_node_id)

        # ── Add result image nodes ─────────────────────────────────────────
        satellite_nodes: dict[str, str] = {}  # satellite_name → node_id
        location_nodes: dict[str, str]  = {}  # location_key → node_id

        for result in results[:10]:  # Limit to top-10 for graph clarity
            e = result.entry
            node_id = e["id"]
            nodes.append({
                "id":    node_id,
                "label": e["location"]["name"].split(",")[0],
                "type":  "result",
                "sensorType":      e["sensor_type"],
                "similarityScore": round(result.similarity * 100, 1),
                "coords":          e["location"]["coords"],
                "timestamp":       e["timestamp"],
                "agency":          e.get("agency", "ESA"),
                "description":     f"{e['satellite']} · {e['sensor_type']} · {e['resolution']}",
                "aiExplanation":   result.match_explanation,
                "eventType":       e.get("event_type", "unknown"),
                "eventLabel":      e.get("event_label", ""),
            })
            node_ids.add(node_id)

            # ── Semantic edge: result ↔ query ──────────────────────────────
            edges.append({
                "id":               f"sem_{node_id}_QUERY",
                "source":           query_node_id,
                "target":           node_id,
                "strength":         round(result.similarity, 3),
                "relationshipType": "semantic",
                "label":            f"{round(result.similarity*100,1)}% match",
                "aiExplanation":    f"Cosine similarity of {round(result.similarity*100,1)}% in 32-dimensional embedding space. High similarity indicates similar land cover, texture, and spectral characteristics.",
            })

            # ── Satellite node (add once per unique satellite) ─────────────
            sat_name = e["satellite"]
            if sat_name not in satellite_nodes:
                sat_node_id = f"SAT_{sat_name.replace(' ','_').replace('-','')}"
                satellite_nodes[sat_name] = sat_node_id
                if sat_node_id not in node_ids:
                    nodes.append({
                        "id":    sat_node_id,
                        "label": sat_name,
                        "type":  "satellite",
                        "agency":          e.get("agency", "ESA"),
                        "sensorType":      e["sensor_type"],
                        "description":     f"{e['sensor_type']} sensor · {e['resolution']} resolution · {e.get('agency','')}",
                        "aiExplanation":   f"Satellite node: {sat_name} operated by {e.get('agency','ESA')}. All result images from this satellite are connected here, showing the acquisition lineage.",
                    })
                    node_ids.add(sat_node_id)

            # ── Provenance edge: result ↔ satellite ────────────────────────
            edges.append({
                "id":               f"prov_{node_id}_{satellite_nodes[sat_name]}",
                "source":           node_id,
                "target":           satellite_nodes[sat_name],
                "strength":         0.9,
                "relationshipType": "provenance",
                "label":            "acquired by",
                "aiExplanation":    f"This scene was acquired by {sat_name}. Provenance edges trace the data lineage from satellite to archive scene.",
            })

        # ── Add inter-result spatial edges (nearby locations) ────────────
        result_list = results[:10]
        for i in range(len(result_list)):
            for j in range(i + 1, len(result_list)):
                e_i = result_list[i].entry
                e_j = result_list[j].entry
                ci  = e_i["location"]["coords"]
                cj  = e_j["location"]["coords"]

                try:
                    dist = self._reranker._haversine_km(
                        ci["lat"], ci["lng"], cj["lat"], cj["lng"]
                    )
                    # Add spatial edge only if within 500km (same general region)
                    if dist < 500:
                        strength = max(0.1, 1.0 - dist / 500.0)
                        edges.append({
                            "id":               f"spat_{e_i['id']}_{e_j['id']}",
                            "source":           e_i["id"],
                            "target":           e_j["id"],
                            "strength":         round(strength, 3),
                            "relationshipType": "spatial",
                            "label":            f"{round(dist,0):.0f} km",
                            "aiExplanation":    f"Spatial relationship: these two scenes are {round(dist,0):.0f} km apart. Scenes within the same watershed or administrative region often co-vary during flood events.",
                        })
                except (TypeError, KeyError):
                    continue

        # ── Add temporal edges (same-year acquisitions) ──────────────────
        for i in range(len(result_list)):
            for j in range(i + 1, len(result_list)):
                ti = result_list[i].entry.get("timestamp", "")[:4]
                tj = result_list[j].entry.get("timestamp", "")[:4]
                if ti == tj and ti:
                    edges.append({
                        "id":               f"temp_{result_list[i].entry['id']}_{result_list[j].entry['id']}",
                        "source":           result_list[i].entry["id"],
                        "target":           result_list[j].entry["id"],
                        "strength":         0.6,
                        "relationshipType": "temporal",
                        "label":            f"same year {ti}",
                        "aiExplanation":    f"Both scenes were acquired in {ti}. Temporal edges connect observations from the same period, useful for monitoring seasonal or event-driven changes.",
                    })

        stats = {
            "node_count": len(nodes),
            "edge_count": len(edges),
            "satellite_count": len(satellite_nodes),
        }

        return {"nodes": nodes, "edges": edges, "stats": stats}

    def _haversine_km(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Compute great-circle distance in km between two lat/lng points."""
        R = 6371.0
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = (
            math.sin(dlat/2)**2 +
            math.cos(math.radians(lat1)) *
            math.cos(math.radians(lat2)) *
            math.sin(dlon/2)**2
        )
        return R * 2 * math.asin(math.sqrt(max(0.0, min(1.0, a))))
