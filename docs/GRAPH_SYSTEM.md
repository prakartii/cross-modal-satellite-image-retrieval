# AKSHA Geo-Semantic Graph System

## What is the Graph?

After semantic search retrieves the top-10 similar archive scenes, the graph
system builds a relational knowledge structure connecting:

- The query image
- The retrieved archive scenes
- The satellite platforms that captured them

This graph lets us answer questions that cosine similarity alone cannot:
- "Which scenes share both spatial proximity AND temporal co-occurrence?"
- "Is this scene supported by multiple independent satellite views?"
- "Does the scene's importance increase when we consider its relationship network?"

## Graph Structure

```
          QUERY_NODE (uploaded image)
         /    |    \
        /     |     \
    flood1   flood2   flood3  ← SearchResult nodes (up to 10)
       |       |
    Sentinel-2  RISAT-2B      ← Satellite nodes (deduplicated)
       |       |
    flood4   flood5           ← Other scenes from same satellite
       |─────|                ← Temporal edge (same year)
       |─────|                ← Spatial edge (dist < 500km)
```

## Node Types

| Type | Color | Description |
|------|-------|-------------|
| query | #6366F1 (indigo) | The uploaded image |
| result | #22C55E (green) | Archive scenes from search |
| satellite | #F59E0B (amber) | Satellite platforms |

Each node carries:
- `id`: unique identifier
- `label`: display name
- `type`: query / result / satellite
- `similarity`: cosine similarity to query (0–1)
- `description`: metadata summary
- `aiExplanation`: why this node is relevant to the query

## Edge Types

| Type | Color | Condition | Meaning |
|------|-------|-----------|---------|
| semantic | #6366F1 | similarity > 0.45 | Both scenes have similar spectral signature |
| provenance | #9CA3AF | always | Scene was captured by this satellite |
| spatial | #22C55E | dist < 500km | Scenes cover overlapping geographic area |
| temporal | #F59E0B | same calendar year | Scenes acquired in the same year |

Each edge carries:
- `strength`: 0–1 weight used in PageRank
- `aiExplanation`: explanation of what this connection means

## PageRank Algorithm

PageRank measures: "How important is this node, given its connections?"

A node is important if:
1. Many other important nodes link to it
2. Its incoming edges are strong

### Power Iteration Implementation

```python
# Initial: uniform rank
ranks = {node_id: 1.0 / N for node_id in nodes}

for iteration in range(max_iter):
    new_ranks = {node_id: (1 - damping) / N for node_id in nodes}
    
    for node in nodes:
        outgoing = edges_from[node]
        total_strength = sum(e.strength for e in outgoing)
        
        for edge in outgoing:
            weight = edge.strength / total_strength if total_strength > 0 else 0
            new_ranks[edge.target] += damping * ranks[node] * weight
    
    # Check convergence
    delta = max(|new_ranks[n] - ranks[n]| for n in nodes)
    if delta < tolerance:
        break
    
    ranks = new_ranks
```

Parameters:
- `damping = 0.85` — standard (Google used 0.85)
- `max_iter = 50` — sufficient for 10–15 node graphs
- `tol = 1e-6` — convergence threshold

### Score Blending

PageRank adjusts (but does not replace) semantic similarity:

```
final_score = (1 - 0.15) × similarity + 0.15 × pagerank_score
```

The 0.15 weight means graph structure provides a 15% correction.
A scene with many strong connections gets a small boost.
A scene with few connections and weak edges gets a small penalty.

## Why Graph Re-ranking Matters

**Example: Two scenes with equal cosine similarity (0.78)**

Scene A: Sentinel-2 flood, Assam, 2024-07-15
- No other archive scenes near it geographically
- Unique satellite capture, no corroboration
- PageRank: 0.04 (isolated node)

Scene B: Sentinel-2 flood, Assam, 2024-07-18
- 3 other archive scenes within 200km captured in July 2024
- Also captured by RISAT-2B 3 days later (corroboration)
- PageRank: 0.18 (well-connected node)

After graph blending:
- Scene A: 0.85×0.78 + 0.15×0.04 = 0.669
- Scene B: 0.85×0.78 + 0.15×0.18 = 0.690

Scene B ranks higher because multiple independent observations agree.
This is the graph's key contribution: **corroboration weighting**.

## Production Extensions

| Current | Production Upgrade |
|---------|-------------------|
| In-memory adjacency matrix | Neo4j / Amazon Neptune |
| 10–15 nodes per query | 10,000+ historical scenes in graph |
| Static satellite nodes | Live satellite trajectory data |
| Manual edge rules | Learned edge weights from analyst feedback |
| Power iteration | Scalable GraphSAGE embeddings |

## Integration with Frontend

The graph is delivered in the SSE `complete` event:

```json
{
  "graph": {
    "nodes": [
      {"id": "query", "type": "query", "label": "Query Image", "similarity": 1.0, ...},
      {"id": "result_0", "type": "result", "label": "Brahmaputra Flood 2024", ...},
      ...
    ],
    "edges": [
      {"source": "query", "target": "result_0", "type": "semantic", "strength": 0.84, ...},
      ...
    ],
    "stats": {
      "total_nodes": 12,
      "total_edges": 18,
      "pagerank_iterations": 12,
      "converged": true
    }
  }
}
```

The `GeoSemanticGraphPage` receives this via Zustand store and renders it
using D3 force-directed layout.
