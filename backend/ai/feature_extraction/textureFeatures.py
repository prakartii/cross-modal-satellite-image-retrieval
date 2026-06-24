"""
AKSHA Earth Intelligence Platform — Texture Feature Extractor
=============================================================

PURPOSE:
  Compute texture statistics from grayscale satellite imagery.
  Texture features describe the spatial arrangement of pixel intensities —
  how rough, smooth, regular, or irregular the surface appears.

WHY IT EXISTS:
  Different land cover types have characteristic textures:
    • Water bodies:  smooth, uniform (low contrast, high homogeneity)
    • Forest:        rough, irregular (high entropy, medium contrast)
    • Urban:         structured, high-edge (high contrast, high directionality)
    • Agricultural:  periodic, regular (medium contrast, high correlation)
    • SAR imagery:   speckled texture (high variance, distinctive autocorrelation)

  By capturing texture, the model can distinguish between regions that look
  similar in color but differ in surface structure.

AI CONCEPT DEMONSTRATED:
  Gray Level Co-occurrence Matrix (GLCM) features — a classical computer vision
  technique from Haralick (1973). GLCM measures how often pixel pairs with
  specific intensity combinations occur at a given offset. Haralick features
  (contrast, correlation, energy, homogeneity) derived from GLCM are still
  used in modern hybrid ML pipelines alongside deep features.

  This implementation uses efficient numpy approximations of GLCM statistics
  without computing the full co-occurrence matrix (which would be O(N²) in
  the number of intensity levels).

PRODUCTION REPLACEMENT:
  scikit-image's greycomatrix() + greycoprops() for true GLCM features,
  or a CNN backbone (ResNet, EfficientNet) for learned texture descriptors.

INPUTS:
  gray_array: numpy array (H, W) of uint8 pixel values

OUTPUTS:
  dict with 12 named texture features, each in approximate [0, 1] range

PIPELINE POSITION:
  Feature Extraction Stage — called by featureExtractor.py
"""

from __future__ import annotations

import math
from typing import Any

import numpy as np


class TextureFeatureExtractor:
    """
    Extracts 12 texture statistics from a grayscale image array.

    All output values are normalized to approximately [0, 1] for
    consistent embedding construction. The normalization constants
    are empirically determined from typical satellite imagery ranges.
    """

    def extract(self, gray: np.ndarray) -> dict[str, float]:
        """
        Compute all texture features from a grayscale image array.

        Args:
          gray: uint8 ndarray of shape (H, W), values [0, 255]

        Returns:
          dict mapping feature names to normalized float values [0, 1]
        """
        gray = gray.astype(np.float64)

        contrast     = self._contrast(gray)
        entropy      = self._entropy(gray)
        homogeneity  = self._homogeneity(gray)
        energy       = self._energy(gray)
        correlation  = self._correlation(gray)
        edge_density, mean_grad = self._edge_features(gray)
        coarseness   = self._coarseness(gray)
        directionality = self._directionality(gray)
        local_std    = self._local_std(gray)
        h_grad, v_grad = self._mean_gradients(gray)

        return {
            # contrast: measures local intensity variations
            # High contrast → edges, water-land boundaries, urban areas
            "contrast": float(np.clip(contrast / 2000.0, 0.0, 1.0)),

            # entropy: information content per pixel
            # High entropy → complex texture (forest, urban)
            # Low entropy → uniform regions (water, cloud, desert)
            "entropy": float(np.clip(entropy / 8.0, 0.0, 1.0)),

            # homogeneity: inverse of contrast — how similar adjacent pixels are
            # High homogeneity → smooth regions (water, bare soil)
            "homogeneity": float(np.clip(homogeneity, 0.0, 1.0)),

            # energy: sum of squared histogram probabilities
            # High energy → few dominant intensity levels (simple texture)
            "energy": float(np.clip(energy, 0.0, 1.0)),

            # correlation: linear dependency between adjacent pixels
            # High correlation → regular patterns (agricultural fields)
            "correlation": float(np.clip((correlation + 1.0) / 2.0, 0.0, 1.0)),

            # edge_density: fraction of pixels classified as edges
            # High edge density → urban areas, coastlines, road networks
            "edge_density": float(np.clip(edge_density, 0.0, 1.0)),

            # mean_gradient: average Sobel gradient magnitude
            "mean_gradient": float(np.clip(mean_grad / 255.0, 0.0, 1.0)),

            # coarseness: how slowly pixel values change across the image
            # High coarseness → large uniform regions (ocean, bare soil)
            # Low coarseness → fine-grained texture (urban, forest)
            "coarseness": float(np.clip(coarseness, 0.0, 1.0)),

            # directionality: ratio of horizontal to total gradient
            # Values near 0.5 → isotropic texture; near 0 or 1 → directional
            "directionality": float(np.clip(directionality, 0.0, 1.0)),

            # local_std: mean of local standard deviation (texture roughness)
            "local_std": float(np.clip(local_std / 80.0, 0.0, 1.0)),

            # h_gradient, v_gradient: mean horizontal/vertical gradients
            "h_gradient": float(np.clip(h_grad / 50.0, 0.0, 1.0)),
            "v_gradient": float(np.clip(v_grad / 50.0, 0.0, 1.0)),
        }

    def _contrast(self, gray: np.ndarray) -> float:
        """
        Approximate GLCM contrast: mean squared intensity difference between
        horizontally and vertically adjacent pixel pairs.

        GLCM contrast = Σ (i-j)² × P(i,j)
        Here we approximate using the squared gradient between neighbors.
        """
        h_diff = np.diff(gray, axis=1)
        v_diff = np.diff(gray, axis=0)
        return float(np.mean(h_diff**2) + np.mean(v_diff**2))

    def _entropy(self, gray: np.ndarray) -> float:
        """
        Shannon entropy of the pixel intensity histogram.

        H = -Σ p(i) × log₂(p(i))  for all intensity levels i

        Maximum entropy for 8-bit images = log₂(256) = 8.0 bits
        Uniform images (single color): entropy ≈ 0
        Random noise images: entropy ≈ 8.0
        """
        hist, _ = np.histogram(gray, bins=256, range=(0.0, 256.0))
        prob = hist / (hist.sum() + 1e-10)
        nonzero = prob[prob > 0]
        return float(-np.sum(nonzero * np.log2(nonzero)))

    def _homogeneity(self, gray: np.ndarray) -> float:
        """
        GLCM homogeneity approximation: inverse of normalized contrast.

        GLCM homogeneity = Σ P(i,j) / (1 + |i-j|)
        High → adjacent pixels have similar values (smooth texture)
        """
        h_diff = np.abs(np.diff(gray, axis=1))
        v_diff = np.abs(np.diff(gray, axis=0))
        mean_diff = (h_diff.mean() + v_diff.mean()) / 2.0
        return float(1.0 / (1.0 + mean_diff / 32.0))

    def _energy(self, gray: np.ndarray) -> float:
        """
        Angular Second Moment (energy) from the intensity histogram.

        GLCM energy = Σ P(i,j)²
        High energy → image has few dominant intensity levels (simple texture)
        Low energy  → many different intensities (complex texture)
        """
        hist, _ = np.histogram(gray, bins=256, range=(0.0, 256.0))
        prob = hist / (hist.sum() + 1e-10)
        return float(np.sum(prob**2))

    def _correlation(self, gray: np.ndarray) -> float:
        """
        Pearson correlation between adjacent horizontal pixel pairs.

        Measures linear dependency — periodic textures (agriculture) have
        high correlation because rows repeat at regular intervals.

        Returns value in [-1, 1].
        """
        row = gray[:, :-1].flatten()
        col = gray[:, 1:].flatten()
        if len(row) < 2:
            return 0.0
        try:
            r = np.corrcoef(row, col)[0, 1]
            return float(r) if not math.isnan(r) else 0.0
        except Exception:
            return 0.0

    def _edge_features(self, gray: np.ndarray) -> tuple[float, float]:
        """
        Compute Sobel gradient magnitude and derive edge density.

        The Sobel operator is a 3×3 gradient filter that detects edges
        by computing the rate of intensity change in X and Y directions.

        Sobel X kernel: [[-1,0,1],[-2,0,2],[-1,0,1]]
        Sobel Y kernel: [[-1,-2,-1],[0,0,0],[1,2,1]]

        Edge density = fraction of pixels with gradient > threshold (30/255)
        """
        padded = np.pad(gray, 1, mode="reflect")
        # Sobel X
        gx = (
            -padded[:-2, :-2] - 2 * padded[1:-1, :-2] - padded[2:, :-2]
            + padded[:-2, 2:] + 2 * padded[1:-1, 2:] + padded[2:, 2:]
        )
        # Sobel Y
        gy = (
            -padded[:-2, :-2] - 2 * padded[:-2, 1:-1] - padded[:-2, 2:]
            + padded[2:, :-2] + 2 * padded[2:, 1:-1] + padded[2:, 2:]
        )
        gradient = np.sqrt(gx**2 + gy**2)

        # Threshold at 30 out of max possible Sobel response ~1440
        edge_density = float(np.mean(gradient > 30.0))
        mean_grad = float(np.mean(gradient) / 8.0)  # Normalize by Sobel scale

        return edge_density, mean_grad

    def _coarseness(self, gray: np.ndarray) -> float:
        """
        Measure of texture coarseness: how large are the uniform regions?

        Computed as 1 - (normalized std), so:
          High coarseness → uniform regions, few intensity levels
          Low coarseness  → fine-grained texture
        """
        std = float(np.std(gray))
        return float(max(0.0, 1.0 - std / 128.0))

    def _directionality(self, gray: np.ndarray) -> float:
        """
        Ratio of horizontal to total gradient energy.

        Value near 0.5 → isotropic (water, featureless terrain)
        Value near 0   → vertical structures dominant (rivers, roads)
        Value near 1   → horizontal structures dominant (terraces, farmland)
        """
        h_diff = float(np.mean(np.abs(np.diff(gray, axis=1))))
        v_diff = float(np.mean(np.abs(np.diff(gray, axis=0))))
        total = h_diff + v_diff + 1e-10
        return h_diff / total

    def _local_std(self, gray: np.ndarray) -> float:
        """
        Mean local standard deviation using a simple 7×7 sliding window.

        Measures texture roughness at a local scale — high values indicate
        rapid intensity variation (urban, forest) vs smooth variation (water).
        """
        k = 7
        # Pad and compute local mean
        pad = k // 2
        padded = np.pad(gray, pad, mode="reflect")
        h, w = gray.shape

        # Sample every 4th pixel for efficiency
        step = 4
        rows = range(0, h, step)
        cols = range(0, w, step)
        stds = []
        for r in rows:
            for c in cols:
                window = padded[r:r+k, c:c+k]
                stds.append(float(np.std(window)))

        return float(np.mean(stds)) if stds else 0.0

    def _mean_gradients(self, gray: np.ndarray) -> tuple[float, float]:
        """
        Mean absolute horizontal and vertical gradients.

        h_gradient: captures left-right intensity changes
        v_gradient: captures top-bottom intensity changes
        """
        h_grad = float(np.mean(np.abs(np.diff(gray, axis=1))))
        v_grad = float(np.mean(np.abs(np.diff(gray, axis=0))))
        return h_grad, v_grad
