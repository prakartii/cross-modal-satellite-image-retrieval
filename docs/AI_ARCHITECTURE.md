# AKSHA Earth Intelligence Platform — AI Architecture

## Overview

AKSHA is a full-stack Earth Intelligence Platform inspired by Palantir Gotham, ISRO Bhuvan, Google Earth Engine, and Microsoft Planetary Computer. It transforms raw satellite imagery into actionable mission intelligence through a 10-stage AI pipeline.

```
┌─────────────────────────────────────────────────────────────────┐
│                   AKSHA AI ARCHITECTURE                          │
│                                                                  │
│  Satellite Imagery (PNG / JPEG / TIFF / GeoTIFF)               │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 1. METADATA EXTRACTION                                   │   │
│  │    Satellite · Sensor · Date · Coordinates · Scene ID   │   │
│  └──────────────────────────┬──────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼──────────────────────────────┐   │
│  │ 2. PREPROCESSING                                         │   │
│  │    Normalize → 512×512 RGB · Enhance · Validate         │   │
│  └──────────────────────────┬──────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼──────────────────────────────┐   │
│  │ 3. FEATURE EXTRACTION (32-dimensional)                   │   │
│  │    Texture [12] · Spectral [8] · Indices [6] · Spatial [6]│  │
│  └──────────────────────────┬──────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼──────────────────────────────┐   │
│  │ 4. EMBEDDING GENERATION                                  │   │
│  │    Weighted feature vector → L2-normalized unit embedding │  │
│  └──────────────────────────┬──────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼──────────────────────────────┐   │
│  │ 5. SEMANTIC SEARCH                                       │   │
│  │    Cosine similarity vs 50-scene archive → Top-K results │   │
│  └──────────────────────────┬──────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼──────────────────────────────┐   │
│  │ 6. GRAPH RE-RANKING                                      │   │
│  │    Temporal · Spatial · Sensor signals + PageRank        │   │
│  └──────────────────────────┬──────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼──────────────────────────────┐   │
│  │ 7. EVENT DETECTION                                       │   │
│  │    Flood · Fire · Deforestation · Urban · Cloud anomalies│   │
│  └──────────────────────────┬──────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼──────────────────────────────┐   │
│  │ 8. CONFIDENCE ESTIMATION                                 │   │
│  │    Similarity · Feature coherence · Historical agreement │   │
│  └──────────────────────────┬──────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼──────────────────────────────┐   │
│  │ 9. REPORT GENERATION                                     │   │
│  │    Mission Intelligence Report · Recommended Actions     │   │
│  └──────────────────────────┬──────────────────────────────┘   │
│                             │                                    │
│  ┌──────────────────────────▼──────────────────────────────┐   │
│  │ 10. DASHBOARD UPDATE (Frontend SSE stream)               │   │
│  │    Results · Graph · Events · Report → React UI          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Choices

| Layer | Technology | Reason |
|-------|-----------|--------|
| Image processing | Pillow + NumPy | Handles all formats without heavy ML deps |
| Feature extraction | Custom NumPy | GLCM-inspired, interpretable, fast |
| Embedding | L2-normalized feature vector | Cosine similarity = dot product |
| Vector store | In-memory NumPy matrix | 50 scenes fit in RAM; production: FAISS |
| Similarity search | Batch cosine (matrix multiply) | BLAS-optimized, O(N×D) |
| Graph | Adjacency matrix + power iteration | No external graph DB needed |
| Event detection | Rule-based thresholds | Interpretable, no training data |
| API | FastAPI + SSE | Streaming progress, async |
| Frontend | React + Zustand + Framer Motion | Reactive state, smooth animations |

## Production Upgrade Path

Every module is designed with a clear replacement path:

```
Current (Prototype)          →    Production
─────────────────────────────────────────────────────────────────
NumPy feature vectors        →    CNN embeddings (ResNet, EfficientNet)
50-scene synthetic archive   →    2.48M ISRO Bhuvan scenes
In-memory NumPy search       →    FAISS GPU index
Rule-based event detection   →    U-Net / Flood-Net ML models
Template NLG reports         →    Claude claude-sonnet-4-6 LLM reports
JSON metadata extraction     →    GDAL/rasterio full GeoTIFF support
```

## Key AI Concepts Demonstrated

1. **Feature Engineering** — Hand-crafted features that encode domain knowledge
2. **Embedding Space** — Unit-norm vectors where cosine similarity = semantic similarity
3. **Dense Retrieval** — Maximum Inner Product Search (MIPS)
4. **Knowledge Graphs** — Nodes/edges capturing relationships between scenes
5. **PageRank** — Graph-based importance scoring (eigenvector centrality)
6. **Calibrated Confidence** — Multi-signal confidence estimation
7. **NLG** — Template-based natural language generation for mission reports
8. **SSE Streaming** — Real-time pipeline progress to frontend
