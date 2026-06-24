"""
AKSHA Earth Intelligence Platform — Vector Store
=================================================

PURPOSE:
  An in-memory vector store of pre-computed satellite scene embeddings.
  Serves as the searchable archive against which uploaded images are compared.
  Contains 50 synthetic historical satellite observations from ISRO-relevant
  geographic regions across India and neighboring areas.

WHY IT EXISTS:
  In a production system, this store would contain embeddings for millions
  of satellite scenes, persisted in FAISS, Pinecone, Weaviate, or similar
  vector databases. For this prototype, we maintain a compact 50-scene
  archive entirely in memory, which demonstrates the identical search
  behavior without requiring external infrastructure.

AI CONCEPT DEMONSTRATED:
  Vector database / embedding index. The central data structure in modern
  neural retrieval systems. Every image in the archive is represented as a
  compact embedding vector. At search time, we compare the query embedding
  against all archive embeddings using cosine similarity — this is the
  fundamental operation of semantic search.

  Key insight: two images with similar content (both showing flooded land)
  will have similar embedding vectors even if they are from different
  satellites, different dates, or different regions. This enables
  cross-modal and cross-temporal retrieval.

PRODUCTION REPLACEMENT:
  FAISS IndexFlatIP (exact) or IVF-HNSW (approximate) index with:
    • GPU acceleration for batch similarity computation
    • Disk-backed persistence for archive across restarts
    • Incremental updates as new scenes are ingested
    • Metadata database (PostgreSQL + PostGIS) for filtered search

ARCHIVE DESIGN:
  50 scenes organized into 5 scene categories:
    • flood (10 scenes): Brahmaputra Basin, Kerala, Bangladesh
    • vegetation (10): Western Ghats, Kaziranga, Himalayan forests
    • urban (10): Delhi NCR, Mumbai, Bangalore, Chennai, Kolkata
    • agriculture (10): Punjab, Gujarat, Andhra Pradesh rice, Rajasthan
    • coastal/special (10): Sundarbans, Chilika, Andaman, Lakshadweep

INPUTS: None (self-initializes on first use)
OUTPUTS: list[dict] — archive entries with metadata + embeddings
"""

from __future__ import annotations

import math
import random
from typing import Any

import numpy as np


# ── Synthetic archive scene definitions ──────────────────────────────────────
# Each entry defines a "scene profile" — characteristic feature values.
# Feature vector dimensions correspond exactly to FeatureExtractor output:
#   [0]  contrast      [1]  entropy        [2]  homogeneity   [3]  energy
#   [4]  correlation   [5]  edge_density   [6]  mean_gradient [7]  coarseness
#   [8]  directionality[9]  local_std      [10] h_gradient    [11] v_gradient
#   [12] mean_r        [13] mean_g         [14] mean_b        [15] std_r
#   [16] std_g         [17] std_b          [18] entropy_r     [19] entropy_g
#   [20] vegetation_idx[21] water_idx      [22] brightness    [23] saturation
#   [24] warm_ratio    [25] cool_ratio     [26] quad_tl       [27] quad_tr
#   [28] quad_bl       [29] quad_br        [30] spatial_var   [31] complexity

SCENE_PROFILES: dict[str, np.ndarray] = {
    # ── Flood / inundated surface ───────────────────────────────────────────
    # Characteristics: high water, low vegetation, smooth texture, blue-dominated
    "flood": np.array([
        0.15, 0.55, 0.75, 0.08,  # texture: smooth, medium entropy
        0.85, 0.12, 0.06, 0.80,  # texture: high correlation, low edges
        0.50, 0.12, 0.04, 0.04,  # texture: isotropic, low local std
        0.28, 0.32, 0.52, 0.12,  # spectral: blue dominant (R<G<B)
        0.14, 0.22, 0.55, 0.58,  # spectral: moderate entropy
        0.35, 0.78, 0.37, 0.25,  # derived: low veg, HIGH water, low brightness
        0.35, 0.65, 0.36, 0.36,  # derived: slightly cool, spatial uniform
        0.37, 0.38, 0.37, 0.08,  # spatial: uniform quadrants
        0.09, 0.34,               # spatial variance low, low complexity
    ], dtype=np.float32),

    # ── Dense vegetation / forest ───────────────────────────────────────────
    # Characteristics: high vegetation, medium texture, green-dominated
    "vegetation": np.array([
        0.30, 0.75, 0.55, 0.05,  # texture: moderate contrast, high entropy
        0.62, 0.25, 0.14, 0.55,  # texture: moderate edges
        0.48, 0.30, 0.12, 0.13,  # texture: medium local std
        0.20, 0.40, 0.22, 0.18,  # spectral: green dominant
        0.20, 0.20, 0.70, 0.72,  # spectral: moderate entropy
        0.78, 0.28, 0.27, 0.35,  # derived: HIGH vegetation, low water
        0.30, 0.70, 0.27, 0.28,  # derived: cool (green), slightly warm
        0.28, 0.26, 0.28, 0.27,  # spatial: uniform (forest canopy)
        0.02, 0.50,               # low spatial variance, medium complexity
    ], dtype=np.float32),

    # ── Urban / built-up area ───────────────────────────────────────────────
    # Characteristics: high edge density, mixed spectral, high contrast
    "urban": np.array([
        0.75, 0.80, 0.30, 0.04,  # texture: HIGH contrast, high entropy
        0.42, 0.72, 0.45, 0.28,  # texture: HIGH edge density
        0.50, 0.55, 0.28, 0.28,  # texture: moderate directionality
        0.48, 0.45, 0.42, 0.25,  # spectral: near-gray (R≈G≈B)
        0.25, 0.25, 0.75, 0.78,  # spectral: high entropy (diverse surfaces)
        0.25, 0.22, 0.45, 0.15,  # derived: low veg, low water, moderate brightness
        0.45, 0.55, 0.45, 0.46,  # derived: neutral warm/cool
        0.46, 0.44, 0.45, 0.43,  # spatial: somewhat uniform (dense urban)
        0.03, 0.76,               # low spatial variance, HIGH complexity
    ], dtype=np.float32),

    # ── Agricultural land ───────────────────────────────────────────────────
    # Characteristics: moderate vegetation, periodic texture, warm tones
    "agriculture": np.array([
        0.35, 0.68, 0.52, 0.06,  # texture: moderate
        0.72, 0.32, 0.18, 0.62,  # texture: high correlation (field regularity)
        0.45, 0.28, 0.14, 0.15,  # texture
        0.40, 0.42, 0.30, 0.20,  # spectral: warm-green mix
        0.22, 0.20, 0.68, 0.66,  # spectral
        0.60, 0.22, 0.37, 0.28,  # derived: moderate vegetation, low water
        0.42, 0.58, 0.38, 0.40,  # derived: slightly warm (soil between crops)
        0.37, 0.38, 0.38, 0.36,  # spatial: uniform (flat farmland)
        0.02, 0.50,               # low spatial variance, medium complexity
    ], dtype=np.float32),

    # ── Coastal / mixed water-land ──────────────────────────────────────────
    # Characteristics: mixed water and land, high spatial variance
    "coastal": np.array([
        0.45, 0.72, 0.50, 0.05,  # texture: moderate
        0.55, 0.38, 0.22, 0.50,  # texture
        0.50, 0.35, 0.16, 0.18,  # texture
        0.35, 0.42, 0.48, 0.22,  # spectral: slightly blue
        0.24, 0.28, 0.65, 0.68,  # spectral
        0.42, 0.58, 0.42, 0.32,  # derived: medium veg, medium water
        0.40, 0.60, 0.40, 0.42,  # derived: cool
        0.30, 0.52, 0.48, 0.42,  # spatial: varied (land vs water)
        0.12, 0.55,               # moderate spatial variance, medium complexity
    ], dtype=np.float32),
}

# ── Scene catalog: 50 synthetic archive entries ───────────────────────────
SCENE_CATALOG: list[dict[str, Any]] = [
    # ── Flood scenes (10) ────────────────────────────────────────────────
    {"profile": "flood", "satellite": "RISAT-2B",    "sensor": "SAR",          "res": "3m",
     "location": "Brahmaputra Basin, Assam",         "lat": 26.14, "lng": 92.52,
     "date": "2024-07-15", "cloud": 0,   "mode": "ScanSAR FW",   "orbit": 18924,
     "source": "ISRO Bhuvan", "level": "L1B", "agency": "ISRO",
     "event": "Brahmaputra Flood 2024"},
    {"profile": "flood", "satellite": "Sentinel-1A", "sensor": "SAR",          "res": "10m",
     "location": "Assam Floodplain",               "lat": 26.40, "lng": 92.80,
     "date": "2024-07-12", "cloud": 0,   "mode": "IW GRDH",      "orbit": 54832,
     "source": "Copernicus",  "level": "GRD", "agency": "ESA",
     "event": "Assam Flood 2024"},
    {"profile": "flood", "satellite": "RISAT-2B",    "sensor": "SAR",          "res": "3m",
     "location": "Brahmaputra Basin",               "lat": 26.20, "lng": 91.90,
     "date": "2023-06-22", "cloud": 0,   "mode": "LRFS",         "orbit": 15421,
     "source": "ISRO Bhuvan", "level": "L1B", "agency": "ISRO",
     "event": "Assam Flood Jun 2023"},
    {"profile": "flood", "satellite": "ALOS-2",      "sensor": "SAR",          "res": "10m",
     "location": "Surma Valley, Sylhet",            "lat": 24.89, "lng": 91.87,
     "date": "2022-06-20", "cloud": 0,   "mode": "SM1",          "orbit": 42811,
     "source": "JAXA EORC",  "level": "L1.1", "agency": "JAXA",
     "event": "Bangladesh Haor Flood 2022"},
    {"profile": "flood", "satellite": "Sentinel-1B", "sensor": "SAR",          "res": "10m",
     "location": "Bihar Floodplain",               "lat": 25.96, "lng": 85.12,
     "date": "2022-08-18", "cloud": 0,   "mode": "IW GRDH",      "orbit": 47223,
     "source": "Copernicus",  "level": "GRD", "agency": "ESA",
     "event": "Bihar Flood Aug 2022"},
    {"profile": "flood", "satellite": "ResourceSat-2A","sensor":"Multispectral","res": "24m",
     "location": "Godavari Delta, AP",             "lat": 16.92, "lng": 81.85,
     "date": "2021-11-10", "cloud": 18,  "mode": "LISS-III",     "orbit": 23041,
     "source": "ISRO Bhuvan", "level": "L2", "agency": "ISRO",
     "event": "Cyclone Nivar Flooding 2021"},
    {"profile": "flood", "satellite": "Sentinel-2A", "sensor": "Multispectral","res": "10m",
     "location": "Kerala Kuttanad",                "lat": 9.54,  "lng": 76.33,
     "date": "2020-08-05", "cloud": 22,  "mode": "MSI L2A",      "orbit": 31280,
     "source": "Copernicus",  "level": "L2A", "agency": "ESA",
     "event": "Kerala Flood Aug 2020"},
    {"profile": "flood", "satellite": "RISAT-2B",    "sensor": "SAR",          "res": "3m",
     "location": "Kaziranga NP Periphery",         "lat": 26.57, "lng": 93.17,
     "date": "2020-07-20", "cloud": 0,   "mode": "FRS-1",        "orbit": 9823,
     "source": "ISRO Bhuvan", "level": "L1B", "agency": "ISRO",
     "event": "Kaziranga Flood 2020"},
    {"profile": "flood", "satellite": "Sentinel-1A", "sensor": "SAR",          "res": "10m",
     "location": "Odisha Mahanadi Delta",          "lat": 20.29, "lng": 86.24,
     "date": "2019-09-12", "cloud": 0,   "mode": "IW GRDH",      "orbit": 29145,
     "source": "Copernicus",  "level": "GRD", "agency": "ESA",
     "event": "Odisha Flood Sep 2019"},
    {"profile": "flood", "satellite": "RISAT-2B",    "sensor": "SAR",          "res": "3m",
     "location": "Brahmaputra Basin",               "lat": 27.10, "lng": 93.90,
     "date": "2022-08-14", "cloud": 0,   "mode": "ScanSAR FW",   "orbit": 16782,
     "source": "ISRO Bhuvan", "level": "L1B", "agency": "ISRO",
     "event": "Brahmaputra Mega-Flood Aug 2022"},

    # ── Vegetation scenes (10) ───────────────────────────────────────────
    {"profile": "vegetation", "satellite": "Sentinel-2A","sensor":"Multispectral","res":"10m",
     "location": "Kaziranga NP Core",              "lat": 26.58, "lng": 93.10,
     "date": "2024-02-20", "cloud": 8,   "mode": "MSI L2A",      "orbit": 42112,
     "source": "Copernicus",  "level": "L2A", "agency": "ESA",
     "event": "None"},
    {"profile": "vegetation", "satellite": "ResourceSat-2A","sensor":"Multispectral","res":"24m",
     "location": "Western Ghats, Karnataka",       "lat": 12.97, "lng": 75.69,
     "date": "2024-03-15", "cloud": 12,  "mode": "LISS-III",     "orbit": 28931,
     "source": "ISRO Bhuvan", "level": "L2", "agency": "ISRO",
     "event": "None"},
    {"profile": "vegetation", "satellite": "Cartosat-3",  "sensor": "Optical",  "res": "0.25m",
     "location": "Sundarbans Mangrove Core",       "lat": 21.95, "lng": 88.87,
     "date": "2024-01-08", "cloud": 15,  "mode": "PAN+MX",       "orbit": 11842,
     "source": "ISRO Bhuvan", "level": "L2", "agency": "ISRO",
     "event": "None"},
    {"profile": "vegetation", "satellite": "Sentinel-2B","sensor":"Multispectral","res":"10m",
     "location": "Shillong Plateau Forests",       "lat": 25.60, "lng": 91.90,
     "date": "2023-05-10", "cloud": 28,  "mode": "MSI L2A",      "orbit": 38821,
     "source": "Copernicus",  "level": "L2A", "agency": "ESA",
     "event": "None"},
    {"profile": "vegetation", "satellite": "Landsat-9",  "sensor": "Multispectral","res":"30m",
     "location": "Nilgiris Biosphere Reserve",     "lat": 11.40, "lng": 76.60,
     "date": "2023-11-25", "cloud": 5,   "mode": "OLI TIRS",     "orbit": 15920,
     "source": "USGS EarthExplorer","level":"L2SP","agency":"USGS",
     "event": "None"},
    {"profile": "vegetation", "satellite": "ResourceSat-2A","sensor":"Multispectral","res":"24m",
     "location": "Namdapha NP, Arunachal Pradesh","lat": 27.56, "lng": 96.57,
     "date": "2023-04-05", "cloud": 20,  "mode": "LISS-IV MX",   "orbit": 26440,
     "source": "ISRO Bhuvan", "level": "L2", "agency": "ISRO",
     "event": "None"},
    {"profile": "vegetation", "satellite": "Sentinel-2A","sensor":"Multispectral","res":"10m",
     "location": "Anamalai Tiger Reserve, TN",     "lat": 10.33, "lng": 76.99,
     "date": "2024-04-20", "cloud": 14,  "mode": "MSI L2A",      "orbit": 43820,
     "source": "Copernicus",  "level": "L2A", "agency": "ESA",
     "event": "None"},
    {"profile": "vegetation", "satellite": "ALOS-2",    "sensor": "SAR",         "res": "10m",
     "location": "Ranthambore NP, Rajasthan",      "lat": 26.01, "lng": 76.50,
     "date": "2023-02-18", "cloud": 0,   "mode": "SM2",          "orbit": 41200,
     "source": "JAXA EORC",  "level": "L1.5", "agency": "JAXA",
     "event": "None"},
    {"profile": "vegetation", "satellite": "Cartosat-3", "sensor": "Optical",    "res": "0.25m",
     "location": "Jim Corbett NP, Uttarakhand",    "lat": 29.53, "lng": 78.77,
     "date": "2024-03-01", "cloud": 10,  "mode": "PAN Mono",     "orbit": 12910,
     "source": "ISRO Bhuvan", "level": "L2", "agency": "ISRO",
     "event": "None"},
    {"profile": "vegetation", "satellite": "Landsat-9",  "sensor": "Multispectral","res":"30m",
     "location": "Kanha Tiger Reserve, MP",        "lat": 22.27, "lng": 80.61,
     "date": "2023-10-12", "cloud": 7,   "mode": "OLI TIRS",     "orbit": 14820,
     "source": "USGS EarthExplorer","level":"L2SP","agency":"USGS",
     "event": "None"},

    # ── Urban scenes (10) ─────────────────────────────────────────────────
    {"profile": "urban", "satellite": "Cartosat-3",   "sensor": "Optical",      "res": "0.25m",
     "location": "Delhi NCR, New Delhi",            "lat": 28.62, "lng": 77.22,
     "date": "2024-05-15", "cloud": 5,   "mode": "PAN+MX",       "orbit": 13421,
     "source": "ISRO Bhuvan", "level": "L2", "agency": "ISRO",
     "event": "None"},
    {"profile": "urban", "satellite": "Cartosat-3",   "sensor": "Optical",      "res": "0.25m",
     "location": "Mumbai Metropolitan, Maharashtra","lat": 19.08, "lng": 72.88,
     "date": "2024-04-10", "cloud": 12,  "mode": "PAN+MX",       "orbit": 13250,
     "source": "ISRO Bhuvan", "level": "L2", "agency": "ISRO",
     "event": "None"},
    {"profile": "urban", "satellite": "Sentinel-2A", "sensor": "Multispectral", "res": "10m",
     "location": "Bangalore Urban Sprawl",          "lat": 12.97, "lng": 77.59,
     "date": "2024-06-01", "cloud": 8,   "mode": "MSI L2A",      "orbit": 44100,
     "source": "Copernicus",  "level": "L2A", "agency": "ESA",
     "event": "None"},
    {"profile": "urban", "satellite": "Cartosat-3",   "sensor": "Optical",      "res": "0.25m",
     "location": "Chennai Metropolitan, TN",        "lat": 13.08, "lng": 80.27,
     "date": "2024-03-22", "cloud": 18,  "mode": "PAN Mono",     "orbit": 12980,
     "source": "ISRO Bhuvan", "level": "L2", "agency": "ISRO",
     "event": "None"},
    {"profile": "urban", "satellite": "Sentinel-2B", "sensor": "Multispectral", "res": "10m",
     "location": "Kolkata Metropolitan, WB",        "lat": 22.57, "lng": 88.36,
     "date": "2024-02-14", "cloud": 22,  "mode": "MSI L2A",      "orbit": 39920,
     "source": "Copernicus",  "level": "L2A", "agency": "ESA",
     "event": "None"},
    {"profile": "urban", "satellite": "Cartosat-3",   "sensor": "Optical",      "res": "0.25m",
     "location": "Hyderabad Tech Hub, Telangana",   "lat": 17.44, "lng": 78.38,
     "date": "2024-05-28", "cloud": 9,   "mode": "PAN+MX",       "orbit": 13600,
     "source": "ISRO Bhuvan", "level": "L2", "agency": "ISRO",
     "event": "None"},
    {"profile": "urban", "satellite": "Landsat-9",   "sensor": "Multispectral", "res": "30m",
     "location": "Ahmedabad Urban Expansion",       "lat": 23.02, "lng": 72.57,
     "date": "2023-12-10", "cloud": 6,   "mode": "OLI TIRS",     "orbit": 16220,
     "source": "USGS EarthExplorer","level":"L2SP","agency":"USGS",
     "event": "None"},
    {"profile": "urban", "satellite": "Sentinel-2A", "sensor": "Multispectral", "res": "10m",
     "location": "Pune Metropolitan, Maharashtra",  "lat": 18.52, "lng": 73.86,
     "date": "2024-01-25", "cloud": 11,  "mode": "MSI L2A",      "orbit": 41980,
     "source": "Copernicus",  "level": "L2A", "agency": "ESA",
     "event": "None"},
    {"profile": "urban", "satellite": "Cartosat-3",  "sensor": "Optical",       "res": "0.25m",
     "location": "Jaipur Old City, Rajasthan",      "lat": 26.92, "lng": 75.81,
     "date": "2024-02-08", "cloud": 4,   "mode": "PAN Mono",     "orbit": 12720,
     "source": "ISRO Bhuvan", "level": "L2", "agency": "ISRO",
     "event": "None"},
    {"profile": "urban", "satellite": "Sentinel-2B", "sensor": "Multispectral", "res": "10m",
     "location": "Surat Industrial Zone, Gujarat",  "lat": 21.17, "lng": 72.83,
     "date": "2024-04-05", "cloud": 14,  "mode": "MSI L2A",      "orbit": 40820,
     "source": "Copernicus",  "level": "L2A", "agency": "ESA",
     "event": "None"},

    # ── Agricultural scenes (10) ──────────────────────────────────────────
    {"profile": "agriculture", "satellite": "ResourceSat-2A","sensor":"Multispectral","res":"24m",
     "location": "Punjab Wheat Belt",               "lat": 30.68, "lng": 75.85,
     "date": "2024-03-10", "cloud": 3,   "mode": "LISS-IV MX",   "orbit": 29100,
     "source": "ISRO Bhuvan", "level": "L2", "agency": "ISRO",
     "event": "None"},
    {"profile": "agriculture", "satellite": "Sentinel-2B","sensor":"Multispectral","res":"10m",
     "location": "Godavari Rice Bowl, AP",          "lat": 16.50, "lng": 81.60,
     "date": "2024-01-20", "cloud": 18,  "mode": "MSI L2A",      "orbit": 39210,
     "source": "Copernicus",  "level": "L2A", "agency": "ESA",
     "event": "None"},
    {"profile": "agriculture", "satellite": "Landsat-9",   "sensor":"Multispectral","res":"30m",
     "location": "Gujarat Agri Plains, Gujarat",    "lat": 22.30, "lng": 72.20,
     "date": "2024-02-15", "cloud": 7,   "mode": "OLI TIRS",     "orbit": 15120,
     "source": "USGS EarthExplorer","level":"L2SP","agency":"USGS",
     "event": "None"},
    {"profile": "agriculture", "satellite": "ResourceSat-2A","sensor":"Multispectral","res":"24m",
     "location": "Haryana Crop Rotation Zone",      "lat": 29.45, "lng": 76.30,
     "date": "2024-04-05", "cloud": 9,   "mode": "LISS-III",     "orbit": 29980,
     "source": "ISRO Bhuvan", "level": "L2", "agency": "ISRO",
     "event": "None"},
    {"profile": "agriculture", "satellite": "Sentinel-2A","sensor":"Multispectral","res":"10m",
     "location": "Cauvery Delta, TN",               "lat": 11.12, "lng": 79.55,
     "date": "2023-12-18", "cloud": 20,  "mode": "MSI L2A",      "orbit": 41290,
     "source": "Copernicus",  "level": "L2A", "agency": "ESA",
     "event": "None"},
    {"profile": "agriculture", "satellite": "Landsat-9",   "sensor":"Multispectral","res":"30m",
     "location": "Indus Plains, Pakistan Border",   "lat": 30.80, "lng": 72.50,
     "date": "2023-11-20", "cloud": 4,   "mode": "OLI TIRS",     "orbit": 14820,
     "source": "USGS EarthExplorer","level":"L2SP","agency":"USGS",
     "event": "None"},
    {"profile": "agriculture", "satellite": "ResourceSat-2A","sensor":"Multispectral","res":"24m",
     "location": "Vidarbha Cotton Belt, Maharashtra","lat": 20.70, "lng": 78.50,
     "date": "2024-05-10", "cloud": 15,  "mode": "LISS-IV MX",   "orbit": 31020,
     "source": "ISRO Bhuvan", "level": "L2", "agency": "ISRO",
     "event": "None"},
    {"profile": "agriculture", "satellite": "Sentinel-2B","sensor":"Multispectral","res":"10m",
     "location": "West Bengal Paddy Fields",         "lat": 22.80, "lng": 88.00,
     "date": "2024-06-05", "cloud": 25,  "mode": "MSI L2A",      "orbit": 41120,
     "source": "Copernicus",  "level": "L2A", "agency": "ESA",
     "event": "None"},
    {"profile": "agriculture", "satellite": "ResourceSat-2A","sensor":"Multispectral","res":"24m",
     "location": "Rajasthan Canal Command Area",    "lat": 27.80, "lng": 73.20,
     "date": "2023-10-25", "cloud": 5,   "mode": "LISS-III",     "orbit": 28200,
     "source": "ISRO Bhuvan", "level": "L2", "agency": "ISRO",
     "event": "None"},
    {"profile": "agriculture", "satellite": "Sentinel-2A","sensor":"Multispectral","res":"10m",
     "location": "Jharkhand Tea Plantations",       "lat": 23.35, "lng": 85.33,
     "date": "2024-03-28", "cloud": 18,  "mode": "MSI L2A",      "orbit": 43020,
     "source": "Copernicus",  "level": "L2A", "agency": "ESA",
     "event": "None"},

    # ── Coastal / special scenes (10) ─────────────────────────────────────
    {"profile": "coastal", "satellite": "Cartosat-3",  "sensor": "Optical",     "res": "0.25m",
     "location": "Chilika Lake, Odisha",            "lat": 19.72, "lng": 85.33,
     "date": "2024-01-12", "cloud": 10,  "mode": "PAN+MX",       "orbit": 12480,
     "source": "ISRO Bhuvan", "level": "L2", "agency": "ISRO",
     "event": "None"},
    {"profile": "coastal", "satellite": "Sentinel-2A","sensor":"Multispectral", "res": "10m",
     "location": "Lakshadweep Atolls",              "lat": 10.58, "lng": 72.64,
     "date": "2024-02-28", "cloud": 6,   "mode": "MSI L2A",      "orbit": 42510,
     "source": "Copernicus",  "level": "L2A", "agency": "ESA",
     "event": "None"},
    {"profile": "coastal", "satellite": "ResourceSat-2A","sensor":"Multispectral","res":"24m",
     "location": "Andaman Islands, Bay of Bengal",  "lat": 11.74, "lng": 92.66,
     "date": "2024-03-05", "cloud": 22,  "mode": "LISS-III",     "orbit": 29820,
     "source": "ISRO Bhuvan", "level": "L2", "agency": "ISRO",
     "event": "None"},
    {"profile": "coastal", "satellite": "Sentinel-1A","sensor": "SAR",           "res": "10m",
     "location": "Gulf of Khambhat, Gujarat",       "lat": 22.05, "lng": 72.15,
     "date": "2024-04-18", "cloud": 0,   "mode": "IW GRDH",      "orbit": 53920,
     "source": "Copernicus",  "level": "GRD", "agency": "ESA",
     "event": "None"},
    {"profile": "coastal", "satellite": "Cartosat-3",  "sensor": "Optical",     "res": "0.25m",
     "location": "Kovalam Coast, Kerala",           "lat": 8.38,  "lng": 76.98,
     "date": "2024-01-30", "cloud": 8,   "mode": "PAN Mono",     "orbit": 12620,
     "source": "ISRO Bhuvan", "level": "L2", "agency": "ISRO",
     "event": "None"},
    {"profile": "coastal", "satellite": "Sentinel-2B","sensor":"Multispectral",  "res": "10m",
     "location": "Palk Strait, Tamil Nadu",         "lat": 9.55,  "lng": 79.50,
     "date": "2023-12-22", "cloud": 14,  "mode": "MSI L2A",      "orbit": 39620,
     "source": "Copernicus",  "level": "L2A", "agency": "ESA",
     "event": "None"},
    {"profile": "coastal", "satellite": "RISAT-2B",   "sensor": "SAR",          "res": "3m",
     "location": "Mannar Gulf, Tamil Nadu",         "lat": 8.80,  "lng": 79.10,
     "date": "2023-11-15", "cloud": 0,   "mode": "FRS-1",        "orbit": 17280,
     "source": "ISRO Bhuvan", "level": "L1B", "agency": "ISRO",
     "event": "None"},
    {"profile": "coastal", "satellite": "Landsat-9",  "sensor": "Multispectral","res": "30m",
     "location": "Chilika-Devi Watershed",          "lat": 19.90, "lng": 85.10,
     "date": "2024-02-10", "cloud": 12,  "mode": "OLI TIRS",     "orbit": 15420,
     "source": "USGS EarthExplorer","level":"L2SP","agency":"USGS",
     "event": "None"},
    {"profile": "coastal", "satellite": "Sentinel-1B","sensor": "SAR",          "res": "10m",
     "location": "Sundarbans Delta Channel",        "lat": 21.80, "lng": 88.60,
     "date": "2024-03-10", "cloud": 0,   "mode": "IW GRDH",      "orbit": 48420,
     "source": "Copernicus",  "level": "GRD", "agency": "ESA",
     "event": "None"},
    {"profile": "coastal", "satellite": "Cartosat-3", "sensor": "Optical",      "res": "0.25m",
     "location": "Vembanad Lake, Kerala",           "lat": 9.60,  "lng": 76.34,
     "date": "2024-04-12", "cloud": 9,   "mode": "PAN+MX",       "orbit": 13480,
     "source": "ISRO Bhuvan", "level": "L2", "agency": "ISRO",
     "event": "None"},
]


class VectorStore:
    """
    In-memory vector store with 50 synthetic satellite scene embeddings.

    The store is initialized once at module import time.
    Subsequent search calls use the pre-built embedding matrix for
    efficient batch cosine similarity computation.
    """

    def __init__(self) -> None:
        self._entries: list[dict[str, Any]] = []
        self._embeddings: np.ndarray = np.empty((0, 32), dtype=np.float32)
        self._initialized = False

    def initialize(self) -> None:
        """Build the synthetic archive if not already done."""
        if self._initialized:
            return
        entries = self._build_archive()
        self._entries = entries
        self._embeddings = np.stack(
            [e["embedding"] for e in entries], axis=0
        ).astype(np.float32)
        self._initialized = True

    @property
    def embeddings(self) -> np.ndarray:
        """Archive embedding matrix: shape (N, 32)."""
        if not self._initialized:
            self.initialize()
        return self._embeddings

    @property
    def entries(self) -> list[dict[str, Any]]:
        """All archive entries with metadata."""
        if not self._initialized:
            self.initialize()
        return self._entries

    def get_entry(self, idx: int) -> dict[str, Any]:
        """Return archive entry at given index."""
        return self.entries[idx]

    def _build_archive(self) -> list[dict[str, Any]]:
        """
        Generate all 50 synthetic archive entries with realistic embeddings.

        Each entry starts from a scene profile (characteristic feature values)
        and adds deterministic perturbation based on the scene index.
        The perturbation is seeded so results are reproducible across restarts.
        """
        rng = np.random.default_rng(seed=42)  # Fixed seed → reproducible archive
        archive = []

        for idx, scene in enumerate(SCENE_CATALOG):
            profile_key = scene["profile"]
            profile_vec = SCENE_PROFILES[profile_key].copy()

            # Add small deterministic noise to distinguish similar scenes
            noise_scale = 0.04
            noise = rng.normal(0, noise_scale, size=profile_vec.shape).astype(np.float32)
            noisy_vec = np.clip(profile_vec + noise, 0.0, 1.0)

            # L2-normalize to unit sphere
            norm = float(np.linalg.norm(noisy_vec))
            if norm > 1e-8:
                embedding = (noisy_vec / norm).astype(np.float32)
            else:
                embedding = noisy_vec

            entry: dict[str, Any] = {
                "id":        f"AKSHA_{idx:04d}_{scene['satellite'].replace('-','')[:4]}",
                "rank":      idx + 1,
                "satellite": scene["satellite"],
                "sensor_type": scene["sensor"],
                "resolution":  scene["res"],
                "location": {
                    "name":    scene["location"],
                    "coords":  {"lat": scene["lat"], "lng": scene["lng"]},
                    "region":  scene["location"].split(",")[-1].strip(),
                    "country": "India" if scene["lat"] > 6 and scene["lat"] < 38 and scene["lng"] > 65 and scene["lng"] < 100 else "International",
                },
                "timestamp":       scene["date"],
                "cloud_cover":     scene["cloud"],
                "acquisition_mode":scene["mode"],
                "processing_level":scene["level"],
                "archive_source":  scene["source"],
                "orbit_number":    scene.get("orbit", 0),
                "event_type":      profile_key,
                "event_label":     scene.get("event", "None"),
                "agency":          scene.get("agency", "ESA"),
                "thumbnail_url":   f"https://aksha.isro.gov.in/thumb/{idx:04d}.jpg",
                "scene_id":        f"AKSHA_{idx:04d}_{scene['date'].replace('-','')}",
                "embedding":       embedding,
                "profile":         profile_key,
            }
            archive.append(entry)

        return archive


# Module-level singleton — initialized once at import
vector_store = VectorStore()
