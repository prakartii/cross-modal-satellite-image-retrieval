# AKSHA Intelligence Search — Technical Deep Dive

## What is Semantic Search?

Traditional satellite image search uses metadata filters:
- "Show me all SAR images of Assam in 2024"
- "Find optical imagery with cloud cover < 20%"

AKSHA's semantic search finds images by CONTENT:
- "Find images similar to this flood scene"
- "Retrieve archives that look like this vegetation pattern"
- Even across different sensors: SAR ↔ Optical ↔ Multispectral

This is enabled by embedding-space search.

## Embedding Space

Every image is mapped to a point in 32-dimensional space.
Images with similar content are close together. Different images are far apart.

```
                 Embedding Space (simplified to 2D)

        ●flood2022                      
      ●flood2024    ←── Query Image lands here
        ●floodAssam    (flood characteristics)
        
                        ● vegetation_ghats
                          ● forest_kaziranga
                          ● vegetation_corbett
                          
                                    ● urban_delhi
                                    ● urban_mumbai
```

When you upload an image, we compute its embedding and find the nearest neighbors.
This is why a SAR flood image can match an optical flood image — they're both near
the "flood cluster" in embedding space.

## The 32-Dimensional Feature Vector

Each dimension captures a specific physical property:

```
Dimension 0:  contrast       — How much intensity variation exists?
Dimension 1:  entropy        — How much information content (bits/pixel)?
Dimension 2:  homogeneity    — How similar are adjacent pixels?
Dimension 3:  energy         — How few dominant intensity levels?
Dimension 4:  correlation    — Are adjacent pixels linearly related?
Dimension 5:  edge_density   — What fraction of pixels are edges?
Dimension 6:  mean_gradient  — What's the average Sobel response?
Dimension 7:  coarseness     — How large are uniform regions?
Dimension 8:  directionality — Are gradients more horizontal or vertical?
Dimension 9:  local_std      — What's the mean 7×7 window std dev?
Dimension 10: h_gradient     — Mean horizontal absolute difference?
Dimension 11: v_gradient     — Mean vertical absolute difference?
Dimension 12: mean_r         — Mean red channel value (0–1)
Dimension 13: mean_g         — Mean green channel value (0–1)
Dimension 14: mean_b         — Mean blue channel value (0–1)
Dimension 15: std_r          — Red channel std deviation
Dimension 16: std_g          — Green channel std deviation
Dimension 17: std_b          — Blue channel std deviation
Dimension 18: entropy_r      — Red channel histogram entropy
Dimension 19: entropy_g      — Green channel histogram entropy
Dimension 20: vegetation_idx — (G-R)/(G+R) approximation of NDVI
Dimension 21: water_idx      — (B-R)/(B+R) approximation of NDWI
Dimension 22: brightness     — (R+G+B)/3 overall reflectance
Dimension 23: saturation     — Color diversity (std/mean of channels)
Dimension 24: warm_ratio     — R/(R+G+B) redness fraction
Dimension 25: cool_ratio     — (B+G)/(2×total) coolness fraction
Dimension 26: quad_tl        — Top-left quadrant mean brightness
Dimension 27: quad_tr        — Top-right quadrant mean brightness
Dimension 28: quad_bl        — Bottom-left quadrant mean brightness
Dimension 29: quad_br        — Bottom-right quadrant mean brightness
Dimension 30: spatial_var    — Variance across quadrant means
Dimension 31: complexity     — 0.5×entropy + 0.5×edge_density
```

## Cosine Similarity

Why cosine similarity and not Euclidean distance?

Cosine similarity = angle between vectors (not magnitude):
```
sim(a, b) = a·b / (|a| × |b|) = a·b  (for unit vectors)
```

Benefits:
1. Scale-invariant: a bright image and a dark image of the same scene can still match
2. Computationally efficient: single matrix multiply
3. Directly interpretable: 1.0 = identical, 0.0 = orthogonal, -1.0 = opposite

For L2-normalized unit vectors, cosine similarity equals the dot product —
no division needed. This is why we normalize embeddings before storage.

## The Synthetic Archive

The 50-scene archive is organized into 5 scene categories:

| Category | Count | Key Features |
|----------|-------|-------------|
| Flood | 10 | water_index=0.78, vegetation=0.35, smooth texture |
| Vegetation | 10 | vegetation_index=0.88, water=0.22, medium texture |
| Urban | 10 | edge_density=0.72, brightness=0.45, high contrast |
| Agriculture | 10 | vegetation=0.70, correlation=0.72, warm tones |
| Coastal | 10 | water=0.58, mixed spectral, high spatial variance |

When you upload a flood image, its water_index will be high, placing it near
the flood cluster. The top results will be the archive flood scenes.

## Feature Weights

Not all features are equally discriminative:

```python
FEATURE_WEIGHTS = {
    vegetation_index: 1.5,  # Most discriminative (identifies land cover)
    water_index:      1.5,  # Most discriminative (identifies water/flood)
    brightness:       1.2,  # High weight (distinguishes cloud/snow from other)
    edge_density:     1.3,  # High weight (distinguishes urban from natural)
    entropy:          1.2,  # High weight (distinguishes complex from simple)
    # ... most texture dims at 0.6–1.0 weight
}
```

Higher weights emphasize more discriminative features in the final embedding.

## Re-ranking

Initial cosine similarity rank can be improved with additional signals:

```
Final Score = 0.55 × cosine_similarity
            + 0.20 × temporal_score     # exp(-|Δdays| / 260)
            + 0.15 × spatial_score      # exp(-dist_km / 577)
            + 0.10 × sensor_score       # SAR↔SAR=1.0, SAR↔Optical=0.7
```

This ensures that for disaster monitoring:
- Recent images of the same event rank higher
- Geographically adjacent scenes rank higher
- Same-sensor matches rank higher than cross-modal matches

## Production Scale

At 2.48M ISRO Bhuvan scenes (production scale):

```
Current (50 scenes):      O(50 × 32)  = 1,600 multiplications
Production (2.48M scenes): O(2.48M × 32) = 79.4M multiplications

GPU (NVIDIA A100):
  - Throughput: ~312 TFLOPS (float32)
  - Time: 79.4M / 312T ≈ 0.25 microseconds per query!

FAISS IVF-HNSW (approximate):
  - ~10× faster than exact search
  - <0.1% recall loss at 95% speed
  - Used by ISRO Bhuvan, Copernicus, Google Earth Engine
```
