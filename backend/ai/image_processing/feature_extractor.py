"""
backend/ai/image_processing/feature_extractor.py

PURPOSE:
  Stage 3 of the AKSHA AI pipeline.
  Converts a preprocessed 512×512 RGB image into a 32-dimensional feature vector.
  This feature vector is the numerical "fingerprint" of the image — it captures
  everything relevant about the scene in a compact, comparable form.

WHY FEATURE EXTRACTION:
  Raw images (512×512×3 = 786,432 pixels) are too large and noisy for direct
  comparison. Feature extraction reduces this to 32 carefully chosen numbers
  that capture the most discriminative properties:
    - TEXTURE: How uniform or complex is the surface?
    - SPECTRAL: What are the dominant colors/wavelengths?
    - INDICES: What are the physical surface cover estimates?
    - SPATIAL: Is the image uniform or does it vary by region?

FEATURE CATEGORIES (32 total):
  ┌─────────────────────────────────────────────────────────────────────────┐
  │ Texture features (dims 0-11)  — computed on grayscale (luminance) image │
  │   contrast, entropy, homogeneity, energy, correlation, edge_density,    │
  │   mean_gradient, coarseness, directionality, local_std,                 │
  │   h_gradient, v_gradient                                                │
  │                                                                          │
  │ Spectral features (dims 12-19) — per-channel statistics                 │
  │   mean_r, mean_g, mean_b, std_r, std_g, std_b, entropy_r, entropy_g    │
  │                                                                          │
  │ Derived indices (dims 20-25) — physically motivated                     │
  │   vegetation_index (≈NDVI), water_index (≈NDWI), brightness,           │
  │   saturation, warm_ratio, cool_ratio                                    │
  │                                                                          │
  │ Spatial features (dims 26-31) — quadrant analysis                       │
  │   quad_tl, quad_tr, quad_bl, quad_br, spatial_var, complexity           │
  └─────────────────────────────────────────────────────────────────────────┘

KEY AI CONCEPT — WHY THESE SPECIFIC FEATURES:
  These features correspond to ISRO's operational indices for remote sensing:
    NDVI (Normalized Difference Vegetation Index) = (NIR - R) / (NIR + R)
      → We approximate this with (G - R) / (G + R) since we lack NIR band
      → High NDVI → dense vegetation (forests, crops)
      → Low NDVI → bare soil, water, urban surfaces

    NDWI (Normalized Difference Water Index) = (G - NIR) / (G + NIR)
      → We approximate with (B - R) / (B + R)
      → High NDWI → open water, floods

  LBP (Local Binary Patterns):
    For each pixel, we compare it to its 8 neighbors.
    If neighbor ≥ center: bit = 1; else: bit = 0.
    The resulting 8-bit code is the LBP code for that pixel.
    LBP histogram captures texture patterns without requiring gradient information.
    Invented by Ojala et al. (1996), still widely used in texture analysis.

  GLCM (Gray Level Co-occurrence Matrix) approximation:
    GLCM counts how often pairs of pixel intensities (i, j) appear adjacent.
    From GLCM we derive contrast, homogeneity, energy, correlation.
    Full GLCM is expensive (O(P^2)); we approximate with pixel-pair statistics.

INPUT:  (img: PIL.Image at 512×512 RGB, stats: dict from preprocessing)
OUTPUT: dict with 32 named features + numpy feature_vector + scene_type

COMPLEXITY: O(W × H) for most features, O(W × H × 8) for LBP.
"""

from __future__ import annotations

from typing import Any

import numpy as np
from PIL import Image


# ── Feature vector ordering ────────────────────────────────────────────────
# These 32 names define EXACTLY what goes in each dimension.
# The archive store uses the same ordering — keep in sync!
FEATURE_NAMES: list[str] = [
    # Texture (0-11)
    "contrast",
    "entropy",
    "homogeneity",
    "energy",
    "correlation",
    "edge_density",
    "mean_gradient",
    "coarseness",
    "directionality",
    "local_std",
    "h_gradient",
    "v_gradient",
    # Spectral (12-19)
    "mean_r",
    "mean_g",
    "mean_b",
    "std_r",
    "std_g",
    "std_b",
    "entropy_r",
    "entropy_g",
    # Derived indices (20-25)
    "vegetation_index",
    "water_index",
    "brightness",
    "saturation",
    "warm_ratio",
    "cool_ratio",
    # Spatial quadrant (26-31)
    "quad_tl",
    "quad_tr",
    "quad_bl",
    "quad_br",
    "spatial_var",
    "complexity",
]

assert len(FEATURE_NAMES) == 32, "Feature vector must be exactly 32-dimensional"


class FeatureExtractor:
    """
    Extracts a 32-dimensional feature vector from a preprocessed satellite image.
    All features are computed from the image pixels — no hardcoding, no random values.
    The same image always produces the same feature vector (deterministic).
    """

    def extract(
        self,
        img: Image.Image,
        stats: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Main entry point for feature extraction.

        Args:
            img: Preprocessed 512×512 RGB PIL image
            stats: Pixel statistics from preprocessing stage

        Returns:
            dict with keys:
              - "features": dict[str → float] — all 32 named features
              - "feature_vector": list[float] — same 32 values as ordered list
              - "feature_vector_names": list[str] — FEATURE_NAMES
              - "scene_type": str — inferred dominant scene type
        """
        # Convert to float32 NumPy arrays in [0, 1]
        arr = np.array(img, dtype=np.float32) / 255.0  # (H, W, 3)
        gray = (0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2])

        # Extract all feature groups
        texture  = self._extract_texture(gray)
        spectral = self._extract_spectral(arr)
        indices  = self._extract_indices(arr)
        spatial  = self._extract_spatial(arr)

        # Assemble 32-dim feature dict
        features: dict[str, float] = {}
        features.update(texture)
        features.update(spectral)
        features.update(indices)
        features.update(spatial)

        # Build ordered feature vector (must match FEATURE_NAMES order)
        vector = [float(np.clip(features[name], 0.0, 1.0)) for name in FEATURE_NAMES]

        # Infer scene type from dominant features (for display and archive matching)
        scene_type = self._infer_scene_type(features)

        return {
            "features":              features,
            "feature_vector":        vector,
            "feature_vector_names":  FEATURE_NAMES,
            "scene_type":            scene_type,
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Texture features (computed on grayscale)
    # ─────────────────────────────────────────────────────────────────────────

    def _extract_texture(self, gray: np.ndarray) -> dict[str, float]:
        """
        Extract 12 texture features from the grayscale luminance image.

        Texture tells us about the surface structure:
          - Water: smooth, low contrast, high homogeneity
          - Urban: high contrast, high edge density, directional edges
          - Vegetation: medium texture, organic patterns
          - Cloud: very smooth, very high homogeneity
        """
        H, W = gray.shape

        # ── Horizontal and vertical gradients ────────────────────────────────
        # A gradient measures how fast pixel values change.
        # Edge pixels have large gradients; uniform areas have small gradients.
        # These are first-order difference approximations (not full Sobel convolution
        # to avoid edge effects from padding).
        h_diff = np.abs(np.diff(gray, axis=1))   # shape (H, W-1)
        v_diff = np.abs(np.diff(gray, axis=0))   # shape (H-1, W)

        mean_h = float(np.mean(h_diff))
        mean_v = float(np.mean(v_diff))

        # ── Contrast ─────────────────────────────────────────────────────────
        # Variance of horizontal differences — how variable are the changes?
        # High contrast → water-urban boundary, forest edges
        # Low contrast → open water, cloud decks
        contrast = float(np.var(h_diff) + np.var(v_diff))
        contrast_norm = float(np.clip(contrast * 20.0, 0.0, 1.0))  # normalize to [0,1]

        # ── Entropy ──────────────────────────────────────────────────────────
        # Shannon entropy measures the "surprise" or information content.
        # H(X) = -Σ p(x) log₂ p(x)
        # High entropy → complex textures (urban, forest canopy)
        # Low entropy → simple textures (water, cloud, bare soil)
        hist, _ = np.histogram(gray, bins=256, range=(0.0, 1.0))
        hist = hist.astype(np.float64)
        total = hist.sum()
        if total > 0:
            p = hist / total
            p = p[p > 0]  # avoid log(0)
            entropy_val = float(-np.sum(p * np.log2(p)))
        else:
            entropy_val = 0.0
        entropy_norm = float(np.clip(entropy_val / 8.0, 0.0, 1.0))  # max entropy = 8 bits

        # ── Homogeneity ───────────────────────────────────────────────────────
        # How similar are adjacent pixels? Inverse of mean absolute difference.
        # Formula: homogeneity = 1 / (1 + mean(|diff|))
        # High → uniform surface (water, cloud)
        # Low  → rough surface (urban, forest, agriculture)
        mean_diff = (mean_h + mean_v) / 2.0
        homogeneity = float(1.0 / (1.0 + mean_diff * 5.0))

        # ── Energy ───────────────────────────────────────────────────────────
        # Sum of squared histogram values (ASM — Angular Second Moment).
        # High energy → few dominant intensity levels (simple/smooth)
        # Low energy  → many intensity levels (complex texture)
        if total > 0:
            p_all = hist / total
            energy = float(np.sum(p_all ** 2))
        else:
            energy = 0.0

        # ── Correlation ───────────────────────────────────────────────────────
        # Pearson correlation between adjacent pixel intensities.
        # Measures how predictable each pixel value is from its neighbor.
        # High correlation → smooth gradients (water surface, haze)
        # Low correlation  → random textures (speckle noise in SAR, gravel)
        flat = gray.flatten()
        if len(flat) > 1:
            corr = float(np.corrcoef(flat[:-1], flat[1:])[0, 1])
            corr_norm = float(np.clip((corr + 1.0) / 2.0, 0.0, 1.0))  # [-1,1] → [0,1]
        else:
            corr_norm = 0.5

        # ── Edge density via Sobel approximation ─────────────────────────────
        # Sobel operator approximates image gradient:
        #   Gx = [[-1,0,+1],[-2,0,+2],[-1,0,+1]] convolved with image
        #   Gy = [[-1,-2,-1],[0,0,0],[+1,+2,+1]] convolved with image
        #   |G| = sqrt(Gx² + Gy²)
        # We use a cheaper approximation: just the 3-pixel horizontal/vertical difference
        # Edge density = fraction of pixels where |G| > threshold
        grad_mag = np.sqrt(h_diff[:H-1, :W-1]**2 + v_diff[:H-1, :W-1]**2)
        edge_threshold = 0.08  # pixels with gradient > 8% of range are "edges"
        edge_density = float(np.mean(grad_mag > edge_threshold))
        mean_gradient = float(np.mean(grad_mag))

        # ── Coarseness ───────────────────────────────────────────────────────
        # Inverse measure of texture fineness.
        # A scene with large uniform regions (water, agricultural fields) has
        # high coarseness. A scene with fine-grained texture (forest canopy, urban)
        # has low coarseness.
        # Approximation: 1 - normalized std of local 8×8 means
        blk = 8
        block_means = []
        for i in range(0, H - blk, blk):
            for j in range(0, W - blk, blk):
                block_means.append(float(np.mean(gray[i:i+blk, j:j+blk])))
        if block_means:
            coarseness = float(np.clip(1.0 - np.std(block_means) * 4.0, 0.0, 1.0))
        else:
            coarseness = 0.5

        # ── Directionality ─────────────────────────────────────────────────
        # Ratio of horizontal to total gradient energy.
        # High → mostly horizontal edges (rivers, coastlines, terraced fields)
        # Low  → mostly vertical edges (building facades, cliff faces)
        total_grad = mean_h + mean_v + 1e-9
        directionality = float(mean_h / total_grad)

        # ── Local standard deviation ─────────────────────────────────────────
        # Mean of 7×7 sliding window standard deviations (sampled every 4 pixels).
        # Captures local texture variation across the image.
        # High → heterogeneous scene (mixed land cover)
        # Low  → homogeneous scene (open water, bare field)
        local_stds = []
        step = 8  # sample every 8 pixels to keep it fast
        win  = 7
        for i in range(0, H - win, step):
            for j in range(0, W - win, step):
                local_stds.append(float(np.std(gray[i:i+win, j:j+win])))
        local_std = float(np.mean(local_stds)) if local_stds else 0.0
        local_std_norm = float(np.clip(local_std * 5.0, 0.0, 1.0))

        return {
            "contrast":      contrast_norm,
            "entropy":       entropy_norm,
            "homogeneity":   homogeneity,
            "energy":        energy,
            "correlation":   corr_norm,
            "edge_density":  edge_density,
            "mean_gradient": float(np.clip(mean_gradient * 5.0, 0.0, 1.0)),
            "coarseness":    coarseness,
            "directionality": directionality,
            "local_std":     local_std_norm,
            "h_gradient":    float(np.clip(mean_h * 5.0, 0.0, 1.0)),
            "v_gradient":    float(np.clip(mean_v * 5.0, 0.0, 1.0)),
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Spectral features (per-channel statistics)
    # ─────────────────────────────────────────────────────────────────────────

    def _extract_spectral(self, arr: np.ndarray) -> dict[str, float]:
        """
        Extract per-channel spectral statistics.

        Each RGB channel encodes different physical information:
          R (Red):    reflectance in the visible red band (~620-750nm)
                      High R → warm surfaces (bare soil, buildings in sunlight)
          G (Green):  reflectance in the visible green band (~495-570nm)
                      High G → active vegetation (chlorophyll reflectance peak at 550nm)
          B (Blue):   reflectance in the visible blue band (~450-495nm)
                      High B → atmospheric scattering, water bodies

        WHY ENTROPY PER CHANNEL:
          Shannon entropy of the channel histogram tells us how many
          distinct brightness levels are present. High entropy → complex
          spectral content. Low entropy → single dominant brightness.
        """
        r = arr[:, :, 0]
        g = arr[:, :, 1]
        b = arr[:, :, 2]

        def chan_entropy(ch: np.ndarray) -> float:
            hist, _ = np.histogram(ch, bins=64, range=(0.0, 1.0))
            p = hist / (hist.sum() + 1e-9)
            p = p[p > 0]
            return float(np.clip(-np.sum(p * np.log2(p)) / 6.0, 0.0, 1.0))

        return {
            "mean_r":    float(np.mean(r)),
            "mean_g":    float(np.mean(g)),
            "mean_b":    float(np.mean(b)),
            "std_r":     float(np.clip(np.std(r) * 3.0, 0.0, 1.0)),
            "std_g":     float(np.clip(np.std(g) * 3.0, 0.0, 1.0)),
            "std_b":     float(np.clip(np.std(b) * 3.0, 0.0, 1.0)),
            "entropy_r": chan_entropy(r),
            "entropy_g": chan_entropy(g),
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Derived physical indices
    # ─────────────────────────────────────────────────────────────────────────

    def _extract_indices(self, arr: np.ndarray) -> dict[str, float]:
        """
        Extract physically-motivated spectral indices.

        These indices encode domain knowledge from remote sensing science.
        They are the most discriminative features for scene classification.

        NDVI Approximation (vegetation_index):
          True NDVI = (NIR - R) / (NIR + R)
          We lack the NIR band, so we use: (G - R) / (G + R + ε)
          This is sometimes called VARI (Visible Atmospherically Resistant Index).
          Values: vegetation → positive, water/bare soil → negative
          We shift to [0,1]: (raw_index + 1) / 2

        NDWI Approximation (water_index):
          True NDWI = (G - NIR) / (G + NIR)
          We approximate: (B - R) / (B + R + ε)
          This detects the high blue reflectance of water bodies.
          Flood detection: water_index > 0.1 is significant

        WHY THESE MATTER:
          The archive flood scenes have high water_index (~0.75).
          When you upload a flood image, it will also have high water_index.
          Cosine similarity will be high → flood scenes rank at top.
          This is genuine physics-driven matching, not keyword lookup!
        """
        eps = 1e-6
        r = arr[:, :, 0]
        g = arr[:, :, 1]
        b = arr[:, :, 2]

        # VARI (Vegetation Approximation)
        veg_raw = (g - r) / (g + r + eps)
        veg_idx = float(np.clip((np.mean(veg_raw) + 1.0) / 2.0, 0.0, 1.0))

        # Water Index
        wat_raw = (b - r) / (b + r + eps)
        wat_idx = float(np.clip((np.mean(wat_raw) + 1.0) / 2.0, 0.0, 1.0))

        # Brightness (mean luminance across all channels)
        brightness = float(np.mean((r + g + b) / 3.0))

        # Saturation (color diversity = std across channels)
        # High saturation → colorful scene
        # Low saturation → grayscale-like (SAR, heavy cloud)
        chan_stds = np.array([np.mean(r), np.mean(g), np.mean(b)])
        saturation = float(np.clip(np.std(chan_stds) * 8.0, 0.0, 1.0))

        # Warm ratio: proportion of brightness in R channel
        total = np.mean(r) + np.mean(g) + np.mean(b) + eps
        warm_ratio = float(np.mean(r) / total)
        cool_ratio = float((np.mean(b) + np.mean(g)) / (2 * total))

        return {
            "vegetation_index": veg_idx,
            "water_index":      wat_idx,
            "brightness":       brightness,
            "saturation":       saturation,
            "warm_ratio":       warm_ratio,
            "cool_ratio":       cool_ratio,
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Spatial features (quadrant analysis)
    # ─────────────────────────────────────────────────────────────────────────

    def _extract_spatial(self, arr: np.ndarray) -> dict[str, float]:
        """
        Extract spatial distribution features by dividing image into quadrants.

        WHY QUADRANT ANALYSIS:
          Some scenes have spatial gradients — e.g., a coastal image has
          water in one half and land in the other. Quadrant means capture
          this spatial structure in 4 numbers instead of analyzing every pixel.

          spatial_var captures how different the quadrants are from each other.
          High spatial_var → heterogeneous scene (coast, flood edge, urban-rural boundary)
          Low spatial_var  → homogeneous scene (open water, uniform field)

        complexity = 0.5 × entropy + 0.5 × edge_density
          Combines information content and structural complexity into one score.
        """
        H, W = arr.shape[:2]
        mH, mW = H // 2, W // 2

        gray = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]

        tl = float(np.mean(gray[:mH, :mW]))
        tr = float(np.mean(gray[:mH, mW:]))
        bl = float(np.mean(gray[mH:, :mW]))
        br = float(np.mean(gray[mH:, mW:]))

        quad_vals = np.array([tl, tr, bl, br])
        spatial_var = float(np.clip(np.std(quad_vals) * 5.0, 0.0, 1.0))

        # Complexity: combine entropy and edge density
        hist, _ = np.histogram(gray, bins=256, range=(0.0, 1.0))
        p = hist / (hist.sum() + 1e-9)
        p = p[p > 0]
        entropy = float(-np.sum(p * np.log2(p))) / 8.0

        h_diff = np.abs(np.diff(gray, axis=1))
        v_diff = np.abs(np.diff(gray, axis=0))
        grad_mag = np.sqrt(h_diff[:H-1, :W-1]**2 + v_diff[:H-1, :W-1]**2)
        edge_density = float(np.mean(grad_mag > 0.08))

        complexity = float(0.5 * entropy + 0.5 * edge_density)

        return {
            "quad_tl":    tl,
            "quad_tr":    tr,
            "quad_bl":    bl,
            "quad_br":    br,
            "spatial_var": spatial_var,
            "complexity":  complexity,
        }

    # ─────────────────────────────────────────────────────────────────────────
    # Scene type inference
    # ─────────────────────────────────────────────────────────────────────────

    def _infer_scene_type(self, f: dict[str, float]) -> str:
        """
        Infer the dominant land cover type from extracted features.
        Used for display in the pipeline overlay and for archive matching context.
        Not used for event detection (that's done by event_detector.py).

        Decision tree based on the most discriminative features:
          water_index > 0.65 → FLOOD / WATER
          vegetation_index > 0.65 → VEGETATION / FOREST
          edge_density > 0.55 → URBAN
          brightness > 0.75  → CLOUD / SNOW
          → default: MIXED LAND COVER
        """
        wi  = f.get("water_index",      0.5)
        vi  = f.get("vegetation_index", 0.5)
        ed  = f.get("edge_density",     0.3)
        br  = f.get("brightness",       0.5)
        wr  = f.get("warm_ratio",       0.33)

        if wi > 0.65:
            return "flood" if vi < 0.40 else "water"
        if vi > 0.65:
            return "forest" if ed < 0.30 else "vegetation"
        if ed > 0.55 and vi < 0.40:
            return "urban"
        if br > 0.75:
            return "cloud"
        if wr > 0.42 and vi < 0.45:
            return "agriculture"
        if wi > 0.50:
            return "coastal"
        return "mixed"
