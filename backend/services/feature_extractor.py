"""
backend/services/feature_extractor.py

PIPELINE STAGE: 3 — Feature Extraction
INPUT:  Preprocessed numpy float32 array of shape [512, 512, 3], values in [0,1]
OUTPUT: Dict of 14 named features, all floats in [0.0, 1.0]

PURPOSE:
  Converts a normalized RGB image array into a compact 14-dimensional feature
  vector that captures the most discriminative properties of the scene.

  The 14 features are organized into 5 groups:
    A) Color statistics  (6 features) — mean and std of R, G, B channels
    B) Texture features  (4 features) — GLCM-based texture descriptors
    C) Edge density      (1 feature)  — structural complexity via Sobel gradients
    D) Water ratio       (1 feature)  — NDWI-approximated water coverage
    E) Vegetation ratio  (1 feature)  — NDVI-approximated vegetation coverage
    F) Urban density     (1 feature)  — paved/built surface density

ML CONCEPTS:

  COLOR STATISTICS:
    Mean and standard deviation of each RGB channel are the simplest
    descriptors of an image's spectral content:
      mean_r: High → warm/arid scene; Low → cool/water/vegetation scene
      mean_g: High → vegetation (chlorophyll reflects green); Low → urban/water
      mean_b: High → open water (Rayleigh scattering); Low → dense vegetation
      std_*:  High → heterogeneous scene; Low → uniform surface (water, desert)

  GLCM TEXTURE (Gray Level Co-occurrence Matrix approximation):
    GLCM captures spatial relationships between pixel intensities.
    The true GLCM G[i,j] counts how often intensity i is adjacent to intensity j.
    From G we derive texture statistics:
      Contrast   = sum(|i-j|^2 × G[i,j])  → measures intensity variation between neighbors
      Entropy    = -sum(G[i,j] × log2(G[i,j]))  → measures randomness/complexity
      Homogeneity = sum(G[i,j] / (1 + |i-j|))  → opposite of contrast; high for uniform regions
      Energy     = sum(G[i,j]^2)  → measures uniformity; high when few intensity pairs repeat

    Full GLCM computation is O(P^2) where P = number of intensity levels, so we
    approximate each statistic directly from pixel-pair statistics (O(H×W)).

  SOBEL EDGE DETECTION:
    The Sobel operator approximates the image gradient using 3×3 convolution kernels:
      Gx = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]]  (horizontal gradient)
      Gy = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]]  (vertical gradient)
    Gradient magnitude = sqrt(Gx^2 + Gy^2)
    We approximate Gx with simple finite differences: (pixel[i, j+1] - pixel[i, j-1]) / 2

    Edge density = fraction of pixels where gradient magnitude > threshold.
    High edge density → complex scene (urban, agricultural boundaries).
    Low edge density → smooth scene (open water, homogeneous forest).

  NDWI — Normalized Difference Water Index:
    In true satellite remote sensing:
      NDWI = (Green band - NIR band) / (Green band + NIR band)
    Since we only have RGB (no NIR band in standard images):
      NDWI ≈ (Blue - Red) / (Blue + Red)
    Water absorbs red light and strongly scatters blue light, so
    flooded pixels have Blue >> Red → NDWI > 0.
    Water ratio = fraction of pixels with this approximated NDWI > threshold.

  NDVI — Normalized Difference Vegetation Index:
    In true satellite remote sensing:
      NDVI = (NIR - Red) / (NIR + Red)
    Vegetation absorbs red light for photosynthesis and strongly reflects NIR.
    Since we lack NIR, we approximate with:
      NDVI ≈ (Green - Red) / (Green + Red)
    Vegetation pixels have Green > Red in RGB imagery.
    Vegetation ratio = fraction of pixels with approximated NDVI > threshold.

  URBAN DENSITY:
    Urban surfaces (concrete, asphalt, rooftops) appear gray-brown in RGB:
    - All three channels are moderate and roughly equal (R ≈ G ≈ B)
    - Low color variance (not as green as vegetation, not as blue as water)
    - Low NDVI (not vegetation)
    We detect urban pixels as: low color variance AND low NDVI AND moderate brightness.
"""

from __future__ import annotations

from typing import Any

import numpy as np


# ── Constants ──────────────────────────────────────────────────────────────────

# Threshold for edge detection (Sobel gradient magnitude).
# Pixels with gradient > 0.05 are considered edges.
# 0.05 on a [0,1] scale corresponds to a ~13-unit change in [0,255] space.
EDGE_THRESHOLD = 0.05

# NDWI threshold: pixels with (B-R)/(B+R) > 0.05 are counted as water.
# Slightly above zero to exclude near-neutral gray pixels (urban, dry soil).
WATER_NDWI_THRESHOLD = 0.05

# Minimum blue channel value for water pixels.
# Water has elevated blue reflectance (> 0.25 in normalized scale).
WATER_MIN_BLUE = 0.25

# NDVI threshold: pixels with (G-R)/(G+R) > 0.08 are counted as vegetation.
# Slightly above zero to exclude gray/neutral pixels.
VEGETATION_NDVI_THRESHOLD = 0.08

# Minimum green channel value for vegetation pixels.
VEGETATION_MIN_GREEN = 0.15

# Maximum color variance for urban pixels.
# Urban surfaces are "gray" — all channels similar → low variance across RGB.
URBAN_MAX_COLOR_VARIANCE = 0.12

# Brightness range for urban pixels (not too dark, not too bright).
URBAN_MIN_BRIGHTNESS = 0.20
URBAN_MAX_BRIGHTNESS = 0.72


def extract_color_statistics(arr: np.ndarray) -> dict[str, float]:
    """
    Extract mean and standard deviation of each RGB channel.

    WHAT THESE MEASURE:
      mean_r, mean_g, mean_b: Overall color tone of the image.
        - Very high mean_b relative to mean_r → likely water (blue scattering)
        - Very high mean_g relative to mean_r → likely vegetation (chlorophyll)
        - Balanced means with moderate values → likely urban or bare soil
      std_r, std_g, std_b: Color variation within each channel.
        - Low std → uniform scene (open water, homogeneous forest canopy)
        - High std → heterogeneous scene (urban, mixed land use)

    COMPUTATION:
      arr.mean(axis=(0,1)): Averages over all H×W spatial positions,
        giving one mean per channel. Shape: [3]
      arr.std(axis=(0,1)):  Standard deviation over all H×W positions.
        Shape: [3]

    The standard deviation is computed as:
      std = sqrt((1/N) × sum((x_i - mean)^2))
    where N = H × W = 512 × 512 = 262144 pixels per channel.

    Args:
      arr: Float32 array of shape [512, 512, 3].

    Returns:
      Dict with keys: mean_r, mean_g, mean_b, std_r, std_g, std_b.
      All values are floats in [0.0, 1.0].
    """
    # Compute mean across the spatial dimensions (H=0, W=1), keeping channels (2)
    means = arr.mean(axis=(0, 1))   # shape: [3]
    stds  = arr.std(axis=(0, 1))    # shape: [3]

    # std is in [0, 0.5] for values in [0, 1] — clamp to [0, 1] for uniformity
    return {
        "mean_r": float(np.clip(means[0], 0.0, 1.0)),
        "mean_g": float(np.clip(means[1], 0.0, 1.0)),
        "mean_b": float(np.clip(means[2], 0.0, 1.0)),
        "std_r":  float(np.clip(stds[0] * 2.0, 0.0, 1.0)),  # scale [0,0.5] → [0,1]
        "std_g":  float(np.clip(stds[1] * 2.0, 0.0, 1.0)),
        "std_b":  float(np.clip(stds[2] * 2.0, 0.0, 1.0)),
    }


def extract_texture_features(arr: np.ndarray) -> dict[str, float]:
    """
    Extract GLCM-approximated texture descriptors from the grayscale image.

    WHY GRAYSCALE:
      Texture is a spatial property (how pixel intensities vary in space) that
      doesn't depend on color. Converting to luminance grayscale:
        gray = 0.299×R + 0.587×G + 0.114×B
      weights the channels by their contribution to perceived brightness
      (the standard ITU-R BT.601 luminance formula).

    TEXTURE DESCRIPTORS:

    1. CONTRAST (scaled to [0,1]):
       Measures the intensity difference between adjacent pixels.
       Computed as the mean squared difference between each pixel and
       its right-neighbor (horizontal adjacency):
         diff[i,j] = gray[i,j] - gray[i,j+1]
         contrast = mean(diff^2)
       We use np.roll to shift the image by 1 pixel to get neighbor pairs.
       High contrast → sharp edges, heterogeneous surface (urban, coastline).
       Low contrast  → smooth surface (calm water, homogeneous sand).

    2. ENTROPY (in [0,1]):
       Shannon entropy of the intensity distribution.
       Entropy = -sum(p_k × log2(p_k)) where p_k = fraction of pixels with intensity k.
       We compute this from a 32-bin histogram of grayscale values.
       Normalized by log2(32) = 5 bits to map to [0, 1].
       High entropy → many different intensity levels → complex, varied scene.
       Low entropy  → few intensity levels → uniform scene (water, bare ground).

    3. HOMOGENEITY (in [0,1]):
       Measures how similar adjacent pixel intensities are.
         homogeneity = mean(1 / (1 + |diff|))
       When adjacent pixels are identical, |diff| = 0 → contribution = 1.
       When they differ greatly, |diff| → 1 → contribution → 0.5.
       High homogeneity → smooth, uniform texture (water, flat desert).
       Low homogeneity  → rough texture (forest canopy, urban rooftops).

    4. ENERGY (in [0,1]):
       Measures histogram uniformity (also called Angular Second Moment).
         energy = sum(p_k^2 for all bins)
       When one intensity dominates (e.g., all pixels similar), energy is high.
       When all intensities are equally frequent, energy = 1/num_bins.
       Scaled to [0,1] by multiplying by number of bins.
       High energy → few dominant intensity levels → ordered, uniform scene.
       Low energy  → many intensity levels → disordered, complex scene.

    Args:
      arr: Float32 array of shape [512, 512, 3].

    Returns:
      Dict with keys: contrast, entropy, homogeneity, energy.
      All values in [0.0, 1.0].
    """
    # Convert to grayscale luminance using ITU-R BT.601 coefficients
    gray = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]

    # ── CONTRAST ─────────────────────────────────────────────────────────────
    # np.roll(gray, -1, axis=1): shift image left by 1 column (get right-neighbor)
    # diff[i,j] = gray[i,j] - gray[i,j+1]
    neighbor = np.roll(gray, -1, axis=1)
    diff = gray - neighbor
    raw_contrast = float(np.mean(diff ** 2))
    # Scale: max meaningful contrast for [0,1] images is ~0.25 (0-1 range, stdev ≈ 0.5)
    # Multiply by 4 to map the typical [0, 0.25] range to [0, 1]
    contrast = float(np.clip(raw_contrast * 4.0, 0.0, 1.0))

    # ── ENTROPY ──────────────────────────────────────────────────────────────
    # Build a 32-bin histogram of grayscale values in [0, 1]
    hist, _ = np.histogram(gray, bins=32, range=(0.0, 1.0))
    total = hist.sum()
    if total > 0:
        probs = hist.astype(np.float64) / total  # probability per bin
        # Select only non-zero bins to avoid log(0)
        probs = probs[probs > 0]
        raw_entropy = -float(np.sum(probs * np.log2(probs)))
        # Maximum possible entropy with 32 bins is log2(32) = 5 bits
        entropy = float(np.clip(raw_entropy / 5.0, 0.0, 1.0))
    else:
        entropy = 0.0

    # ── HOMOGENEITY ──────────────────────────────────────────────────────────
    # 1 / (1 + |diff|): smoothly penalizes intensity differences
    # Range: [0.5, 1.0] — we rescale to [0, 1] by (h - 0.5) * 2
    raw_homogeneity = float(np.mean(1.0 / (1.0 + np.abs(diff))))
    homogeneity = float(np.clip((raw_homogeneity - 0.5) * 2.0, 0.0, 1.0))

    # ── ENERGY ───────────────────────────────────────────────────────────────
    # Use the same 32-bin histogram; energy = sum(p_k^2)
    if total > 0:
        probs_all = hist.astype(np.float64) / total
        raw_energy = float(np.sum(probs_all ** 2))
        # Uniform distribution over 32 bins → energy = 1/32 ≈ 0.031
        # One dominant bin → energy ≈ 1.0
        # Scale: multiply by 32 to map [1/32, 1] → [1, 32] then clip
        energy = float(np.clip(raw_energy * 32.0, 0.0, 1.0))
    else:
        energy = 0.0

    return {
        "contrast":    contrast,
        "entropy":     entropy,
        "homogeneity": homogeneity,
        "energy":      energy,
    }


def extract_edge_density(arr: np.ndarray) -> float:
    """
    Compute the fraction of pixels that lie on an edge (Sobel-detected).

    SOBEL GRADIENT APPROXIMATION:
      The true Sobel filter convolves with a 3×3 kernel:
        Gx = [[-1,0,1], [-2,0,2], [-1,0,1]]
      We approximate Gx with central finite differences:
        Gx[i,j] ≈ (gray[i, j+1] - gray[i, j-1]) / 2
      Similarly for Gy (vertical direction).

      Gradient magnitude at pixel [i,j]:
        |G| = sqrt(Gx^2 + Gy^2)

      Edge pixels: those where |G| > EDGE_THRESHOLD (0.05).

    PHYSICAL INTERPRETATION:
      Edges correspond to intensity discontinuities — boundaries between
      different surface types (road edge, building outline, water/land boundary,
      forest clearing edge).

      Low edge density (< 0.15) → smooth, homogeneous surface (open water,
        homogeneous vegetation, bare desert).
      Medium edge density (0.15–0.35) → mixed scenes (agricultural fields,
        partially flooded areas, shrubland).
      High edge density (> 0.35) → complex structured scenes (urban areas,
        dense road networks, fragmented land use).

    Args:
      arr: Float32 array of shape [512, 512, 3].

    Returns:
      Float in [0.0, 1.0] — fraction of edge pixels.
    """
    # Convert to grayscale — edges are independent of color, only intensity matters
    gray = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]

    # Horizontal gradient: difference between right and left neighbors, divided by 2
    # np.roll(..., -1, axis=1): shift pixels one column to the left (brings right-neighbor)
    # np.roll(...,  1, axis=1): shift pixels one column to the right (brings left-neighbor)
    gx = (np.roll(gray, -1, axis=1) - np.roll(gray, 1, axis=1)) / 2.0

    # Vertical gradient: difference between lower and upper neighbors
    gy = (np.roll(gray, -1, axis=0) - np.roll(gray, 1, axis=0)) / 2.0

    # Gradient magnitude at each pixel
    magnitude = np.sqrt(gx ** 2 + gy ** 2)

    # Edge pixels are those where gradient magnitude exceeds threshold
    edge_pixel_count = np.sum(magnitude > EDGE_THRESHOLD)
    total_pixels = gray.size  # H × W = 512 × 512 = 262144

    return float(edge_pixel_count / total_pixels)


def extract_water_ratio(arr: np.ndarray) -> float:
    """
    Estimate the fraction of the image covered by water using an NDWI approximation.

    BACKGROUND — TRUE NDWI (McFeeters, 1996):
      NDWI = (Green - NIR) / (Green + NIR)
      Open water: NIR is strongly absorbed → NDWI > 0
      Vegetation: NIR is strongly reflected → NDWI < 0

    OUR RGB APPROXIMATION:
      Without a NIR band, we approximate using the Red channel instead:
        NDWI_approx = (Blue - Red) / (Blue + Red + epsilon)
      This works because:
        - Water absorbs red light strongly (low mean_r for water pixels)
        - Water scatters blue light (Rayleigh scattering) → elevated Blue
        - Flooded areas appear distinctly blue-grey in RGB satellite imagery
      Vegetation: Red is absorbed, Green+Blue reflect → NDWI_approx ≈ 0 to slightly positive
      Urban/Bare soil: All channels moderate, Blue slightly lower → NDWI_approx ≈ -0.1 to 0.1

    DUAL CONDITION:
      We require BOTH:
        1. NDWI_approx > WATER_NDWI_THRESHOLD (0.05): More blue than red
        2. mean_b > WATER_MIN_BLUE (0.25): Absolute blue level is meaningful
      The second condition prevents dark neutral pixels (e.g., shadows) from
      being misclassified as water (they'd have near-zero NDWI if both R and B are low).

    Args:
      arr: Float32 array of shape [512, 512, 3].

    Returns:
      Float in [0.0, 1.0] — fraction of water-like pixels.
    """
    r = arr[:, :, 0]  # Red channel
    g = arr[:, :, 1]  # Green channel (unused in NDWI but used for validation)
    b = arr[:, :, 2]  # Blue channel

    # Small epsilon to prevent division by zero when both B and R are 0
    eps = 1e-8

    # NDWI approximation: positive where Blue > Red
    ndwi = (b - r) / (b + r + eps)

    # Water pixels: NDWI above threshold AND minimum absolute blue value
    water_mask = (ndwi > WATER_NDWI_THRESHOLD) & (b > WATER_MIN_BLUE)

    return float(np.sum(water_mask) / water_mask.size)


def extract_vegetation_ratio(arr: np.ndarray) -> float:
    """
    Estimate the fraction of the image covered by vegetation using an NDVI approximation.

    BACKGROUND — TRUE NDVI (Rouse et al., 1974):
      NDVI = (NIR - Red) / (NIR + Red)
      Dense vegetation: NIR strongly reflected, Red absorbed for photosynthesis → NDVI ≈ 0.6–0.9
      Bare soil:        Red and NIR both moderately reflected → NDVI ≈ 0.1–0.2
      Water:            NIR absorbed → NDVI < 0

    OUR RGB APPROXIMATION:
      Without NIR, we use the Green channel as a proxy:
        NDVI_approx = (Green - Red) / (Green + Red + epsilon)
      This works because:
        - Vegetation reflects strongly in the green wavelengths (550 nm)
          even without NIR — this gives the characteristic "green" appearance
        - Red is absorbed by chlorophyll in photosynthesizing tissue
      Urban/concrete: moderate Green, moderate Red → NDVI_approx ≈ 0
      Water:          Blue >> Green, Blue >> Red → NDVI_approx ≈ 0 to 0.1

    DUAL CONDITION:
      We require BOTH:
        1. NDVI_approx > VEGETATION_NDVI_THRESHOLD (0.08): More green than red
        2. Green > VEGETATION_MIN_GREEN (0.15): Absolute green level is meaningful

    Args:
      arr: Float32 array of shape [512, 512, 3].

    Returns:
      Float in [0.0, 1.0] — fraction of vegetation-like pixels.
    """
    r = arr[:, :, 0]  # Red channel
    g = arr[:, :, 1]  # Green channel

    eps = 1e-8

    # NDVI approximation: positive where Green > Red
    ndvi = (g - r) / (g + r + eps)

    # Vegetation pixels: NDVI above threshold AND minimum green value
    veg_mask = (ndvi > VEGETATION_NDVI_THRESHOLD) & (g > VEGETATION_MIN_GREEN)

    return float(np.sum(veg_mask) / veg_mask.size)


def extract_urban_density(arr: np.ndarray) -> float:
    """
    Estimate the fraction of the image covered by urban/built surfaces.

    URBAN SPECTRAL SIGNATURE:
      Concrete, asphalt, rooftops, and roads appear in RGB satellite imagery as:
        - Moderate, balanced RGB values (R ≈ G ≈ B, all in 0.2–0.7 range)
        - Low color variance across channels (gray or brown tones)
        - Low NDVI (no photosynthesis)
        - NOT dark (not shadow) and NOT very bright (not snow/cloud)

    ALGORITHM:
      For each pixel, compute the standard deviation across its R, G, B values.
      Low std → channels are similar → gray/neutral → potential urban pixel.
      Then further filter by:
        - Brightness in urban range [URBAN_MIN_BRIGHTNESS, URBAN_MAX_BRIGHTNESS]
        - Low vegetation (NDVI_approx < 0)

      NOTE ON FALSE POSITIVES:
        This is a simple heuristic, not a trained classifier. It works well for
        distinguishing urban from water and vegetation, but may include some
        bare soil, desert, or sand. This is acceptable because:
          1. The feature contributes only 1 of 14 dimensions to the embedding
          2. Cosine similarity uses ALL features together, so no single feature
             determines the final result

    Args:
      arr: Float32 array of shape [512, 512, 3].

    Returns:
      Float in [0.0, 1.0] — fraction of urban-like pixels.
    """
    r = arr[:, :, 0]
    g = arr[:, :, 1]
    b = arr[:, :, 2]

    # Per-pixel color variance: std(R, G, B) for each spatial position
    # np.std(arr, axis=2) computes std across the channel axis for each pixel
    color_variance = np.std(arr, axis=2)  # shape: [512, 512]

    # Per-pixel brightness (luminance)
    brightness = 0.299 * r + 0.587 * g + 0.114 * b

    # Per-pixel NDVI approximation to exclude vegetation
    eps = 1e-8
    ndvi = (g - r) / (g + r + eps)

    # Urban pixels: gray (low color variance), medium brightness, not vegetated
    urban_mask = (
        (color_variance < URBAN_MAX_COLOR_VARIANCE)  # Gray/neutral tone
        & (brightness > URBAN_MIN_BRIGHTNESS)         # Not shadow/dark
        & (brightness < URBAN_MAX_BRIGHTNESS)         # Not cloud/snow bright
        & (ndvi < 0.05)                               # Not vegetation
    )

    return float(np.sum(urban_mask) / urban_mask.size)


def extract_all_features(arr: np.ndarray) -> dict[str, float]:
    """
    Run all five feature extractors and return the complete 14-feature dict.

    This is the single entry point called by the pipeline orchestrator.
    It calls each sub-function in sequence and merges their outputs.

    FEATURE ORDER (matches FEATURE_KEYS in embedding_generator.py):
      mean_r, mean_g, mean_b         — color statistics
      std_r, std_g, std_b            — color statistics
      contrast, entropy, homogeneity, energy  — texture
      edge_density                   — structure
      water_ratio                    — water coverage
      vegetation_ratio               — vegetation coverage
      urban_density                  — urban coverage

    All 14 features are floats in [0.0, 1.0].

    Args:
      arr: Float32 array of shape [512, 512, 3] from preprocessing.py.

    Returns:
      Dict mapping feature name (str) to value (float), 14 keys total.
    """
    # Group A: Color statistics (6 features)
    color_stats = extract_color_statistics(arr)

    # Group B: Texture descriptors (4 features)
    texture = extract_texture_features(arr)

    # Group C: Edge density (1 feature)
    edge_density = extract_edge_density(arr)

    # Group D: Water ratio (1 feature)
    water_ratio = extract_water_ratio(arr)

    # Group E: Vegetation ratio (1 feature)
    vegetation_ratio = extract_vegetation_ratio(arr)

    # Group F: Urban density (1 feature)
    urban_density = extract_urban_density(arr)

    # Merge all groups into a single flat dict
    features: dict[str, float] = {}
    features.update(color_stats)
    features.update(texture)
    features["edge_density"]     = edge_density
    features["water_ratio"]      = water_ratio
    features["vegetation_ratio"] = vegetation_ratio
    features["urban_density"]    = urban_density

    return features


def infer_scene_type(features: dict[str, float]) -> tuple[str, float]:
    """
    Infer the dominant scene type from the extracted feature vector.

    DECISION LOGIC:
      Each scene type is identified by a characteristic combination of
      the three most distinctive features: water_ratio, vegetation_ratio,
      and urban_density. These are the three features with the highest
      embedding weights (2.0, 2.0, 1.8) because they are most discriminative.

      Flood:       water_ratio dominates (> 0.45)
      Coastal:     water_ratio moderate (0.25–0.45) + vegetation present
      Vegetation:  vegetation_ratio dominates (> 0.45), water low
      Agriculture: vegetation moderate (0.20–0.45), water + urban both low
      Urban:       urban_density dominates (> 0.40)
      Bare/Arid:   all three are low (< 0.20 each)

    CONFIDENCE:
      Confidence is the margin between the winning condition and the second-best.
      A clear flood scene (water = 0.80) gets high confidence.
      A mixed urban-vegetation scene (urban = 0.35, veg = 0.30) gets lower confidence.

    Args:
      features: Output of extract_all_features().

    Returns:
      Tuple of (scene_type_string, confidence_float_in_0_to_1).
    """
    w = features.get("water_ratio",      0.0)
    v = features.get("vegetation_ratio", 0.0)
    u = features.get("urban_density",    0.0)

    # The dominant signal determines scene type
    if w > 0.45:
        return ("flood", float(np.clip(w, 0.0, 1.0)))
    elif w > 0.25 and v > 0.15:
        return ("coastal", float(np.clip((w + v) / 2.0, 0.0, 1.0)))
    elif v > 0.45:
        return ("vegetation", float(np.clip(v, 0.0, 1.0)))
    elif v > 0.20 and u < 0.20 and w < 0.20:
        return ("agriculture", float(np.clip(v, 0.0, 1.0)))
    elif u > 0.40:
        return ("urban", float(np.clip(u, 0.0, 1.0)))
    else:
        # Fallback: whichever is largest among the three
        scores = {"flood": w, "vegetation": v, "urban": u}
        best = max(scores, key=lambda k: scores[k])
        return ("arid_or_mixed", float(np.clip(max(w, v, u), 0.0, 1.0)))
