"""
backend/database/seed.py

PURPOSE:
  Generates the two database files that power the archive search:
    - embeddings.json: Pre-computed 14-dim unit embedding for each archive scene
    - metadata.json:   Full metadata + feature profile for each archive scene

  This script runs ONCE at startup (if the files don't exist) or can be
  run manually to regenerate the archive. It does NOT download real satellite
  imagery — instead, it defines physically meaningful feature profiles for
  50 scenes across 5 scene types, then computes their embeddings using the
  same embedding_generator.py code used for the query image.

PHYSICAL REALISM OF ARCHIVE ENTRIES:
  Each scene's feature profile is derived from domain knowledge of how
  different land cover types appear in satellite imagery:

  FLOOD / INUNDATION:
    - High water_ratio (0.65–0.85): Most pixels are water
    - Low vegetation_ratio (0.05–0.15): Vegetation submerged or absent
    - Low urban_density (0.03–0.10): Buildings partially submerged
    - Low edge_density (0.05–0.15): Water surfaces are smooth
    - High mean_b (0.55–0.68): Water scatters blue light
    - Low mean_r (0.25–0.38): Water absorbs red light
    - High homogeneity (0.82–0.92): Water pixels are very uniform
    - Low contrast (0.08–0.18): Flat water surface

  VEGETATION / FOREST:
    - High vegetation_ratio (0.60–0.85): Dense canopy coverage
    - Low water_ratio (0.04–0.15): Minimal standing water
    - Low urban_density (0.02–0.08): No built surfaces
    - Medium edge_density (0.20–0.35): Canopy texture creates edges
    - High mean_g (0.42–0.58): Chlorophyll reflects green
    - Low mean_r (0.28–0.42): Chlorophyll absorbs red
    - Medium entropy (0.55–0.72): Complex canopy texture

  URBAN:
    - High urban_density (0.55–0.82): Built surface dominates
    - Low vegetation_ratio (0.05–0.20): Little green
    - Low water_ratio (0.02–0.12): Little water
    - High edge_density (0.40–0.65): Buildings, roads create many edges
    - Medium-high contrast (0.40–0.62): Shadows vs. bright rooftops
    - Balanced RGB means (all moderate, ~0.40–0.55)

  AGRICULTURE:
    - Medium vegetation_ratio (0.25–0.55): Crop coverage (seasonal)
    - Very low water_ratio (0.02–0.25): Irrigation in some scenes
    - Very low urban_density (0.02–0.08): Rural areas
    - Low edge_density (0.12–0.25): Regular field patterns
    - Medium mean_g (0.35–0.50): Moderate green from crops
    - Medium entropy (0.45–0.62): Regular but varied field mosaic

  COASTAL:
    - Medium water_ratio (0.25–0.55): Ocean/water in scene
    - Medium vegetation_ratio (0.15–0.40): Coastal vegetation
    - Low urban_density (0.05–0.22): Some coastal development
    - Medium edge_density (0.20–0.35): Coastline creates strong edges
    - Medium mean_b (0.42–0.60): Ocean water's blue
    - Mixed color profile (water + vegetation + sand)

DETERMINISM:
  Running this script twice with the same data produces identical JSON files.
  Adding variation within each scene type uses fixed per-scene delta values
  (deterministic variation, not random sampling).

ARCHIVE SIZE: 50 scenes total
  - 12 flood scenes
  - 12 vegetation scenes
  - 12 urban scenes
  - 8 agriculture scenes
  - 6 coastal scenes
"""

from __future__ import annotations

import json
import os
import sys

import numpy as np

# Add parent directory to path so we can import from services/ and utils/
_HERE = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HERE)
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from services.embedding_generator import generate_embedding
from utils.math_utils import l2_normalize


# Output file paths
EMBEDDINGS_PATH = os.path.join(_HERE, "embeddings.json")
METADATA_PATH   = os.path.join(_HERE, "metadata.json")


# ── Thumbnail URLs ────────────────────────────────────────────────────────────
# Curated Unsplash photo IDs matching each scene type.
# These are real aerial/satellite-like photographs used as visual previews.
_THUMBNAILS = {
    "flood":       [
        "https://images.unsplash.com/photo-1547683905-f686c993aae5?w=400",
        "https://images.unsplash.com/photo-1578496479531-32e296d5c6e1?w=400",
        "https://images.unsplash.com/photo-1532618500676-2e0cbf7ba8b8?w=400",
        "https://images.unsplash.com/photo-1565689874846-aa7a6408c1c9?w=400",
    ],
    "vegetation":  [
        "https://images.unsplash.com/photo-1448375240586-882707db888b?w=400",
        "https://images.unsplash.com/photo-1504567961542-e24d9439a724?w=400",
        "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400",
        "https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?w=400",
    ],
    "urban":       [
        "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?w=400",
        "https://images.unsplash.com/photo-1480714378702-484cc51f8b36?w=400",
        "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=400",
        "https://images.unsplash.com/photo-1444723121867-7a241cacace9?w=400",
    ],
    "agriculture": [
        "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400",
        "https://images.unsplash.com/photo-1464226184884-bc88beba8a5a?w=400",
        "https://images.unsplash.com/photo-1625246333195-78d9c38ad449?w=400",
        "https://images.unsplash.com/photo-1499529112087-3cb3b73cec95?w=400",
    ],
    "coastal":     [
        "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400",
        "https://images.unsplash.com/photo-1513026705753-bc3fffca8bf4?w=400",
        "https://images.unsplash.com/photo-1473091534298-04dcbce3278c?w=400",
        "https://images.unsplash.com/photo-1468581264429-2548ef9eb732?w=400",
    ],
}


def _get_thumbnail(scene_type: str, index: int) -> str:
    """Return a thumbnail URL for the given scene type, cycling through available options."""
    urls = _THUMBNAILS.get(scene_type, _THUMBNAILS["flood"])
    return urls[index % len(urls)]


# ── Archive scene definitions ─────────────────────────────────────────────────
# 50 scenes with hand-crafted feature profiles based on remote sensing domain knowledge.
# The "features" dict uses the same 14 keys as feature_extractor.py.
# Values are floats in [0, 1].

RAW_SCENES: list[dict] = [

    # ════════════════════════════════════════════════════════════════════════
    # FLOOD / INUNDATION SCENES  (12 scenes, SCN-001 to SCN-012)
    # ════════════════════════════════════════════════════════════════════════

    {
        "id": "SCN-001",
        "satellite": "RISAT-2B", "sensor_type": "SAR",
        "acquisition_date": "2023-08-15", "region": "Brahmaputra Valley",
        "state": "Assam", "country": "India",
        "lat": 26.15, "lng": 91.70,
        "resolution": "3m", "cloud_cover": 0,
        "scene_type": "flood", "orbit_number": 18924,
        "processing_level": "L2A", "archive_source": "ISRO-BHUVAN",
        "description": "Brahmaputra River major flood inundation, monsoon 2023",
        "features": {
            "mean_r": 0.32, "mean_g": 0.41, "mean_b": 0.65,
            "std_r": 0.07, "std_g": 0.09, "std_b": 0.10,
            "contrast": 0.10, "entropy": 0.52, "homogeneity": 0.89, "energy": 0.44,
            "edge_density": 0.07, "water_ratio": 0.82, "vegetation_ratio": 0.08, "urban_density": 0.03,
        },
    },
    {
        "id": "SCN-002",
        "satellite": "Sentinel-1A", "sensor_type": "SAR",
        "acquisition_date": "2022-07-20", "region": "Assam Plains",
        "state": "Assam", "country": "India",
        "lat": 26.44, "lng": 92.17,
        "resolution": "10m", "cloud_cover": 0,
        "scene_type": "flood", "orbit_number": 43712,
        "processing_level": "GRD", "archive_source": "ESA-COPERNICUS",
        "description": "Flash flood event across Assam plains post-cyclone",
        "features": {
            "mean_r": 0.31, "mean_g": 0.40, "mean_b": 0.63,
            "std_r": 0.08, "std_g": 0.09, "std_b": 0.11,
            "contrast": 0.12, "entropy": 0.55, "homogeneity": 0.86, "energy": 0.41,
            "edge_density": 0.09, "water_ratio": 0.76, "vegetation_ratio": 0.11, "urban_density": 0.05,
        },
    },
    {
        "id": "SCN-003",
        "satellite": "RISAT-2B", "sensor_type": "SAR",
        "acquisition_date": "2022-08-30", "region": "Bihar Floodplain",
        "state": "Bihar", "country": "India",
        "lat": 25.58, "lng": 85.14,
        "resolution": "3m", "cloud_cover": 0,
        "scene_type": "flood", "orbit_number": 15640,
        "processing_level": "L2A", "archive_source": "ISRO-BHUVAN",
        "description": "Monsoon flood inundation across Bihar floodplain",
        "features": {
            "mean_r": 0.35, "mean_g": 0.43, "mean_b": 0.61,
            "std_r": 0.09, "std_g": 0.10, "std_b": 0.12,
            "contrast": 0.13, "entropy": 0.57, "homogeneity": 0.85, "energy": 0.40,
            "edge_density": 0.10, "water_ratio": 0.74, "vegetation_ratio": 0.12, "urban_density": 0.08,
        },
    },
    {
        "id": "SCN-004",
        "satellite": "Sentinel-1B", "sensor_type": "SAR",
        "acquisition_date": "2021-10-05", "region": "Odisha Coast",
        "state": "Odisha", "country": "India",
        "lat": 20.26, "lng": 85.83,
        "resolution": "10m", "cloud_cover": 0,
        "scene_type": "flood", "orbit_number": 39215,
        "processing_level": "GRD", "archive_source": "ESA-COPERNICUS",
        "description": "Cyclone Gulab storm surge flood along Odisha coastline",
        "features": {
            "mean_r": 0.34, "mean_g": 0.44, "mean_b": 0.60,
            "std_r": 0.09, "std_g": 0.10, "std_b": 0.13,
            "contrast": 0.14, "entropy": 0.58, "homogeneity": 0.84, "energy": 0.38,
            "edge_density": 0.11, "water_ratio": 0.71, "vegetation_ratio": 0.14, "urban_density": 0.06,
        },
    },
    {
        "id": "SCN-005",
        "satellite": "ALOS-2", "sensor_type": "SAR",
        "acquisition_date": "2020-09-12", "region": "Bengal Delta",
        "state": "West Bengal", "country": "India",
        "lat": 22.57, "lng": 88.36,
        "resolution": "10m", "cloud_cover": 0,
        "scene_type": "flood", "orbit_number": 28401,
        "processing_level": "L2.1", "archive_source": "JAXA",
        "description": "River overflow flood in Bengal Delta region",
        "features": {
            "mean_r": 0.36, "mean_g": 0.45, "mean_b": 0.59,
            "std_r": 0.10, "std_g": 0.11, "std_b": 0.13,
            "contrast": 0.15, "entropy": 0.60, "homogeneity": 0.83, "energy": 0.37,
            "edge_density": 0.12, "water_ratio": 0.68, "vegetation_ratio": 0.17, "urban_density": 0.07,
        },
    },
    {
        "id": "SCN-006",
        "satellite": "Sentinel-1A", "sensor_type": "SAR",
        "acquisition_date": "2018-08-21", "region": "Kerala Backwaters",
        "state": "Kerala", "country": "India",
        "lat": 9.50, "lng": 76.35,
        "resolution": "10m", "cloud_cover": 0,
        "scene_type": "flood", "orbit_number": 22018,
        "processing_level": "GRD", "archive_source": "ESA-COPERNICUS",
        "description": "Kerala megaflood 2018 — worst flooding in a century",
        "features": {
            "mean_r": 0.33, "mean_g": 0.43, "mean_b": 0.60,
            "std_r": 0.08, "std_g": 0.09, "std_b": 0.12,
            "contrast": 0.14, "entropy": 0.59, "homogeneity": 0.84, "energy": 0.39,
            "edge_density": 0.10, "water_ratio": 0.73, "vegetation_ratio": 0.18, "urban_density": 0.05,
        },
    },
    {
        "id": "SCN-007",
        "satellite": "RISAT-2B", "sensor_type": "SAR",
        "acquisition_date": "2023-09-01", "region": "Ganga Plains",
        "state": "Uttar Pradesh", "country": "India",
        "lat": 25.32, "lng": 82.97,
        "resolution": "3m", "cloud_cover": 0,
        "scene_type": "flood", "orbit_number": 19102,
        "processing_level": "L2A", "archive_source": "ISRO-BHUVAN",
        "description": "Ganga river seasonal flood near Varanasi",
        "features": {
            "mean_r": 0.36, "mean_g": 0.44, "mean_b": 0.60,
            "std_r": 0.09, "std_g": 0.10, "std_b": 0.12,
            "contrast": 0.14, "entropy": 0.56, "homogeneity": 0.85, "energy": 0.40,
            "edge_density": 0.10, "water_ratio": 0.70, "vegetation_ratio": 0.13, "urban_density": 0.09,
        },
    },
    {
        "id": "SCN-008",
        "satellite": "Sentinel-1B", "sensor_type": "SAR",
        "acquisition_date": "2021-07-15", "region": "Godavari Delta",
        "state": "Andhra Pradesh", "country": "India",
        "lat": 16.31, "lng": 82.15,
        "resolution": "10m", "cloud_cover": 0,
        "scene_type": "flood", "orbit_number": 38004,
        "processing_level": "GRD", "archive_source": "ESA-COPERNICUS",
        "description": "Godavari delta flood caused by upstream dam release",
        "features": {
            "mean_r": 0.34, "mean_g": 0.43, "mean_b": 0.61,
            "std_r": 0.09, "std_g": 0.10, "std_b": 0.12,
            "contrast": 0.13, "entropy": 0.57, "homogeneity": 0.86, "energy": 0.41,
            "edge_density": 0.09, "water_ratio": 0.72, "vegetation_ratio": 0.14, "urban_density": 0.06,
        },
    },
    {
        "id": "SCN-009",
        "satellite": "RISAT-2B", "sensor_type": "SAR",
        "acquisition_date": "2022-08-10", "region": "Mahanadi Basin",
        "state": "Odisha", "country": "India",
        "lat": 20.46, "lng": 85.07,
        "resolution": "3m", "cloud_cover": 0,
        "scene_type": "flood", "orbit_number": 16200,
        "processing_level": "L2A", "archive_source": "ISRO-BHUVAN",
        "description": "Mahanadi basin flood near Hirakud reservoir",
        "features": {
            "mean_r": 0.33, "mean_g": 0.42, "mean_b": 0.62,
            "std_r": 0.08, "std_g": 0.09, "std_b": 0.11,
            "contrast": 0.11, "entropy": 0.54, "homogeneity": 0.87, "energy": 0.42,
            "edge_density": 0.08, "water_ratio": 0.75, "vegetation_ratio": 0.10, "urban_density": 0.05,
        },
    },
    {
        "id": "SCN-010",
        "satellite": "Sentinel-1A", "sensor_type": "SAR",
        "acquisition_date": "2023-08-22", "region": "Kosi River",
        "state": "Bihar", "country": "India",
        "lat": 26.08, "lng": 87.19,
        "resolution": "10m", "cloud_cover": 0,
        "scene_type": "flood", "orbit_number": 44110,
        "processing_level": "GRD", "archive_source": "ESA-COPERNICUS",
        "description": "Kosi river flash flood, northern Bihar",
        "features": {
            "mean_r": 0.30, "mean_g": 0.40, "mean_b": 0.64,
            "std_r": 0.07, "std_g": 0.08, "std_b": 0.10,
            "contrast": 0.09, "entropy": 0.51, "homogeneity": 0.90, "energy": 0.45,
            "edge_density": 0.06, "water_ratio": 0.80, "vegetation_ratio": 0.07, "urban_density": 0.04,
        },
    },
    {
        "id": "SCN-011",
        "satellite": "Sentinel-1B", "sensor_type": "SAR",
        "acquisition_date": "2023-07-14", "region": "Yamuna Flood",
        "state": "Delhi", "country": "India",
        "lat": 28.65, "lng": 77.21,
        "resolution": "10m", "cloud_cover": 0,
        "scene_type": "flood", "orbit_number": 43991,
        "processing_level": "GRD", "archive_source": "ESA-COPERNICUS",
        "description": "Yamuna River record flood inundating Delhi low-lying areas",
        "features": {
            "mean_r": 0.38, "mean_g": 0.46, "mean_b": 0.58,
            "std_r": 0.11, "std_g": 0.11, "std_b": 0.12,
            "contrast": 0.17, "entropy": 0.62, "homogeneity": 0.81, "energy": 0.36,
            "edge_density": 0.14, "water_ratio": 0.62, "vegetation_ratio": 0.09, "urban_density": 0.18,
        },
    },
    {
        "id": "SCN-012",
        "satellite": "RISAT-2B", "sensor_type": "SAR",
        "acquisition_date": "2022-06-20", "region": "Haor Wetlands",
        "state": "Sylhet", "country": "Bangladesh",
        "lat": 24.90, "lng": 91.87,
        "resolution": "3m", "cloud_cover": 0,
        "scene_type": "flood", "orbit_number": 14908,
        "processing_level": "L2A", "archive_source": "ISRO-BHUVAN",
        "description": "Bangladesh haor wetland flash flood, pre-monsoon",
        "features": {
            "mean_r": 0.29, "mean_g": 0.38, "mean_b": 0.66,
            "std_r": 0.06, "std_g": 0.07, "std_b": 0.09,
            "contrast": 0.08, "entropy": 0.48, "homogeneity": 0.92, "energy": 0.47,
            "edge_density": 0.05, "water_ratio": 0.85, "vegetation_ratio": 0.06, "urban_density": 0.03,
        },
    },

    # ════════════════════════════════════════════════════════════════════════
    # VEGETATION / FOREST SCENES  (12 scenes, SCN-013 to SCN-024)
    # ════════════════════════════════════════════════════════════════════════

    {
        "id": "SCN-013",
        "satellite": "Sentinel-2A", "sensor_type": "Multispectral",
        "acquisition_date": "2023-03-10", "region": "Western Ghats",
        "state": "Karnataka", "country": "India",
        "lat": 14.20, "lng": 75.58,
        "resolution": "10m", "cloud_cover": 4,
        "scene_type": "vegetation", "orbit_number": 30214,
        "processing_level": "L2A", "archive_source": "ESA-COPERNICUS",
        "description": "Dense evergreen forest, Western Ghats biodiversity hotspot",
        "features": {
            "mean_r": 0.30, "mean_g": 0.52, "mean_b": 0.36,
            "std_r": 0.08, "std_g": 0.10, "std_b": 0.08,
            "contrast": 0.22, "entropy": 0.65, "homogeneity": 0.74, "energy": 0.30,
            "edge_density": 0.24, "water_ratio": 0.07, "vegetation_ratio": 0.82, "urban_density": 0.03,
        },
    },
    {
        "id": "SCN-014",
        "satellite": "Landsat-9", "sensor_type": "Optical",
        "acquisition_date": "2022-11-25", "region": "Sundarbans",
        "state": "West Bengal", "country": "India",
        "lat": 21.95, "lng": 89.18,
        "resolution": "30m", "cloud_cover": 8,
        "scene_type": "vegetation", "orbit_number": 8420,
        "processing_level": "L2SP", "archive_source": "USGS-LANDSAT",
        "description": "Sundarbans mangrove delta — world's largest mangrove forest",
        "features": {
            "mean_r": 0.32, "mean_g": 0.49, "mean_b": 0.40,
            "std_r": 0.09, "std_g": 0.10, "std_b": 0.10,
            "contrast": 0.24, "entropy": 0.67, "homogeneity": 0.72, "energy": 0.28,
            "edge_density": 0.26, "water_ratio": 0.18, "vegetation_ratio": 0.74, "urban_density": 0.02,
        },
    },
    {
        "id": "SCN-015",
        "satellite": "Sentinel-2B", "sensor_type": "Multispectral",
        "acquisition_date": "2023-05-15", "region": "Northeast Jungle",
        "state": "Meghalaya", "country": "India",
        "lat": 25.57, "lng": 91.88,
        "resolution": "10m", "cloud_cover": 12,
        "scene_type": "vegetation", "orbit_number": 33810,
        "processing_level": "L2A", "archive_source": "ESA-COPERNICUS",
        "description": "Northeast India mixed tropical forest",
        "features": {
            "mean_r": 0.29, "mean_g": 0.51, "mean_b": 0.37,
            "std_r": 0.08, "std_g": 0.09, "std_b": 0.08,
            "contrast": 0.20, "entropy": 0.63, "homogeneity": 0.75, "energy": 0.31,
            "edge_density": 0.22, "water_ratio": 0.12, "vegetation_ratio": 0.78, "urban_density": 0.03,
        },
    },
    {
        "id": "SCN-016",
        "satellite": "Cartosat-3", "sensor_type": "Optical",
        "acquisition_date": "2022-09-20", "region": "Himachal Pine Forest",
        "state": "Himachal Pradesh", "country": "India",
        "lat": 31.10, "lng": 77.17,
        "resolution": "0.25m", "cloud_cover": 0,
        "scene_type": "vegetation", "orbit_number": 5240,
        "processing_level": "L2A", "archive_source": "ISRO-BHUVAN",
        "description": "Himachal Pradesh pine and deodar forests",
        "features": {
            "mean_r": 0.31, "mean_g": 0.48, "mean_b": 0.34,
            "std_r": 0.09, "std_g": 0.10, "std_b": 0.09,
            "contrast": 0.25, "entropy": 0.66, "homogeneity": 0.73, "energy": 0.29,
            "edge_density": 0.27, "water_ratio": 0.11, "vegetation_ratio": 0.72, "urban_density": 0.05,
        },
    },
    {
        "id": "SCN-017",
        "satellite": "Sentinel-2A", "sensor_type": "Multispectral",
        "acquisition_date": "2023-01-08", "region": "Andaman Islands",
        "state": "Andaman", "country": "India",
        "lat": 11.74, "lng": 92.66,
        "resolution": "10m", "cloud_cover": 3,
        "scene_type": "vegetation", "orbit_number": 28900,
        "processing_level": "L2A", "archive_source": "ESA-COPERNICUS",
        "description": "Andaman Islands tropical rainforest — pristine closed-canopy",
        "features": {
            "mean_r": 0.27, "mean_g": 0.54, "mean_b": 0.35,
            "std_r": 0.07, "std_g": 0.09, "std_b": 0.07,
            "contrast": 0.18, "entropy": 0.60, "homogeneity": 0.78, "energy": 0.34,
            "edge_density": 0.20, "water_ratio": 0.08, "vegetation_ratio": 0.85, "urban_density": 0.02,
        },
    },
    {
        "id": "SCN-018",
        "satellite": "Landsat-9", "sensor_type": "Optical",
        "acquisition_date": "2023-04-05", "region": "Madhya Pradesh Forest",
        "state": "Madhya Pradesh", "country": "India",
        "lat": 22.97, "lng": 78.66,
        "resolution": "30m", "cloud_cover": 5,
        "scene_type": "vegetation", "orbit_number": 10301,
        "processing_level": "L2SP", "archive_source": "USGS-LANDSAT",
        "description": "Madhya Pradesh dry deciduous forest in post-monsoon state",
        "features": {
            "mean_r": 0.35, "mean_g": 0.47, "mean_b": 0.32,
            "std_r": 0.10, "std_g": 0.11, "std_b": 0.09,
            "contrast": 0.28, "entropy": 0.68, "homogeneity": 0.70, "energy": 0.27,
            "edge_density": 0.29, "water_ratio": 0.06, "vegetation_ratio": 0.62, "urban_density": 0.07,
        },
    },
    {
        "id": "SCN-019",
        "satellite": "ResourceSat-2A", "sensor_type": "Multispectral",
        "acquisition_date": "2022-06-12", "region": "Sikkim Forest",
        "state": "Sikkim", "country": "India",
        "lat": 27.53, "lng": 88.51,
        "resolution": "5.8m", "cloud_cover": 14,
        "scene_type": "vegetation", "orbit_number": 41230,
        "processing_level": "L2", "archive_source": "ISRO-BHUVAN",
        "description": "Sikkim conifer forest with rhododendron understorey",
        "features": {
            "mean_r": 0.30, "mean_g": 0.50, "mean_b": 0.36,
            "std_r": 0.08, "std_g": 0.10, "std_b": 0.08,
            "contrast": 0.21, "entropy": 0.64, "homogeneity": 0.74, "energy": 0.30,
            "edge_density": 0.23, "water_ratio": 0.14, "vegetation_ratio": 0.76, "urban_density": 0.03,
        },
    },
    {
        "id": "SCN-020",
        "satellite": "Sentinel-2B", "sensor_type": "Multispectral",
        "acquisition_date": "2022-07-30", "region": "Meghalaya Cloud Forest",
        "state": "Meghalaya", "country": "India",
        "lat": 25.47, "lng": 91.36,
        "resolution": "10m", "cloud_cover": 20,
        "scene_type": "vegetation", "orbit_number": 38142,
        "processing_level": "L2A", "archive_source": "ESA-COPERNICUS",
        "description": "Meghalaya cloud forest — one of wettest regions on Earth",
        "features": {
            "mean_r": 0.28, "mean_g": 0.53, "mean_b": 0.40,
            "std_r": 0.07, "std_g": 0.09, "std_b": 0.09,
            "contrast": 0.17, "entropy": 0.62, "homogeneity": 0.76, "energy": 0.32,
            "edge_density": 0.19, "water_ratio": 0.16, "vegetation_ratio": 0.80, "urban_density": 0.02,
        },
    },
    {
        "id": "SCN-021",
        "satellite": "Cartosat-3", "sensor_type": "Optical",
        "acquisition_date": "2023-02-14", "region": "Kerala Teak Plantation",
        "state": "Kerala", "country": "India",
        "lat": 10.52, "lng": 76.21,
        "resolution": "0.25m", "cloud_cover": 0,
        "scene_type": "vegetation", "orbit_number": 5880,
        "processing_level": "L2A", "archive_source": "ISRO-BHUVAN",
        "description": "Managed teak and rubber plantation in Kerala",
        "features": {
            "mean_r": 0.33, "mean_g": 0.49, "mean_b": 0.34,
            "std_r": 0.09, "std_g": 0.10, "std_b": 0.08,
            "contrast": 0.23, "entropy": 0.64, "homogeneity": 0.73, "energy": 0.29,
            "edge_density": 0.25, "water_ratio": 0.09, "vegetation_ratio": 0.70, "urban_density": 0.05,
        },
    },
    {
        "id": "SCN-022",
        "satellite": "Landsat-9", "sensor_type": "Optical",
        "acquisition_date": "2022-10-18", "region": "Uttarakhand Oak Forest",
        "state": "Uttarakhand", "country": "India",
        "lat": 30.07, "lng": 79.07,
        "resolution": "30m", "cloud_cover": 6,
        "scene_type": "vegetation", "orbit_number": 7812,
        "processing_level": "L2SP", "archive_source": "USGS-LANDSAT",
        "description": "Uttarakhand oak and rhododendron mixed forest",
        "features": {
            "mean_r": 0.31, "mean_g": 0.49, "mean_b": 0.35,
            "std_r": 0.09, "std_g": 0.10, "std_b": 0.09,
            "contrast": 0.22, "entropy": 0.64, "homogeneity": 0.74, "energy": 0.30,
            "edge_density": 0.24, "water_ratio": 0.11, "vegetation_ratio": 0.73, "urban_density": 0.04,
        },
    },
    {
        "id": "SCN-023",
        "satellite": "ResourceSat-2A", "sensor_type": "Multispectral",
        "acquisition_date": "2023-06-20", "region": "Chhattisgarh Jungle",
        "state": "Chhattisgarh", "country": "India",
        "lat": 20.27, "lng": 81.86,
        "resolution": "5.8m", "cloud_cover": 11,
        "scene_type": "vegetation", "orbit_number": 42100,
        "processing_level": "L2", "archive_source": "ISRO-BHUVAN",
        "description": "Chhattisgarh jungle / mixed tropical forest",
        "features": {
            "mean_r": 0.33, "mean_g": 0.48, "mean_b": 0.33,
            "std_r": 0.10, "std_g": 0.10, "std_b": 0.08,
            "contrast": 0.26, "entropy": 0.67, "homogeneity": 0.72, "energy": 0.28,
            "edge_density": 0.28, "water_ratio": 0.07, "vegetation_ratio": 0.66, "urban_density": 0.07,
        },
    },
    {
        "id": "SCN-024",
        "satellite": "Sentinel-2A", "sensor_type": "Multispectral",
        "acquisition_date": "2022-12-05", "region": "Nilgiri Hills",
        "state": "Tamil Nadu", "country": "India",
        "lat": 11.41, "lng": 76.69,
        "resolution": "10m", "cloud_cover": 7,
        "scene_type": "vegetation", "orbit_number": 27640,
        "processing_level": "L2A", "archive_source": "ESA-COPERNICUS",
        "description": "Nilgiri Hills shola forest and grassland mosaic",
        "features": {
            "mean_r": 0.30, "mean_g": 0.51, "mean_b": 0.36,
            "std_r": 0.08, "std_g": 0.10, "std_b": 0.08,
            "contrast": 0.21, "entropy": 0.63, "homogeneity": 0.75, "energy": 0.31,
            "edge_density": 0.23, "water_ratio": 0.12, "vegetation_ratio": 0.77, "urban_density": 0.04,
        },
    },

    # ════════════════════════════════════════════════════════════════════════
    # URBAN SCENES  (12 scenes, SCN-025 to SCN-036)
    # ════════════════════════════════════════════════════════════════════════

    {
        "id": "SCN-025",
        "satellite": "Cartosat-3", "sensor_type": "Optical",
        "acquisition_date": "2023-02-10", "region": "Delhi NCR",
        "state": "Delhi", "country": "India",
        "lat": 28.61, "lng": 77.21,
        "resolution": "0.25m", "cloud_cover": 0,
        "scene_type": "urban", "orbit_number": 5621,
        "processing_level": "L2A", "archive_source": "ISRO-BHUVAN",
        "description": "Delhi dense urban fabric — residential and commercial mix",
        "features": {
            "mean_r": 0.46, "mean_g": 0.43, "mean_b": 0.40,
            "std_r": 0.13, "std_g": 0.12, "std_b": 0.11,
            "contrast": 0.52, "entropy": 0.78, "homogeneity": 0.52, "energy": 0.16,
            "edge_density": 0.58, "water_ratio": 0.03, "vegetation_ratio": 0.08, "urban_density": 0.78,
        },
    },
    {
        "id": "SCN-026",
        "satellite": "Sentinel-2A", "sensor_type": "Multispectral",
        "acquisition_date": "2022-12-18", "region": "Mumbai Metro",
        "state": "Maharashtra", "country": "India",
        "lat": 19.08, "lng": 72.88,
        "resolution": "10m", "cloud_cover": 2,
        "scene_type": "urban", "orbit_number": 29044,
        "processing_level": "L2A", "archive_source": "ESA-COPERNICUS",
        "description": "Mumbai dense coastal urban area",
        "features": {
            "mean_r": 0.44, "mean_g": 0.42, "mean_b": 0.42,
            "std_r": 0.12, "std_g": 0.11, "std_b": 0.11,
            "contrast": 0.48, "entropy": 0.76, "homogeneity": 0.54, "energy": 0.17,
            "edge_density": 0.54, "water_ratio": 0.11, "vegetation_ratio": 0.10, "urban_density": 0.72,
        },
    },
    {
        "id": "SCN-027",
        "satellite": "Cartosat-3", "sensor_type": "Optical",
        "acquisition_date": "2023-05-22", "region": "Bangalore IT Hub",
        "state": "Karnataka", "country": "India",
        "lat": 12.97, "lng": 77.59,
        "resolution": "0.25m", "cloud_cover": 0,
        "scene_type": "urban", "orbit_number": 6410,
        "processing_level": "L2A", "archive_source": "ISRO-BHUVAN",
        "description": "Bangalore electronic city IT park and urban sprawl",
        "features": {
            "mean_r": 0.42, "mean_g": 0.44, "mean_b": 0.38,
            "std_r": 0.12, "std_g": 0.12, "std_b": 0.11,
            "contrast": 0.44, "entropy": 0.74, "homogeneity": 0.56, "energy": 0.18,
            "edge_density": 0.50, "water_ratio": 0.05, "vegetation_ratio": 0.18, "urban_density": 0.68,
        },
    },
    {
        "id": "SCN-028",
        "satellite": "Sentinel-2B", "sensor_type": "Multispectral",
        "acquisition_date": "2023-01-30", "region": "Chennai Port City",
        "state": "Tamil Nadu", "country": "India",
        "lat": 13.08, "lng": 80.27,
        "resolution": "10m", "cloud_cover": 3,
        "scene_type": "urban", "orbit_number": 30118,
        "processing_level": "L2A", "archive_source": "ESA-COPERNICUS",
        "description": "Chennai urban density including port and industrial zone",
        "features": {
            "mean_r": 0.45, "mean_g": 0.43, "mean_b": 0.41,
            "std_r": 0.13, "std_g": 0.12, "std_b": 0.12,
            "contrast": 0.49, "entropy": 0.77, "homogeneity": 0.53, "energy": 0.16,
            "edge_density": 0.55, "water_ratio": 0.12, "vegetation_ratio": 0.12, "urban_density": 0.70,
        },
    },
    {
        "id": "SCN-029",
        "satellite": "Landsat-9", "sensor_type": "Optical",
        "acquisition_date": "2022-03-15", "region": "Kolkata Dense City",
        "state": "West Bengal", "country": "India",
        "lat": 22.57, "lng": 88.36,
        "resolution": "30m", "cloud_cover": 5,
        "scene_type": "urban", "orbit_number": 4201,
        "processing_level": "L2SP", "archive_source": "USGS-LANDSAT",
        "description": "Kolkata high-density urban area with industrial zones",
        "features": {
            "mean_r": 0.47, "mean_g": 0.44, "mean_b": 0.41,
            "std_r": 0.13, "std_g": 0.12, "std_b": 0.12,
            "contrast": 0.53, "entropy": 0.79, "homogeneity": 0.51, "energy": 0.15,
            "edge_density": 0.59, "water_ratio": 0.09, "vegetation_ratio": 0.09, "urban_density": 0.75,
        },
    },
    {
        "id": "SCN-030",
        "satellite": "Cartosat-3", "sensor_type": "Optical",
        "acquisition_date": "2022-11-10", "region": "Hyderabad Modern City",
        "state": "Telangana", "country": "India",
        "lat": 17.39, "lng": 78.49,
        "resolution": "0.25m", "cloud_cover": 0,
        "scene_type": "urban", "orbit_number": 4880,
        "processing_level": "L2A", "archive_source": "ISRO-BHUVAN",
        "description": "Hyderabad HITEC city and modern urban expansion",
        "features": {
            "mean_r": 0.43, "mean_g": 0.43, "mean_b": 0.39,
            "std_r": 0.12, "std_g": 0.12, "std_b": 0.11,
            "contrast": 0.46, "entropy": 0.75, "homogeneity": 0.55, "energy": 0.18,
            "edge_density": 0.52, "water_ratio": 0.07, "vegetation_ratio": 0.16, "urban_density": 0.65,
        },
    },
    {
        "id": "SCN-031",
        "satellite": "Sentinel-2A", "sensor_type": "Multispectral",
        "acquisition_date": "2023-04-20", "region": "Pune Growing City",
        "state": "Maharashtra", "country": "India",
        "lat": 18.52, "lng": 73.86,
        "resolution": "10m", "cloud_cover": 4,
        "scene_type": "urban", "orbit_number": 31210,
        "processing_level": "L2A", "archive_source": "ESA-COPERNICUS",
        "description": "Pune urban expansion — IT corridor and residential zones",
        "features": {
            "mean_r": 0.41, "mean_g": 0.43, "mean_b": 0.38,
            "std_r": 0.11, "std_g": 0.12, "std_b": 0.10,
            "contrast": 0.42, "entropy": 0.73, "homogeneity": 0.57, "energy": 0.19,
            "edge_density": 0.48, "water_ratio": 0.05, "vegetation_ratio": 0.20, "urban_density": 0.62,
        },
    },
    {
        "id": "SCN-032",
        "satellite": "ResourceSat-2A", "sensor_type": "Multispectral",
        "acquisition_date": "2022-08-05", "region": "Ahmedabad Industrial",
        "state": "Gujarat", "country": "India",
        "lat": 23.02, "lng": 72.57,
        "resolution": "5.8m", "cloud_cover": 0,
        "scene_type": "urban", "orbit_number": 39820,
        "processing_level": "L2", "archive_source": "ISRO-BHUVAN",
        "description": "Ahmedabad industrial zone and textile mill area",
        "features": {
            "mean_r": 0.48, "mean_g": 0.44, "mean_b": 0.40,
            "std_r": 0.13, "std_g": 0.12, "std_b": 0.11,
            "contrast": 0.51, "entropy": 0.78, "homogeneity": 0.52, "energy": 0.16,
            "edge_density": 0.57, "water_ratio": 0.04, "vegetation_ratio": 0.08, "urban_density": 0.74,
        },
    },
    {
        "id": "SCN-033",
        "satellite": "Cartosat-3", "sensor_type": "Optical",
        "acquisition_date": "2023-07-01", "region": "Surat Textile Hub",
        "state": "Gujarat", "country": "India",
        "lat": 21.17, "lng": 72.83,
        "resolution": "0.25m", "cloud_cover": 0,
        "scene_type": "urban", "orbit_number": 6900,
        "processing_level": "L2A", "archive_source": "ISRO-BHUVAN",
        "description": "Surat textile manufacturing hub urban fabric",
        "features": {
            "mean_r": 0.45, "mean_g": 0.43, "mean_b": 0.40,
            "std_r": 0.12, "std_g": 0.12, "std_b": 0.11,
            "contrast": 0.49, "entropy": 0.77, "homogeneity": 0.53, "energy": 0.16,
            "edge_density": 0.55, "water_ratio": 0.07, "vegetation_ratio": 0.10, "urban_density": 0.70,
        },
    },
    {
        "id": "SCN-034",
        "satellite": "Landsat-9", "sensor_type": "Optical",
        "acquisition_date": "2022-01-22", "region": "Jaipur Walled City",
        "state": "Rajasthan", "country": "India",
        "lat": 26.91, "lng": 75.79,
        "resolution": "30m", "cloud_cover": 0,
        "scene_type": "urban", "orbit_number": 3108,
        "processing_level": "L2SP", "archive_source": "USGS-LANDSAT",
        "description": "Jaipur historic walled city and modern suburban expansion",
        "features": {
            "mean_r": 0.50, "mean_g": 0.45, "mean_b": 0.38,
            "std_r": 0.13, "std_g": 0.12, "std_b": 0.10,
            "contrast": 0.50, "entropy": 0.76, "homogeneity": 0.53, "energy": 0.17,
            "edge_density": 0.55, "water_ratio": 0.03, "vegetation_ratio": 0.14, "urban_density": 0.66,
        },
    },
    {
        "id": "SCN-035",
        "satellite": "Sentinel-2A", "sensor_type": "Multispectral",
        "acquisition_date": "2023-03-28", "region": "Lucknow Regional Capital",
        "state": "Uttar Pradesh", "country": "India",
        "lat": 26.85, "lng": 80.95,
        "resolution": "10m", "cloud_cover": 6,
        "scene_type": "urban", "orbit_number": 30614,
        "processing_level": "L2A", "archive_source": "ESA-COPERNICUS",
        "description": "Lucknow city centre and peri-urban expansion",
        "features": {
            "mean_r": 0.44, "mean_g": 0.43, "mean_b": 0.39,
            "std_r": 0.12, "std_g": 0.12, "std_b": 0.11,
            "contrast": 0.46, "entropy": 0.75, "homogeneity": 0.55, "energy": 0.18,
            "edge_density": 0.51, "water_ratio": 0.06, "vegetation_ratio": 0.16, "urban_density": 0.63,
        },
    },
    {
        "id": "SCN-036",
        "satellite": "Sentinel-2B", "sensor_type": "Multispectral",
        "acquisition_date": "2022-07-05", "region": "Dhaka Megacity",
        "state": "Dhaka", "country": "Bangladesh",
        "lat": 23.81, "lng": 90.41,
        "resolution": "10m", "cloud_cover": 9,
        "scene_type": "urban", "orbit_number": 34120,
        "processing_level": "L2A", "archive_source": "ESA-COPERNICUS",
        "description": "Dhaka hyper-dense urban megacity fabric",
        "features": {
            "mean_r": 0.45, "mean_g": 0.43, "mean_b": 0.40,
            "std_r": 0.12, "std_g": 0.11, "std_b": 0.11,
            "contrast": 0.55, "entropy": 0.81, "homogeneity": 0.49, "energy": 0.14,
            "edge_density": 0.62, "water_ratio": 0.07, "vegetation_ratio": 0.06, "urban_density": 0.80,
        },
    },

    # ════════════════════════════════════════════════════════════════════════
    # AGRICULTURE SCENES  (8 scenes, SCN-037 to SCN-044)
    # ════════════════════════════════════════════════════════════════════════

    {
        "id": "SCN-037",
        "satellite": "Sentinel-2A", "sensor_type": "Multispectral",
        "acquisition_date": "2022-11-15", "region": "Punjab Wheat Fields",
        "state": "Punjab", "country": "India",
        "lat": 30.73, "lng": 76.78,
        "resolution": "10m", "cloud_cover": 0,
        "scene_type": "agriculture", "orbit_number": 26011,
        "processing_level": "L2A", "archive_source": "ESA-COPERNICUS",
        "description": "Punjab wheat fields in rabi (winter) season",
        "features": {
            "mean_r": 0.38, "mean_g": 0.48, "mean_b": 0.30,
            "std_r": 0.10, "std_g": 0.10, "std_b": 0.07,
            "contrast": 0.18, "entropy": 0.55, "homogeneity": 0.78, "energy": 0.33,
            "edge_density": 0.16, "water_ratio": 0.04, "vegetation_ratio": 0.52, "urban_density": 0.05,
        },
    },
    {
        "id": "SCN-038",
        "satellite": "ResourceSat-2A", "sensor_type": "Multispectral",
        "acquisition_date": "2023-08-05", "region": "UP Rice Paddies",
        "state": "Uttar Pradesh", "country": "India",
        "lat": 26.85, "lng": 80.95,
        "resolution": "5.8m", "cloud_cover": 12,
        "scene_type": "agriculture", "orbit_number": 43410,
        "processing_level": "L2", "archive_source": "ISRO-BHUVAN",
        "description": "Uttar Pradesh flooded rice paddies in kharif season",
        "features": {
            "mean_r": 0.36, "mean_g": 0.47, "mean_b": 0.42,
            "std_r": 0.10, "std_g": 0.10, "std_b": 0.11,
            "contrast": 0.22, "entropy": 0.60, "homogeneity": 0.74, "energy": 0.28,
            "edge_density": 0.20, "water_ratio": 0.22, "vegetation_ratio": 0.45, "urban_density": 0.05,
        },
    },
    {
        "id": "SCN-039",
        "satellite": "Landsat-9", "sensor_type": "Optical",
        "acquisition_date": "2023-01-18", "region": "AP Cotton Fields",
        "state": "Andhra Pradesh", "country": "India",
        "lat": 15.91, "lng": 79.74,
        "resolution": "30m", "cloud_cover": 3,
        "scene_type": "agriculture", "orbit_number": 9620,
        "processing_level": "L2SP", "archive_source": "USGS-LANDSAT",
        "description": "Andhra Pradesh cotton belt in post-flowering stage",
        "features": {
            "mean_r": 0.40, "mean_g": 0.46, "mean_b": 0.28,
            "std_r": 0.11, "std_g": 0.10, "std_b": 0.06,
            "contrast": 0.20, "entropy": 0.56, "homogeneity": 0.76, "energy": 0.32,
            "edge_density": 0.18, "water_ratio": 0.05, "vegetation_ratio": 0.42, "urban_density": 0.06,
        },
    },
    {
        "id": "SCN-040",
        "satellite": "Sentinel-2B", "sensor_type": "Multispectral",
        "acquisition_date": "2023-02-28", "region": "Karnataka Sugarcane",
        "state": "Karnataka", "country": "India",
        "lat": 15.33, "lng": 75.14,
        "resolution": "10m", "cloud_cover": 0,
        "scene_type": "agriculture", "orbit_number": 29820,
        "processing_level": "L2A", "archive_source": "ESA-COPERNICUS",
        "description": "Karnataka sugarcane irrigation belt near Belgavi",
        "features": {
            "mean_r": 0.35, "mean_g": 0.49, "mean_b": 0.31,
            "std_r": 0.09, "std_g": 0.10, "std_b": 0.07,
            "contrast": 0.17, "entropy": 0.53, "homogeneity": 0.80, "energy": 0.36,
            "edge_density": 0.15, "water_ratio": 0.08, "vegetation_ratio": 0.56, "urban_density": 0.05,
        },
    },
    {
        "id": "SCN-041",
        "satellite": "Landsat-9", "sensor_type": "Optical",
        "acquisition_date": "2022-09-25", "region": "Maharashtra Soybean",
        "state": "Maharashtra", "country": "India",
        "lat": 20.00, "lng": 76.00,
        "resolution": "30m", "cloud_cover": 8,
        "scene_type": "agriculture", "orbit_number": 7001,
        "processing_level": "L2SP", "archive_source": "USGS-LANDSAT",
        "description": "Maharashtra Vidarbha soybean fields in peak growth",
        "features": {
            "mean_r": 0.37, "mean_g": 0.47, "mean_b": 0.29,
            "std_r": 0.10, "std_g": 0.10, "std_b": 0.07,
            "contrast": 0.19, "entropy": 0.57, "homogeneity": 0.77, "energy": 0.31,
            "edge_density": 0.17, "water_ratio": 0.05, "vegetation_ratio": 0.48, "urban_density": 0.06,
        },
    },
    {
        "id": "SCN-042",
        "satellite": "ResourceSat-2A", "sensor_type": "Multispectral",
        "acquisition_date": "2023-07-20", "region": "Rajasthan Millet",
        "state": "Rajasthan", "country": "India",
        "lat": 25.14, "lng": 74.64,
        "resolution": "5.8m", "cloud_cover": 0,
        "scene_type": "agriculture", "orbit_number": 42840,
        "processing_level": "L2", "archive_source": "ISRO-BHUVAN",
        "description": "Rajasthan bajra (pearl millet) — semi-arid agriculture",
        "features": {
            "mean_r": 0.45, "mean_g": 0.44, "mean_b": 0.26,
            "std_r": 0.12, "std_g": 0.11, "std_b": 0.06,
            "contrast": 0.24, "entropy": 0.58, "homogeneity": 0.74, "energy": 0.30,
            "edge_density": 0.20, "water_ratio": 0.03, "vegetation_ratio": 0.32, "urban_density": 0.07,
        },
    },
    {
        "id": "SCN-043",
        "satellite": "Sentinel-2A", "sensor_type": "Multispectral",
        "acquisition_date": "2022-12-10", "region": "Gujarat Groundnut",
        "state": "Gujarat", "country": "India",
        "lat": 21.52, "lng": 71.19,
        "resolution": "10m", "cloud_cover": 1,
        "scene_type": "agriculture", "orbit_number": 27200,
        "processing_level": "L2A", "archive_source": "ESA-COPERNICUS",
        "description": "Saurashtra groundnut fields in harvesting season",
        "features": {
            "mean_r": 0.41, "mean_g": 0.46, "mean_b": 0.27,
            "std_r": 0.11, "std_g": 0.10, "std_b": 0.06,
            "contrast": 0.21, "entropy": 0.56, "homogeneity": 0.76, "energy": 0.32,
            "edge_density": 0.18, "water_ratio": 0.04, "vegetation_ratio": 0.44, "urban_density": 0.06,
        },
    },
    {
        "id": "SCN-044",
        "satellite": "ResourceSat-2A", "sensor_type": "Multispectral",
        "acquisition_date": "2023-09-10", "region": "Tamil Nadu Paddy",
        "state": "Tamil Nadu", "country": "India",
        "lat": 10.79, "lng": 79.14,
        "resolution": "5.8m", "cloud_cover": 16,
        "scene_type": "agriculture", "orbit_number": 44200,
        "processing_level": "L2", "archive_source": "ISRO-BHUVAN",
        "description": "Cauvery delta paddy fields in transplanting season",
        "features": {
            "mean_r": 0.34, "mean_g": 0.48, "mean_b": 0.40,
            "std_r": 0.09, "std_g": 0.10, "std_b": 0.10,
            "contrast": 0.20, "entropy": 0.59, "homogeneity": 0.76, "energy": 0.30,
            "edge_density": 0.18, "water_ratio": 0.18, "vegetation_ratio": 0.50, "urban_density": 0.06,
        },
    },

    # ════════════════════════════════════════════════════════════════════════
    # COASTAL SCENES  (6 scenes, SCN-045 to SCN-050)
    # ════════════════════════════════════════════════════════════════════════

    {
        "id": "SCN-045",
        "satellite": "Sentinel-2A", "sensor_type": "Multispectral",
        "acquisition_date": "2022-12-20", "region": "Goa Coastal",
        "state": "Goa", "country": "India",
        "lat": 15.30, "lng": 73.92,
        "resolution": "10m", "cloud_cover": 5,
        "scene_type": "coastal", "orbit_number": 28140,
        "processing_level": "L2A", "archive_source": "ESA-COPERNICUS",
        "description": "Goa coastline — beaches, estuaries, and tourist zones",
        "features": {
            "mean_r": 0.38, "mean_g": 0.46, "mean_b": 0.54,
            "std_r": 0.11, "std_g": 0.11, "std_b": 0.13,
            "contrast": 0.28, "entropy": 0.68, "homogeneity": 0.70, "energy": 0.26,
            "edge_density": 0.28, "water_ratio": 0.44, "vegetation_ratio": 0.30, "urban_density": 0.18,
        },
    },
    {
        "id": "SCN-046",
        "satellite": "Landsat-9", "sensor_type": "Optical",
        "acquisition_date": "2023-02-05", "region": "Lakshadweep Atoll",
        "state": "Lakshadweep", "country": "India",
        "lat": 10.57, "lng": 72.64,
        "resolution": "30m", "cloud_cover": 8,
        "scene_type": "coastal", "orbit_number": 9902,
        "processing_level": "L2SP", "archive_source": "USGS-LANDSAT",
        "description": "Lakshadweep coral atoll — lagoon and fringing reef",
        "features": {
            "mean_r": 0.36, "mean_g": 0.50, "mean_b": 0.60,
            "std_r": 0.11, "std_g": 0.12, "std_b": 0.14,
            "contrast": 0.26, "entropy": 0.66, "homogeneity": 0.72, "energy": 0.27,
            "edge_density": 0.24, "water_ratio": 0.58, "vegetation_ratio": 0.28, "urban_density": 0.06,
        },
    },
    {
        "id": "SCN-047",
        "satellite": "Sentinel-2B", "sensor_type": "Multispectral",
        "acquisition_date": "2022-10-14", "region": "Sundarbans Delta Coast",
        "state": "West Bengal", "country": "India",
        "lat": 21.70, "lng": 88.60,
        "resolution": "10m", "cloud_cover": 14,
        "scene_type": "coastal", "orbit_number": 32918,
        "processing_level": "L2A", "archive_source": "ESA-COPERNICUS",
        "description": "Sundarbans tidal delta coastline — mangrove and mudflat",
        "features": {
            "mean_r": 0.34, "mean_g": 0.48, "mean_b": 0.52,
            "std_r": 0.10, "std_g": 0.11, "std_b": 0.13,
            "contrast": 0.27, "entropy": 0.67, "homogeneity": 0.71, "energy": 0.26,
            "edge_density": 0.27, "water_ratio": 0.50, "vegetation_ratio": 0.38, "urban_density": 0.06,
        },
    },
    {
        "id": "SCN-048",
        "satellite": "ResourceSat-2A", "sensor_type": "Multispectral",
        "acquisition_date": "2022-08-28", "region": "Gujarat Mangrove Coast",
        "state": "Gujarat", "country": "India",
        "lat": 22.64, "lng": 68.97,
        "resolution": "5.8m", "cloud_cover": 10,
        "scene_type": "coastal", "orbit_number": 40210,
        "processing_level": "L2", "archive_source": "ISRO-BHUVAN",
        "description": "Gujarat Rann of Kutch mangrove coastal wetland",
        "features": {
            "mean_r": 0.36, "mean_g": 0.47, "mean_b": 0.50,
            "std_r": 0.10, "std_g": 0.11, "std_b": 0.13,
            "contrast": 0.26, "entropy": 0.65, "homogeneity": 0.73, "energy": 0.27,
            "edge_density": 0.25, "water_ratio": 0.42, "vegetation_ratio": 0.35, "urban_density": 0.12,
        },
    },
    {
        "id": "SCN-049",
        "satellite": "Cartosat-3", "sensor_type": "Optical",
        "acquisition_date": "2023-01-20", "region": "Odisha Sandy Coast",
        "state": "Odisha", "country": "India",
        "lat": 19.82, "lng": 85.84,
        "resolution": "0.25m", "cloud_cover": 0,
        "scene_type": "coastal", "orbit_number": 5400,
        "processing_level": "L2A", "archive_source": "ISRO-BHUVAN",
        "description": "Odisha coastal beach with estuary and barrier island",
        "features": {
            "mean_r": 0.40, "mean_g": 0.47, "mean_b": 0.55,
            "std_r": 0.12, "std_g": 0.11, "std_b": 0.13,
            "contrast": 0.30, "entropy": 0.70, "homogeneity": 0.68, "energy": 0.24,
            "edge_density": 0.30, "water_ratio": 0.53, "vegetation_ratio": 0.22, "urban_density": 0.10,
        },
    },
    {
        "id": "SCN-050",
        "satellite": "Sentinel-2A", "sensor_type": "Multispectral",
        "acquisition_date": "2023-03-18", "region": "Kochi Backwaters",
        "state": "Kerala", "country": "India",
        "lat": 9.93, "lng": 76.26,
        "resolution": "10m", "cloud_cover": 7,
        "scene_type": "coastal", "orbit_number": 30710,
        "processing_level": "L2A", "archive_source": "ESA-COPERNICUS",
        "description": "Kochi backwater lagoon system — tourism and fishing villages",
        "features": {
            "mean_r": 0.35, "mean_g": 0.48, "mean_b": 0.52,
            "std_r": 0.10, "std_g": 0.11, "std_b": 0.13,
            "contrast": 0.26, "entropy": 0.66, "homogeneity": 0.73, "energy": 0.27,
            "edge_density": 0.25, "water_ratio": 0.48, "vegetation_ratio": 0.32, "urban_density": 0.14,
        },
    },
]


def generate_archive() -> None:
    """
    Generate embeddings.json and metadata.json from the RAW_SCENES definitions.

    ALGORITHM:
      For each scene:
        1. Read its "features" dict (14 named floats in [0,1])
        2. Call generate_embedding() — same function used for query images
        3. The resulting 14-dim unit vector is the scene's embedding
        4. Save {id, embedding} to embeddings.json
        5. Save full metadata (everything except embedding) to metadata.json

    WHY THE SAME FUNCTION AS QUERY:
      Using generate_embedding() for BOTH archive and query ensures that
      the weighting scheme is identical. If we used different weights for
      archive vs. query, cosine similarity would be comparing incompatible
      spaces and the results would be meaningless.

    OUTPUT:
      - embeddings.json: list of {"id": str, "embedding": list[float]}
      - metadata.json:   list of full scene metadata dicts
    """
    embeddings_list: list[dict] = []
    metadata_list:   list[dict] = []

    # Track how many of each scene type are processed (for thumbnail cycling)
    type_counts: dict[str, int] = {}

    for scene in RAW_SCENES:
        scene_type = scene["scene_type"]
        count      = type_counts.get(scene_type, 0)
        type_counts[scene_type] = count + 1

        # Assign thumbnail from the curated set for this scene type
        thumbnail_url = _get_thumbnail(scene_type, count)

        # ── Compute embedding from feature profile ────────────────────────────
        # This calls the EXACT SAME function as the query pipeline.
        # The embedding encodes the scene's feature profile as a unit vector.
        embedding_vector = generate_embedding(scene["features"])

        # Store embedding
        embeddings_list.append({
            "id":        scene["id"],
            "embedding": embedding_vector.tolist(),  # convert numpy → Python list
        })

        # Build metadata entry (exclude "features" nesting — kept inline)
        meta_entry = {k: v for k, v in scene.items()}
        meta_entry["thumbnail_url"] = thumbnail_url

        metadata_list.append(meta_entry)

    # ── Write JSON files ──────────────────────────────────────────────────────
    with open(EMBEDDINGS_PATH, "w", encoding="utf-8") as f:
        json.dump(embeddings_list, f, indent=2)
    print(f"[AKSHA] Wrote {len(embeddings_list)} embeddings to {EMBEDDINGS_PATH}")

    with open(METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata_list, f, indent=2)
    print(f"[AKSHA] Wrote {len(metadata_list)} metadata entries to {METADATA_PATH}")


def ensure_database_exists() -> None:
    """
    Check if both database files exist. If not, generate them.
    Called by main.py at startup.
    """
    if os.path.exists(EMBEDDINGS_PATH) and os.path.exists(METADATA_PATH):
        return
    print("[AKSHA] Archive database not found -- generating from seed data...")
    generate_archive()
    print("[AKSHA] Archive database ready.")


if __name__ == "__main__":
    generate_archive()
