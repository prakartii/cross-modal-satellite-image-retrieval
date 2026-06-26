"""
backend/models/schemas.py

PURPOSE:
  Pydantic request and response models for the AKSHA search API.
  Pydantic automatically validates incoming data and serializes outgoing data,
  preventing type mismatches between the Python backend and TypeScript frontend.

WHY PYDANTIC:
  FastAPI uses Pydantic models to:
    1. Validate incoming JSON fields against declared types at runtime
    2. Auto-generate OpenAPI documentation at /docs
    3. Serialize Python objects to JSON for responses
  This means if the frontend sends the wrong type, FastAPI returns a clear 422
  error rather than a cryptic Python crash deep in the pipeline.
"""

from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class FeatureSimilarity(BaseModel):
    """
    Per-feature similarity breakdown for a single retrieval result.
    Shows HOW similar the query image is to this archive entry in each dimension.
    These are computed as 1 - |query_feature - archive_feature| (inverted absolute difference).
    """
    water:      float = Field(..., ge=0.0, le=1.0, description="Water/flood similarity")
    vegetation: float = Field(..., ge=0.0, le=1.0, description="Vegetation cover similarity")
    urban:      float = Field(..., ge=0.0, le=1.0, description="Urban density similarity")
    texture:    float = Field(..., ge=0.0, le=1.0, description="Texture complexity similarity")
    spectral:   float = Field(..., ge=0.0, le=1.0, description="Color/spectral similarity")


class LocationModel(BaseModel):
    """Geographic location of an archive scene."""
    name:    str   = Field(..., description="Human-readable location name")
    region:  str   = Field(..., description="Administrative region or state")
    country: str   = Field(..., description="Country name")
    lat:     float = Field(..., ge=-90.0,  le=90.0,  description="Latitude in WGS84")
    lng:     float = Field(..., ge=-180.0, le=180.0, description="Longitude in WGS84")


class SearchResult(BaseModel):
    """
    A single retrieval result returned to the frontend.

    Every numeric score in this model is computed from real cosine similarity
    between the query embedding and the archive embedding — never hardcoded or
    randomly assigned.
    """
    id:               str             = Field(..., description="Archive scene identifier")
    rank:             int             = Field(..., ge=1, description="Retrieval rank (1 = best match)")
    similarity_score: float           = Field(..., ge=0.0, le=1.0, description="Cosine similarity score")
    satellite:        str             = Field(..., description="Satellite name (e.g. RISAT-2B)")
    sensor_type:      str             = Field(..., description="SAR / Optical / Multispectral")
    acquisition_date: str             = Field(..., description="ISO date of image acquisition")
    resolution:       str             = Field(..., description="Ground sample distance (e.g. '3m')")
    cloud_cover:      float           = Field(..., ge=0.0, le=100.0, description="Cloud cover percentage")
    scene_type:       str             = Field(..., description="flood / vegetation / urban / agriculture / coastal")
    processing_level: str             = Field(..., description="Data processing level (L1A, L2A, etc.)")
    orbit_number:     int             = Field(..., description="Satellite orbit number")
    archive_source:   str             = Field(..., description="Source archive (e.g. ISRO-BHUVAN)")
    thumbnail_url:    str             = Field(..., description="URL of preview thumbnail image")
    description:      str             = Field(..., description="Human-readable scene description")
    location:         LocationModel   = Field(..., description="Geographic location details")
    feature_similarity: FeatureSimilarity = Field(..., description="Per-feature similarity breakdown")
    match_explanation: str            = Field(..., description="Natural language explanation of why this scene matched")


class QueryMetadata(BaseModel):
    """
    Metadata about the uploaded query image, extracted from filename and EXIF.
    May be partially populated depending on filename format and EXIF availability.
    """
    filename:         str           = Field(..., description="Original filename")
    file_size_bytes:  int           = Field(..., ge=0, description="File size in bytes")
    image_width:      int           = Field(..., ge=1, description="Image width in pixels")
    image_height:     int           = Field(..., ge=1, description="Image height in pixels")
    inferred_satellite: Optional[str] = Field(None, description="Satellite name inferred from filename")
    inferred_date:    Optional[str] = Field(None, description="Date inferred from filename")
    inferred_region:  Optional[str] = Field(None, description="Region inferred from filename")


class FeatureVector(BaseModel):
    """
    The 14 extracted image features that form the basis of the embedding.
    Values are all in [0, 1].
    """
    mean_r:           float = Field(..., ge=0.0, le=1.0)
    mean_g:           float = Field(..., ge=0.0, le=1.0)
    mean_b:           float = Field(..., ge=0.0, le=1.0)
    std_r:            float = Field(..., ge=0.0, le=1.0)
    std_g:            float = Field(..., ge=0.0, le=1.0)
    std_b:            float = Field(..., ge=0.0, le=1.0)
    contrast:         float = Field(..., ge=0.0, le=1.0)
    entropy:          float = Field(..., ge=0.0, le=1.0)
    homogeneity:      float = Field(..., ge=0.0, le=1.0)
    energy:           float = Field(..., ge=0.0, le=1.0)
    edge_density:     float = Field(..., ge=0.0, le=1.0)
    water_ratio:      float = Field(..., ge=0.0, le=1.0)
    vegetation_ratio: float = Field(..., ge=0.0, le=1.0)
    urban_density:    float = Field(..., ge=0.0, le=1.0)


class SearchResponse(BaseModel):
    """
    Complete API response for a search request.
    Includes results, pipeline diagnostics, and query image analysis.
    """
    results:          list[SearchResult] = Field(..., description="Top-K retrieval results")
    query_metadata:   QueryMetadata      = Field(..., description="Metadata about the uploaded image")
    query_features:   FeatureVector      = Field(..., description="Extracted feature vector of query image")
    query_embedding:  list[float]        = Field(..., description="14-dim unit embedding of query image")
    top_k:            int                = Field(..., description="Number of results returned")
    archive_size:     int                = Field(..., description="Total scenes in the archive")
    pipeline_ms:      float              = Field(..., description="Total pipeline execution time in milliseconds")
    scene_type_guess: str                = Field(..., description="Inferred scene type of query image")
    confidence:       float              = Field(..., ge=0.0, le=1.0, description="Confidence in scene type inference")
