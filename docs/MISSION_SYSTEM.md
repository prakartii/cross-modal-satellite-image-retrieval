# AKSHA Mission Intelligence Report System

## What is a Mission Report?

After all 9 AI pipeline stages complete, AKSHA generates a structured
**Mission Intelligence Report** — a comprehensive briefing that synthesizes:

- What was detected in the image (events, anomalies)
- How confident the system is (and why)
- What similar historical scenes exist
- What actions decision-makers should take

This transforms raw AI outputs into actionable intelligence for operators at
NDMA, SDMA, or ISRO mission control.

## Report Structure

```json
{
  "generated_at": "2026-06-25T14:32:11Z",
  "mission_id": "AKSHA-2026-0625-A3F9",
  "executive_summary": "Critical flood event detected with 88% confidence...",

  "scene_metadata": {
    "satellite": "Sentinel-2A",
    "sensor_type": "optical",
    "acquisition_date": "2026-06-24",
    "region": "Brahmaputra Basin, Assam",
    "estimated_coords": [26.14, 91.73],
    "cloud_cover": 12,
    "resolution_m": 10,
    "scene_id": "S2A_MSIL2A_20260624"
  },

  "detected_events": [
    {
      "event_type": "flood",
      "severity": "Critical",
      "confidence": 0.88,
      "explanation": "Water index 0.82 (threshold 0.58). Blue channel dominant...",
      "recommended_action": "Deploy NDRF teams to Brahmaputra riverbanks...",
      "feature_evidence": {
        "water_index": 0.82,
        "vegetation_index": 0.31,
        "brightness": 0.44
      }
    }
  ],

  "search_summary": {
    "total_results": 10,
    "top_match_similarity": 0.91,
    "top_match_scene": "Brahmaputra Flood July 2022",
    "scene_type": "flood",
    "matches": [...]
  },

  "confidence": {
    "overall": 0.84,
    "level": "High",
    "components": {
      "similarity": 0.91,
      "feature_consistency": 0.87,
      "historical_agreement": 0.80,
      "metadata_quality": 0.65
    },
    "explanation": "High overall confidence driven by strong semantic similarity...",
    "limitations": ["No ground truth validation", "Archive represents 50 scenes only"]
  },

  "feature_analysis": {
    "water_coverage_estimate": "68%",
    "vegetation_density": "Low (31%)",
    "urban_presence": "Minimal (edge density 0.18)",
    "texture_complexity": "Low (uniform water surface)"
  },

  "historical_context": {
    "analogues": ["Brahmaputra Flood July 2022", "Assam Flood August 2020"],
    "pattern": "Monsoon-season riverine flooding matching historical Brahmaputra events"
  },

  "recommended_actions": [
    {
      "priority": "IMMEDIATE",
      "action": "Alert NDMA Flood Control Division",
      "detail": "Activate Emergency Operations Center"
    },
    {
      "priority": "HIGH",
      "action": "Request RISAT-2B SAR overpass",
      "detail": "Cloud-penetrating SAR to confirm inundation extent"
    },
    {
      "priority": "MEDIUM",
      "action": "Archive scene for climate database",
      "detail": "Flag as monsoon 2026 Brahmaputra event"
    }
  ],

  "pipeline_timeline": [
    {"stage": "metadata_extraction", "status": "complete", "duration_ms": 712, ...},
    {"stage": "preprocessing", "status": "complete", "duration_ms": 923, ...},
    ...
  ]
}
```

## Confidence Calibration

The 4-component confidence formula:

```
overall = 0.40 × similarity
        + 0.25 × feature_consistency
        + 0.25 × historical_agreement
        + 0.10 × metadata_quality
```

**Why these weights?**

- `similarity (0.40)` — Largest weight: direct evidence from 32-dim feature match
- `feature_consistency (0.25)` — Checks internal coherence of detected features
  - A "flood" with both high water_index AND high vegetation_index is contradictory → lower confidence
  - A "flood" with high water_index, low vegetation, low edge_density is consistent → higher confidence
- `historical_agreement (0.25)` — Do top-5 results agree on scene type?
  - 5/5 results are flood scenes → agreement = 1.0
  - 3/5 flood, 2/5 vegetation → agreement = 0.6
- `metadata_quality (0.10)` — Smaller weight: metadata is useful but not definitive
  - Present fields weighted: coordinates=0.25, satellite=0.20, date=0.20, sensor=0.15, resolution=0.10, cloud=0.10

**Confidence levels:**
- High: ≥ 0.75
- Medium: 0.50 – 0.75
- Low: < 0.50

## Recommended Actions Logic

Actions are generated based on event type and severity:

```python
FLOOD_ACTIONS = {
    "Critical": [
        ("IMMEDIATE", "Alert NDMA Flood Control Division", "..."),
        ("IMMEDIATE", "Issue public flood warning", "..."),
        ("HIGH",      "Deploy NDRF rescue teams", "..."),
        ("HIGH",      "Request RISAT-2B SAR overpass", "..."),
        ("MEDIUM",    "Coordinate with state SDMA", "..."),
    ],
    "High": [...],
    "Moderate": [...],
}

FIRE_ACTIONS = {
    "Critical": [
        ("IMMEDIATE", "Alert Forest Fire Division", "..."),
        ("HIGH",      "Deploy aerial firefighting assets", "..."),
    ],
    ...
}
```

For "no event" scenes (vegetation/urban/normal), actions default to:
- MEDIUM: Archive and classify for land use monitoring
- LOW: Update vegetation health index

## Frontend Display

The `MissionReportPanel` (`src/components/intelligence/MissionReport.tsx`) renders:

```
┌─────────────────────────────────────────────────────────┐
│ MISSION INTELLIGENCE REPORT         [Mission ID] [Close] │
├─────────────────────────────────────────────────────────┤
│ [CRITICAL] FLOOD DETECTED                               │
│ Confidence: 88% ████████░░                               │
│ "Water index 0.82 significantly above flood threshold..."│
├─────────────────────────────────────────────────────────┤
│ CONFIDENCE BREAKDOWN                                     │
│ Semantic Similarity   ████████░░ 91%                    │
│ Feature Consistency   ████████░░ 87%                    │
│ Historical Agreement  ████████░░ 80%                    │
│ Metadata Quality      ██████░░░░ 65%                    │
├─────────────────────────────────────────────────────────┤
│ RECOMMENDED ACTIONS                                      │
│ [IMMEDIATE] Alert NDMA Flood Control Division           │
│ [HIGH]      Deploy NDRF rescue teams to Assam           │
│ [MEDIUM]    Request follow-up SAR overpass              │
├─────────────────────────────────────────────────────────┤
│ TOP SEARCH MATCHES                                       │
│ 1. Brahmaputra Flood 2022    ████████░░ 91%             │
│ 2. Assam Monsoon 2020         ███████░░░ 84%             │
│ 3. Bihar Flood 2024           ██████░░░░ 79%             │
└─────────────────────────────────────────────────────────┘
```

The report auto-appears when the pipeline reaches the `complete` stage.
It can be dismissed with the X button and re-opened from the Results page.

## Production Mission System

In production AKSHA at ISRO/NDMA scale:

| Current | Production |
|---------|-----------|
| Template NLG | Claude claude-sonnet-4-6 LLM with RAG over incident reports |
| Static action templates | ML-ranked actions from historical incident outcomes |
| Simulated mission ID | Authenticated mission IDs with audit trail |
| JSON report | PDF export + NDMA portal integration |
| In-app display | Push to NDMA Emergency Ops, SMS alerts, NDRF dispatch |
