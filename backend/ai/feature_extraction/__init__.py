"""
AKSHA — Feature Extraction Subpackage

Modules:
  textureFeatures  → GLCM-inspired texture statistics (contrast, entropy, edge)
  spectralFeatures → Per-channel statistics, color ratios, vegetation/water indices
  featureExtractor → Orchestrator that calls both extractors and builds a 32-dim vector
"""
