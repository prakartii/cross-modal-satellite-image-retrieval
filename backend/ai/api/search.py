"""
AKSHA — Text Search API
Provides keyword/region-based archive search for the AI Copilot feature.
Searches by location name, satellite, date range, and event type.
"""

from __future__ import annotations

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from ai.embeddings.vectorStore import vector_store

router = APIRouter()


@router.get("/search")
async def text_search(
    q: str = Query(default="", description="Search query (region, satellite, event)"),
    sensor: str = Query(default="", description="Filter by sensor type"),
    limit: int = Query(default=10, ge=1, le=50),
) -> JSONResponse:
    """
    Search archive by text query (location, satellite name, or event type).
    Used by the AI Copilot for natural language archive queries.
    """
    vector_store.initialize()
    entries = vector_store.entries

    query_lower = q.lower()
    results = []

    for entry in entries:
        score = 0.0

        if query_lower:
            loc = entry["location"]["name"].lower()
            sat = entry["satellite"].lower()
            evt = entry.get("event_label", "").lower()
            evt_type = entry.get("event_type", "").lower()

            if query_lower in loc:  score += 1.0
            if query_lower in sat:  score += 0.8
            if query_lower in evt:  score += 0.9
            if query_lower in evt_type: score += 0.7
            # Partial matches
            for word in query_lower.split():
                if word in loc or word in sat or word in evt:
                    score += 0.3

        if sensor and entry["sensor_type"].lower() != sensor.lower():
            continue  # Filter out non-matching sensors

        if score > 0 or not query_lower:
            results.append((score, entry))

    results.sort(key=lambda x: x[0], reverse=True)
    top = results[:limit]

    return JSONResponse({
        "query": q,
        "count": len(top),
        "results": [
            {
                "id":         e["id"],
                "satellite":  e["satellite"],
                "sensor":     e["sensor_type"],
                "location":   e["location"]["name"],
                "date":       e["timestamp"],
                "event":      e.get("event_label", ""),
                "similarity": round(score * 20, 1),  # Scale for display
            }
            for score, e in top
        ],
    })
