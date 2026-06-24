"""
backend/ai/image_processing/__init__.py

PURPOSE:
  Image processing pipeline — Stages 1, 2, and 3 of the AKSHA AI pipeline.
  Converts raw uploaded bytes into structured feature vectors.

MODULES:
  metadata.py     — Stage 1: Extract satellite/sensor/location/date metadata
  preprocessing.py — Stage 2: Normalize image to standard format for analysis
  feature_extractor.py — Stage 3: Compute 32-dimensional feature vector

WHY THIS ORDER:
  Metadata comes first because it's cheap (filename parsing only) and tells
  us what kind of image we're dealing with (SAR vs Optical affects preprocessing).
  Preprocessing normalizes before feature extraction so features are comparable.
"""
