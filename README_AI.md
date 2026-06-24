# AKSHA Earth Intelligence — AI Pipeline Reference

```
                        AKSHA AI ARCHITECTURE v2.0
                     Mission-Centric Intelligence System

  ┌─────────────────────────────────────────────────────────────────────┐
  │                    SATELLITE IMAGE UPLOAD                            │
  │  PNG / JPEG / TIFF / GeoTIFF — any satellite sensor format          │
  └─────────────────────────┬───────────────────────────────────────────┘
                            │
                   POST /api/analyze (SSE stream)
                            │
  ┌─────────────────────────▼───────────────────────────────────────────┐
  │                    MISSION OBJECT CREATED                            │
  │   Mission(id, filename) — every stage writes into this object        │
  └─────────────────────────┬───────────────────────────────────────────┘
                            │
          ┌─────────────────▼─────────────────┐
          │     STAGE 1: METADATA EXTRACTION   │  ~400ms
          │  satellite · sensor · date · GPS  │
          │  filename regex + EXIF parsing     │
          └─────────────────┬─────────────────┘
                            │
          ┌─────────────────▼─────────────────┐
          │     STAGE 2: PREPROCESSING        │  ~800ms
          │  → 512×512 RGB normalization      │
          │  mode conversion (L/RGBA/I/F→RGB)  │
          │  histogram equalization            │
          │  thumbnail b64 for Compare view   │
          └─────────────────┬─────────────────┘
                            │
          ┌─────────────────▼─────────────────┐
          │     STAGE 3: FEATURE EXTRACTION   │  ~1200ms
          │  32-dimensional feature vector:   │
          │  Texture [12]: contrast, entropy,  │
          │    homogeneity, edge_density, ...  │
          │  Spectral [8]: mean_r/g/b, std,   │
          │    per-channel entropy             │
          │  Indices [6]: vegetation_index,    │
          │    water_index, brightness, ...    │
          │  Spatial [6]: quadrant means,      │
          │    spatial_var, complexity         │
          └─────────────────┬─────────────────┘
                            │
          ┌─────────────────▼─────────────────┐
          │     STAGE 4: EMBEDDING GENERATION │  ~200ms
          │  features × FEATURE_WEIGHTS       │
          │  L2 normalize → unit vector       │
          │  cos_sim(a,b) = a·b (dot product) │
          └─────────────────┬─────────────────┘
                            │
          ┌─────────────────▼─────────────────┐
          │     STAGE 5: SEMANTIC SEARCH      │  ~600ms
          │  sims = archive_matrix @ query     │
          │  shape: (100,32) @ (32,) = (100,) │
          │  argpartition O(N) → top-K        │
          │  Re-rank: 0.60×sim + 0.18×time   │
          │         + 0.12×spatial + 0.10×sen │
          └─────────────────┬─────────────────┘
                            │
          ┌─────────────────▼─────────────────┐
          │     STAGE 6: GRAPH BUILDING       │  ~400ms
          │  Nodes: query + results + sats     │
          │  Edges: semantic/spatial/temporal  │
          │  PageRank power iteration          │
          │  graph changes per uploaded image  │
          └─────────────────┬─────────────────┘
                            │
          ┌─────────────────▼─────────────────┐
          │     STAGE 7: EVENT DETECTION      │  ~100ms
          │  Rule-based from feature vector:  │
          │  Flood: water_idx>0.60 + 4 rules  │
          │  Fire: warm_ratio>0.45 + 3 rules  │
          │  Deforestation: vi in [0.30,0.60] │
          │  Urban: edge_density > 0.55       │
          │  Cloud: brightness>0.76 + smooth  │
          │  Drought: vi<0.28 + warm>0.40     │
          └─────────────────┬─────────────────┘
                            │
          ┌─────────────────▼─────────────────┐
          │     STAGE 8: CONFIDENCE SCORING   │  ~100ms
          │  0.40 × similarity                │
          │  0.25 × feature_consistency       │
          │  0.25 × historical_agreement      │
          │  0.10 × metadata_quality          │
          │  → High / Medium / Low + details  │
          └─────────────────┬─────────────────┘
                            │
          ┌─────────────────▼─────────────────┐
          │     STAGE 9: SYNTHESIS            │  ~300ms
          │  Report: all pipeline outputs     │
          │  Timeline: pipeline + historical  │
          │  Analytics: coverage / spectral   │
          └─────────────────┬─────────────────┘
                            │
          ┌─────────────────▼─────────────────┐
          │     STAGE 10: SSE "complete"      │
          │  Full Mission JSON → frontend     │
          │  Every page reads Mission data    │
          └───────────────────────────────────┘
```

## Key AI Concepts

### 1. Feature Engineering
Converting raw pixels to meaningful numbers.

```python
# Water index (approximates NDWI):
# NDWI = (Green - NIR) / (Green + NIR)
# We use Blue instead of NIR (RGB only):
water_index = (blue - red) / (blue + red + ε)
# Range: [-1, 1] shifted to [0, 1]
# Flood image → water_index ≈ 0.78
# Forest image → water_index ≈ 0.22
```

### 2. Embeddings + Cosine Similarity
Mapping images to a unit hypersphere for efficient comparison.

```python
# Step 1: Weight features by importance
weighted = feature_vector * FEATURE_WEIGHTS
# water_index weight = 1.5 (most discriminative)

# Step 2: L2 normalize to unit sphere
embedding = weighted / np.linalg.norm(weighted)
# Now: ||embedding||₂ = 1.0

# Step 3: Cosine similarity = dot product (for unit vectors)
similarity = np.dot(query_embedding, archive_embedding)
# Range: [0, 1], higher = more similar

# Step 4: Batch search (all 100 archive entries at once)
similarities = archive_matrix @ query_embedding  # (100,32) @ (32,) = (100,)
```

### 3. Why These Features Work
A flood image has high water_index (~0.75).
Archive flood entries also have high water_index (~0.78).
Both embeddings point in the same direction in 32-dim space.
Dot product is high → high similarity → flood results rank first.

This is **physics-driven retrieval** — not keyword matching.

### 4. Re-ranking Formula
```
final_score = 0.60 × cosine_similarity
            + 0.18 × exp(-|Δdays| / 527)    # half-life: 365 days
            + 0.12 × exp(-dist_km / 721)    # half-life: 500 km
            + 0.10 × sensor_compatibility   # SAR↔SAR=1.0, SAR↔Optical=0.7
```

### 5. Event Detection Rules
```python
# Flood detection:
water_index > 0.60   → weight 0.40  (strong water spectral signature)
blue > red + 0.08    → weight 0.25  (blue channel dominance)
vegetation < 0.40    → weight 0.18  (suppressed vegetation)
homogeneity > 0.68   → weight 0.10  (smooth water surface)
edge_density < 0.22  → weight 0.07  (no texture = open water)
confidence = Σ(triggered_weights) / Σ(all_weights)
```

## How to Run

```bash
# 1. Start the backend
cd backend
pip install fastapi uvicorn pillow numpy python-multipart
python main.py
# → http://localhost:8000

# 2. Start the frontend
# (from project root)
npm run dev
# → http://localhost:5173

# 3. Upload any satellite image
# The pipeline will analyze it and populate all pages with real data.
```

## Archive Design

The 100-scene archive has deterministic embeddings:

```
Category        Count  Key features                    Example locations
────────────────────────────────────────────────────────────────────────
Flood           20     water_idx=0.78, veg=0.18        Brahmaputra, Bihar, Kerala
Vegetation      20     veg=0.85, water=0.22            Western Ghats, Kaziranga
Urban           20     edge_density=0.68, veg=0.25     Delhi, Mumbai, Bangalore
Agriculture     20     veg=0.68, correlation=0.68      Punjab, UP Gangetic Plain
Coastal         20     water=0.58, spatial_var=0.08    Kerala backwaters, Goa
```

Archive embeddings are computed from feature profiles using the SAME
function as the pipeline. Upload a flood image → your features match
the flood profile → high cosine similarity with flood archive entries.

## Production Upgrade Path

```
Current                         →  Production
────────────────────────────────────────────────────────────────────────────
32-dim hand-crafted features    →  128-dim CNN embeddings (ResNet-50 + SAR tuning)
100-scene in-memory store       →  2.48M ISRO Bhuvan scenes in FAISS GPU index
Rule-based event detection      →  Flood-Net / U-Net trained on NDMA ground truth
Template NLG reports            →  Claude claude-sonnet-4-6 LLM with mission context RAG
JSON metadata extraction        →  GDAL/rasterio for full GeoTIFF/HDF5 support
Single server exhaustive search →  Distributed IVF-PQ approximate nearest neighbor
```
