# AKSHA Intelligence Pipeline — Complete Technical Reference

## Stage 1: Metadata Extraction
**File:** `backend/ai/preprocessing/metadataParser.py`
**Duration:** ~700ms  
**Input:** Raw filename + PIL Image  
**Output:** {satellite, sensor_type, acquisition_date, region, coords, scene_id, cloud_cover}

Extracts structured metadata using three sources:
1. Filename pattern matching (Sentinel-2, RISAT-2B, Cartosat-3 naming conventions)
2. EXIF GPS data (for JPEG exports with embedded coordinates)
3. Statistical inference (SAR = grayscale high-contrast; cloud = bright + uniform)

---

## Stage 2: Preprocessing
**File:** `backend/ai/preprocessing/imageProcessor.py`  
**Duration:** ~900ms  
**Input:** Raw image bytes  
**Output:** Normalized 512×512 RGB PIL Image + pixel statistics

Normalization pipeline:
1. Format detection and Pillow open (PNG/JPEG/TIFF/GeoTIFF)
2. Mode conversion: L→RGB, RGBA→RGB, I/F→8-bit→RGB
3. Auto-enhancement: mild contrast boost if dynamic range < 80
4. LANCZOS resize to 512×512
5. Pixel statistics: mean, std per channel, dynamic range

---

## Stage 3: Feature Extraction
**File:** `backend/ai/feature_extraction/featureExtractor.py`  
**Duration:** ~1400ms  
**Input:** 512×512 RGB PIL Image  
**Output:** 32-dimensional feature vector + named feature dict

### Texture features (dims 0–11)
Computed on luminance (grayscale) channel:
- **Contrast**: mean squared gradient between adjacent pixels
- **Entropy**: Shannon information entropy from pixel histogram
- **Homogeneity**: inverse of mean absolute difference
- **Energy**: sum of squared histogram probabilities
- **Correlation**: Pearson correlation between adjacent pixels
- **Edge density**: fraction of pixels with Sobel gradient > 30
- **Mean gradient**: average Sobel magnitude
- **Coarseness**: 1 - normalized std (inverse texture roughness)
- **Directionality**: horizontal / total gradient ratio
- **Local std**: mean of 7×7 sliding window standard deviations
- **H/V gradient**: mean absolute horizontal/vertical differences

### Spectral features (dims 12–19)
Per RGB channel statistics:
- Mean R, G, B (normalized to [0,1])
- Std R, G, B
- Entropy R, G (from 64-bin histogram)

### Derived indices (dims 20–25)
Physically motivated spectral indices:
- **Vegetation index**: (G-R)/(G+R+ε) — approx. NDVI
- **Water index**: (B-R)/(B+R+ε) — approx. NDWI
- **Brightness**: (R+G+B)/3
- **Saturation**: std(R,G,B) / mean(R,G,B)
- **Warm ratio**: R/(R+G+B)
- **Cool ratio**: (B+G)/(2×total)

### Spatial features (dims 26–31)
- Quadrant means (TL, TR, BL, BR)
- Spatial variance across quadrants
- Scene complexity: 0.5×entropy + 0.5×edge_density

---

## Stage 4: Embedding Generation
**File:** `backend/ai/embeddings/embeddingGenerator.py`  
**Duration:** ~400ms  
**Input:** 32-dim feature vector  
**Output:** 32-dim unit embedding (L2 norm = 1.0)

1. Apply per-dimension weights (vegetation_index=1.5, edge_density=1.3, brightness=1.2)
2. L2 normalize: embedding = weighted / ||weighted||
3. Result: dot product with another unit vector = cosine similarity

---

## Stage 5: Semantic Search
**File:** `backend/ai/search/semanticSearch.py`  
**Duration:** ~600ms  
**Input:** Query embedding (32,) + archive embeddings (50, 32)  
**Output:** Top-K SearchResult objects

Algorithm:
1. `similarities = archive_embeddings @ query_embedding`  (batch cosine)
2. Filter: `similarities[similarities > threshold]`
3. `top_k = argpartition(similarities, -K)[-K:]`  (O(N) partial sort)
4. Sort top-K by similarity descending
5. For each result: compute feature_similarity and match_explanation

---

## Stage 6: Graph Re-ranking
**Files:** `backend/ai/search/reranker.py`, `backend/ai/graph/graphBuilder.py`, `backend/ai/graph/graphRanker.py`  
**Duration:** ~800ms  
**Input:** SearchResult list  
**Output:** Re-ranked results + graph dict

1. **Temporal score**: `exp(-|Δdays| / 260)` — recent = more relevant
2. **Spatial score**: `exp(-dist_km / 577)` — nearby = more relevant
3. **Sensor score**: SAR↔SAR=1.0, SAR↔Optical=0.7, etc.
4. **Final rerank score**: 0.55×sim + 0.20×temporal + 0.15×spatial + 0.10×sensor
5. **Graph**: nodes (query, results, satellites) + edges (semantic, spatial, temporal, provenance)
6. **PageRank**: power iteration on weighted adjacency matrix
7. **Graph blend**: (1-0.15)×similarity + 0.15×pagerank

---

## Stage 7: Event Detection
**Files:** `backend/ai/intelligence/eventDetector.py`, `floodDetector.py`, `anomalyDetector.py`  
**Duration:** ~500ms  
**Input:** Feature dict  
**Output:** List of DetectedEvent objects

### Flood detection rules
| Rule | Threshold | Contribution |
|------|-----------|-------------|
| Water index > 0.58 | High water spectral signature | 0.40–0.60 |
| Blue > Red + 0.10 | Blue channel dominance | 0.20–0.45 |
| Vegetation < 0.45 | Suppressed NDVI proxy | 0.10–0.25 |
| Homogeneity > 0.65 | Smooth surface | 0.10–0.25 |
| Edge density < 0.25 | Few internal edges | 0.10–0.20 |

Severity thresholds:
- **Critical**: confidence > 0.85 AND inundation > 50%
- **High**: confidence > 0.70 OR inundation > 35%
- **Moderate**: confidence > 0.55 OR inundation > 15%

### Anomaly detection
- **Fire**: warm ratio > 0.50 + vegetation < 0.35 + red > blue + 0.12
- **Deforestation**: 0.30 < vegetation < 0.60 + edge > 0.45 + spatial_var > 0.08
- **Urban expansion**: edge > 0.60 + vegetation < 0.30 + 0.35 < brightness < 0.80
- **Dense cloud**: brightness > 0.78 + homogeneity > 0.65

---

## Stage 8: Confidence Estimation
**File:** `backend/ai/intelligence/confidenceEngine.py`  
**Duration:** ~400ms  
**Input:** Similarity score + 3 computed signals  
**Output:** ConfidenceReport {overall, level, components, explanation, limitations}

Weighted formula:
```
confidence = 0.40 × similarity
           + 0.25 × feature_consistency
           + 0.25 × historical_agreement
           + 0.10 × metadata_quality
```

Component computation:
- **feature_consistency**: 1 - contradiction_score (water+veg both high = contradiction)
- **historical_agreement**: most_common_profile_count / top_5_count
- **metadata_quality**: weighted sum of present fields (satellite=0.20, coords=0.25, ...)

---

## Stage 9: Report Generation
**File:** `backend/ai/intelligence/reportGenerator.py`  
**Duration:** ~600ms  
**Input:** All previous stage outputs  
**Output:** Full MissionReport JSON dict

Sections:
1. Executive summary (template with detected event + confidence)
2. Scene metadata (satellite, date, region, resolution)
3. Detected events (list with severity + recommendations)
4. Search summary (top-5 matches)
5. Confidence (overall + component breakdown)
6. Feature analysis (water %, vegetation %, edge %)
7. Historical context (analogues from archive)
8. Recommended actions (prioritized: IMMEDIATE / HIGH / MEDIUM / LOW)
9. Pipeline timeline (all 10 stages with descriptions)

---

## Stage 10: SSE Delivery
**File:** `backend/ai/api/analyze.py`  
**Duration:** Streaming (concurrent with computation)

Each stage emits:
```json
data: {"stage": "feature_extraction", "progress": 38, "data": {...}}
```

Final event:
```json
data: {"stage": "complete", "progress": 100, "data": {
  "results": [...],
  "graph": {...},
  "events": [...],
  "confidence": {...},
  "report": {...},
  "metadata": {...},
  "features": {...}
}}
```
