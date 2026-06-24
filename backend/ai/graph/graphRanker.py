"""
AKSHA Earth Intelligence Platform — Graph Ranker
=================================================

PURPOSE:
  Apply PageRank-based graph analysis to compute importance scores for
  result nodes, then use these scores to adjust final result ordering.

WHY IT EXISTS:
  Some archive scenes are more "central" in the geo-semantic graph —
  they are referenced by many spatial, temporal, and semantic relationships.
  A scene that is semantically similar to the query AND is a hub in the
  historical data graph is likely more relevant than an isolated scene
  with equally high semantic similarity.

  This is analogous to how PageRank elevated web pages that many other
  pages linked to — authority in a web of relationships.

AI CONCEPT DEMONSTRATED:
  Graph-based re-ranking. PageRank is an eigenvector centrality measure —
  the principal eigenvector of the normalized adjacency matrix.
  Real retrieval systems using graph signals include:
    • Google Knowledge Graph for entity disambiguation
    • Academic citation networks (citation count as authority)
    • Social network recommendations (friend-of-friend signals)
    • Geospatial analysis (centrality of locations in movement data)

PRODUCTION REPLACEMENT:
  Graph Attention Networks (GAT) trained end-to-end on search logs,
  or HITS (Hyperlink-Induced Topic Search) for hub/authority decomposition.
  The interface (graph dict + results → adjusted scores) remains identical.

INPUTS:
  graph_dict: dict with nodes[] and edges[] from GraphBuilder
  results:    list of SearchResult to re-rank

OUTPUTS:
  dict mapping result_id → graph_score (float in [0,1])
  Adjusted results list (optional, reranked by composite score)

PIPELINE POSITION:
  Graph Builder → [Graph Ranker ← HERE] → Event Detection
"""

from __future__ import annotations

from typing import Any

import numpy as np


class GraphRanker:
    """
    Computes PageRank-based importance scores for graph nodes.

    PageRank: a node's score = weighted sum of scores of nodes pointing to it.
    High-centrality nodes (connected to many high-score nodes) get high ranks.

    Implementation: power iteration on the normalized adjacency matrix.
    Converges in ~50 iterations for small graphs.
    """

    def compute_scores(
        self,
        graph_dict: dict[str, Any],
        damping: float = 0.85,
        max_iter: int = 50,
        tol: float = 1e-6,
    ) -> dict[str, float]:
        """
        Run PageRank power iteration on the graph.

        PageRank formula:
          PR(v) = (1 - d) / N + d × Σ_{u→v} PR(u) / out_degree(u)

        where d = damping factor (typically 0.85), N = total nodes.
        Converges when max change < tol.

        Args:
          graph_dict: dict with 'nodes' and 'edges'
          damping:    teleportation probability (1-damping = random jump)
          max_iter:   maximum power iterations
          tol:        convergence tolerance

        Returns:
          dict mapping node_id → normalized PageRank score in [0,1]
        """
        nodes = graph_dict.get("nodes", [])
        edges = graph_dict.get("edges", [])

        if not nodes:
            return {}

        N = len(nodes)
        node_ids = [n["id"] for n in nodes]
        id_to_idx = {nid: i for i, nid in enumerate(node_ids)}

        # Build weighted adjacency matrix (source → target)
        adj = np.zeros((N, N), dtype=np.float64)
        for edge in edges:
            src = edge.get("source")
            tgt = edge.get("target")
            strength = float(edge.get("strength", 1.0))
            if src in id_to_idx and tgt in id_to_idx:
                si = id_to_idx[src]
                ti = id_to_idx[tgt]
                adj[si, ti] += strength
                adj[ti, si] += strength  # Undirected graph

        # Normalize rows (out-degree normalization)
        row_sums = adj.sum(axis=1, keepdims=True)
        row_sums[row_sums == 0] = 1.0  # Avoid division by zero
        adj_norm = adj / row_sums

        # Power iteration
        scores = np.ones(N, dtype=np.float64) / N
        for _ in range(max_iter):
            new_scores = (1.0 - damping) / N + damping * (adj_norm.T @ scores)
            delta = np.abs(new_scores - scores).max()
            scores = new_scores
            if delta < tol:
                break

        # Normalize to [0, 1]
        if scores.max() > 0:
            scores = scores / scores.max()

        return {node_ids[i]: float(scores[i]) for i in range(N)}

    def adjust_result_scores(
        self,
        results: list[Any],
        graph_scores: dict[str, float],
        graph_weight: float = 0.15,
    ) -> list[Any]:
        """
        Blend PageRank scores with semantic similarity scores.

        Final score = (1 - graph_weight) × similarity + graph_weight × pagerank

        A small graph_weight (0.10-0.20) prevents the graph from completely
        overriding semantic similarity, but allows structurally important
        nodes to rank slightly higher than isolated ones.

        Args:
          results:      SearchResult list with .similarity attribute
          graph_scores: PageRank scores from compute_scores()
          graph_weight: Blend weight for graph signal (0=ignore, 1=only graph)

        Returns:
          Results sorted by adjusted score
        """
        if not graph_scores:
            return results

        scored = []
        for result in results:
            entry_id = result.entry.get("id", "")
            pr_score = graph_scores.get(entry_id, 0.5)
            adjusted = (1.0 - graph_weight) * result.similarity + graph_weight * pr_score
            scored.append((adjusted, result))

        scored.sort(key=lambda x: x[0], reverse=True)

        reranked = []
        for new_rank, (score, result) in enumerate(scored, start=1):
            result.rank = new_rank
            reranked.append(result)

        return reranked
