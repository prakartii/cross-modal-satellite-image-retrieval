"""
backend/ai/events/__init__.py

PURPOSE:
  Event detection module — Stage 7 of the AKSHA AI pipeline.
  Identifies geophysical events (flood, fire, deforestation, etc.)
  from the 32-dimensional feature vector computed in Stage 3.

APPROACH:
  Rule-based detection using domain knowledge thresholds.
  Each event type has diagnostic rules derived from remote sensing literature:
    - Flood:        high water index, low vegetation, smooth texture
    - Fire:         high warm ratio, low vegetation, high brightness
    - Deforestation: mid-range vegetation, high edge density, spatial variance
    - Urban growth: high edge density, low vegetation, moderate brightness
    - Cloud cover:  high brightness, high homogeneity

WHY NOT DEEP LEARNING:
  For a demonstration system, rule-based detection is:
  1. Interpretable: we can explain EXACTLY why a detection was made
  2. No training data required
  3. Computationally trivial
  4. Easily auditable for correctness

PRODUCTION UPGRADE:
  Replace rules with fine-tuned U-Net / Flood-Net / LandNet models trained
  on Sentinel-2 + RISAT-2B scenes with NDMA-labeled ground truth.
"""
