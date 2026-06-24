# AKSHA — Complete Folder & File Guide

```
terrabridge/
│
├── backend/                          Python AI backend (FastAPI)
│   ├── main.py                       FastAPI app entry point, all routers, CORS, startup
│   ├── requirements.txt              Python dependencies (FastAPI, Pillow, NumPy, etc.)
│   │
│   └── ai/                           AI pipeline package
│       ├── __init__.py               Package docs and pipeline flow diagram
│       │
│       ├── preprocessing/            Stage 1–2: Image ingestion
│       │   ├── __init__.py
│       │   ├── imageProcessor.py     Load + normalize all image formats → 512×512 RGB
│       │   ├── metadataParser.py     Extract satellite/sensor/date/coords from filename+EXIF
│       │   └── geotiffLoader.py      GeoTIFF-specific loading + bounding box extraction
│       │
│       ├── feature_extraction/       Stage 3: Feature computation
│       │   ├── __init__.py
│       │   ├── textureFeatures.py    12 GLCM-inspired texture statistics (contrast, entropy, edges)
│       │   ├── spectralFeatures.py   8 per-channel stats + 6 derived indices + 5 spatial
│       │   └── featureExtractor.py   Orchestrator → 32-dim feature vector + summary
│       │
│       ├── embeddings/               Stage 4: Embedding + archive
│       │   ├── __init__.py
│       │   ├── embeddingGenerator.py Weighted L2-normalization → unit embedding
│       │   ├── vectorStore.py        50-scene synthetic archive + in-memory store
│       │   └── similarity.py         Cosine similarity: single, batch, top-K
│       │
│       ├── search/                   Stage 5–6: Retrieval + ranking
│       │   ├── __init__.py
│       │   ├── semanticSearch.py     Top-K cosine retrieval + match explanation generation
│       │   └── reranker.py           Temporal + spatial + sensor re-ranking
│       │
│       ├── graph/                    Stage 6 (cont.): Graph analysis
│       │   ├── __init__.py
│       │   ├── graphBuilder.py       Build geo-semantic graph: nodes + edges with AI explanations
│       │   └── graphRanker.py        PageRank computation + score blending
│       │
│       ├── intelligence/             Stage 7–9: Event detection + reporting
│       │   ├── __init__.py
│       │   ├── eventDetector.py      Orchestrates all detectors
│       │   ├── floodDetector.py      Flood/inundation rule-based detection (5 rules)
│       │   ├── anomalyDetector.py    Fire, deforestation, urban expansion, cloud detection
│       │   ├── confidenceEngine.py   4-signal weighted confidence computation
│       │   └── reportGenerator.py    Mission Intelligence Report template generation
│       │
│       └── api/                      Stage 10: HTTP endpoints
│           ├── __init__.py
│           ├── analyze.py            POST /api/analyze — full pipeline with SSE streaming
│           ├── upload.py             POST /api/upload  — metadata preview only
│           └── search.py             GET  /api/search  — text-based archive search
│
├── src/                              React frontend (Vite + TypeScript)
│   ├── main.tsx                      React DOM entry
│   ├── App.tsx                       Router + page layout
│   │
│   ├── services/                     NEW: Backend integration layer
│   │   ├── api.ts                    AKSHA API client with health check + SSE parsing
│   │   └── pipeline.ts               Frontend pipeline orchestration + mock fallback
│   │
│   ├── types/                        TypeScript interfaces
│   │   └── index.ts                  UPDATED: MissionReport, DetectedEvent, FullPipelineStage
│   │
│   ├── store/
│   │   └── useAppStore.ts            UPDATED: missionReport, pipelineEvents, 10-stage support
│   │
│   ├── pages/                        7 page components (unchanged structure)
│   │   ├── CommandCenter.tsx         Earth globe + real-time satellite telemetry
│   │   ├── SearchWorkspace.tsx       UPDATED: MissionReportPanel integrated
│   │   ├── RetrievalResults.tsx      Multi-view result browser
│   │   ├── GeoSemanticGraphPage.tsx  Graph explorer wrapper
│   │   ├── AICopilotPage.tsx         AI assistant chat interface
│   │   ├── Analytics.tsx             KPI dashboard + charts
│   │   └── SatelliteTracker.tsx      Live orbital positions
│   │
│   ├── components/
│   │   ├── intelligence/             NEW: Post-pipeline AI components
│   │   │   └── MissionReport.tsx     Full Mission Intelligence Report display (9 sections)
│   │   │
│   │   ├── search/
│   │   │   ├── UploadZone.tsx        Drag-drop image upload
│   │   │   └── ProcessingPipeline.tsx UPDATED: 10-stage display + live data per stage
│   │   │
│   │   ├── earth/                    Three.js 3D globe
│   │   ├── copilot/                  AI chat interface
│   │   ├── retrieval/                Result cards, gallery, timeline, comparison
│   │   ├── explainability/           Feature radar chart + reasoning panel
│   │   ├── graph/                    D3 geo-semantic graph explorer
│   │   └── ui/                       Shared UI atoms (badges, chips, rings)
│   │
│   ├── data/                         Mock data (archive stats, satellites, results)
│   └── layouts/                      AppLayout, TopBar, LeftPanel, RightPanel, BottomBar
│
└── docs/                             Technical documentation
    ├── AI_ARCHITECTURE.md            Full system architecture + upgrade path
    ├── PIPELINE.md                   Stage-by-stage technical reference
    ├── FOLDER_GUIDE.md               This file
    ├── INTELLIGENCE_SEARCH.md        Semantic search + retrieval deep dive
    ├── GRAPH_SYSTEM.md               Geo-semantic graph system
    └── MISSION_SYSTEM.md             Mission report generation + action workflows
```

## How to Run

### Backend
```bash
cd backend
pip install -r requirements.txt
python main.py
# → http://localhost:8000
# → http://localhost:8000/docs  (interactive API docs)
```

### Frontend
```bash
# from project root
npm install
npm run dev
# → http://localhost:5173
```

The frontend auto-detects the backend on startup. If unavailable, it runs in
**Simulation Mode** with identical UX using mock data.

## Data Flow Summary

```
User uploads image
    ↓ POST /api/analyze (multipart/form-data)
    ↓ SSE stream begins
Stage 1: MetadataParser → satellite, date, coords
Stage 2: ImageProcessor → 512×512 RGB
Stage 3: FeatureExtractor → 32-dim named feature dict
Stage 4: EmbeddingGenerator → unit embedding
Stage 5: SemanticSearch → top-10 cosine matches
Stage 6: Reranker + GraphBuilder + GraphRanker → re-ranked results
Stage 7: EventDetector → flood/anomaly events
Stage 8: ConfidenceEngine → High/Medium/Low + components
Stage 9: ReportGenerator → MissionReport dict
Stage 10: SSE "complete" event → frontend renders results
    ↓ Frontend Zustand store updates
    ↓ Results page auto-navigates
    ↓ MissionReport panel appears
    ↓ Graph page updated
    ↓ Analytics updated
```
