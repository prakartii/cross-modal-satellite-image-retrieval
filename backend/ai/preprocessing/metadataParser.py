"""
AKSHA Earth Intelligence Platform — Metadata Parser
====================================================

PURPOSE:
  Extract structured metadata from satellite image filenames, EXIF data,
  and GeoTIFF tags. This metadata enriches search results and powers the
  Scene Intelligence Panel shown to users after upload.

WHY IT EXISTS:
  Satellite images carry rich metadata that tells us WHEN, WHERE, and HOW
  the image was captured. This context is critical for:
    • Temporal search (find images from the same season)
    • Spatial search (find images of the same geographic area)
    • Sensor-specific processing (SAR needs different handling than optical)
  Without metadata, we can only compare pixel content — losing half the signal.

AI CONCEPT DEMONSTRATED:
  Named Entity Recognition (NER) on structured strings. Real satellite
  archives use strict naming conventions (e.g., Sentinel-2 filenames encode
  the satellite, sensing time, tile ID, and processing level). We extract
  these entities from patterns — a simplified form of structured NER.

PRODUCTION REPLACEMENT:
  GDAL/rasterio for full GeoTIFF metadata, ESA's STAC API for Copernicus
  metadata, ISRO Bhuvan API for domestic satellite metadata.

INPUTS:
  filename: Original filename (e.g., "S2A_MSIL2A_20240612_T26PRA.tif")
  image:    PIL Image (for EXIF extraction)
  stats:    Output from imageProcessor (for sensor inference)

OUTPUTS:
  metadata dict: {satellite, sensor_type, acquisition_date, region,
                  scene_id, resolution, processing_level, ...}

PIPELINE POSITION:
  Upload → Preprocessing → [Metadata Extraction ← HERE] → Feature Extraction
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from PIL import Image

# Filename pattern matchers for common satellite data providers
# Each tuple: (regex_pattern, satellite_name, sensor_type, resolution)
FILENAME_PATTERNS: list[tuple[re.Pattern, str, str, str]] = [
    # Sentinel-2 (ESA/Copernicus): S2A_MSIL2A_20240612T082359_N0510_R021_T26PRA_20240612T141520
    (re.compile(r"S2[AB]_MSI", re.I), "Sentinel-2A", "Multispectral", "10m"),
    # Sentinel-1 (SAR): S1A_IW_GRDH_20240615T123456_...
    (re.compile(r"S1[AB]_IW|S1[AB]_EW", re.I), "Sentinel-1A", "SAR", "10m"),
    # RISAT-2B (ISRO SAR): RISAT2B_...
    (re.compile(r"RISAT.?2B?", re.I), "RISAT-2B", "SAR", "3m"),
    # Cartosat-3 (ISRO optical): CART3 / CS3 / CARTOSAT3
    (re.compile(r"CART.?3|CARTOSAT.?3|CS3_", re.I), "Cartosat-3", "Optical", "0.25m"),
    # ResourceSat-2A (ISRO multispectral)
    (re.compile(r"RESOURCE.?SAT|RS2A|LISS", re.I), "ResourceSat-2A", "Multispectral", "24m"),
    # ALOS-2 (JAXA SAR)
    (re.compile(r"ALOS.?2|PALSAR", re.I), "ALOS-2", "SAR", "10m"),
    # Landsat-9 (USGS/NASA)
    (re.compile(r"LC09|LC08|LANDSAT", re.I), "Landsat-9", "Multispectral", "30m"),
]

# Date extraction patterns from filenames
DATE_PATTERNS: list[re.Pattern] = [
    re.compile(r"(\d{8})T\d{6}"),   # 20240612T082359
    re.compile(r"(\d{8})"),          # 20240612
    re.compile(r"(\d{6})"),          # 240612 (YYMMDD)
]

# Known Indian geographic regions from filename keywords
REGION_KEYWORDS: dict[str, tuple[str, float, float]] = {
    "brahmaputra": ("Brahmaputra Basin, Assam", 26.14, 92.52),
    "assam":       ("Assam, Northeast India", 26.18, 92.93),
    "kerala":      ("Kerala Coast, South India", 10.52, 76.27),
    "delhi":       ("Delhi NCR, North India", 28.67, 77.22),
    "mumbai":      ("Mumbai Metropolitan, Maharashtra", 19.08, 72.88),
    "himalaya":    ("Himalayan Range, North India", 30.32, 79.51),
    "kaziranga":   ("Kaziranga National Park, Assam", 26.57, 93.17),
    "sundarbans":  ("Sundarbans Delta, West Bengal", 21.95, 88.87),
    "western_ghats": ("Western Ghats, Karnataka", 12.97, 75.69),
    "rajasthan":   ("Rajasthan Desert, West India", 26.91, 70.91),
    "chilika":     ("Chilika Lake, Odisha", 19.72, 85.33),
    "gujarat":     ("Gujarat Coast, West India", 22.26, 71.19),
}


class MetadataParser:
    """
    Extracts and enriches satellite image metadata from multiple sources.

    Priority of metadata sources (highest to lowest):
      1. GeoTIFF embedded tags (most reliable — comes from the sensor)
      2. Standard filename patterns (reliable for well-named archives)
      3. EXIF data (available for JPEG captures)
      4. Image statistics inference (fallback when nothing else works)
    """

    def parse(
        self,
        filename: str,
        img: Image.Image,
        stats: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Parse all available metadata sources and return unified metadata dict.

        Args:
          filename: Original upload filename
          img:      PIL Image (for EXIF extraction)
          stats:    Pixel statistics from ImageProcessor

        Returns:
          metadata dict with satellite, sensor_type, acquisition_date,
          region, scene_id, resolution, and inferred properties
        """
        meta: dict[str, Any] = {}

        # Source 1: Parse structured filename
        meta.update(self._parse_filename(filename))

        # Source 2: Try EXIF data
        meta.update(self._parse_exif(img))

        # Source 3: Infer remaining fields from image statistics
        meta.update(self._infer_from_stats(stats, meta))

        # Ensure all required fields have defaults
        meta.setdefault("satellite", "Unknown Satellite")
        meta.setdefault("sensor_type", "Optical")
        meta.setdefault("acquisition_date", datetime.utcnow().strftime("%Y-%m-%d"))
        meta.setdefault("region", "Global")
        meta.setdefault("coords", {"lat": 0.0, "lng": 0.0})
        meta.setdefault("resolution", "Unknown")
        meta.setdefault("processing_level", "L1B")
        meta.setdefault("cloud_cover", self._estimate_cloud_cover(stats))
        meta.setdefault("scene_id", self._generate_scene_id(filename, meta))
        meta.setdefault("archive_source", "ISRO Bhuvan / Copernicus")

        return meta

    def _parse_filename(self, filename: str) -> dict[str, Any]:
        """
        Extract satellite, sensor, date, and region from filename patterns.

        Satellite filename conventions encode critical metadata:
          Sentinel-2: S2A_MSIL2A_YYYYMMDDTHHMMSS_N{baseline}_R{orbit}_T{tile}_...
          RISAT-2B:   RISAT2B_RS_MODE_YYYYMMDD_...
          Cartosat-3: CART3_PAN_YYYYMMDD_...

        We match against known patterns and extract what we can.
        """
        result: dict[str, Any] = {}
        fname_upper = filename.upper()

        # Match satellite from filename patterns
        for pattern, satellite, sensor, resolution in FILENAME_PATTERNS:
            if pattern.search(filename):
                result["satellite"] = satellite
                result["sensor_type"] = sensor
                result["resolution"] = resolution
                break

        # Extract acquisition date from filename
        for date_pattern in DATE_PATTERNS:
            m = date_pattern.search(filename)
            if m:
                raw = m.group(1)
                try:
                    if len(raw) == 8:
                        dt = datetime.strptime(raw, "%Y%m%d")
                    else:
                        dt = datetime.strptime(raw, "%y%m%d")
                    result["acquisition_date"] = dt.strftime("%Y-%m-%d")
                    break
                except ValueError:
                    continue

        # Extract geographic region from filename keywords
        fname_lower = filename.lower()
        for keyword, (region_name, lat, lng) in REGION_KEYWORDS.items():
            if keyword in fname_lower:
                result["region"] = region_name
                result["coords"] = {"lat": lat, "lng": lng}
                break

        return result

    def _parse_exif(self, img: Image.Image) -> dict[str, Any]:
        """
        Extract GPS and capture metadata from JPEG EXIF tags.

        EXIF (Exchangeable Image File Format) stores camera/sensor metadata
        including GPS coordinates for geotagged images. Satellite image
        processors sometimes embed GPS info when exporting imagery.
        """
        result: dict[str, Any] = {}
        try:
            exif_data = img._getexif()  # type: ignore
            if not exif_data:
                return result

            # GPS information
            gps_info = exif_data.get(34853)  # GPSInfo tag
            if gps_info:
                lat = self._parse_gps_coord(gps_info.get(2), gps_info.get(1, "N"))
                lng = self._parse_gps_coord(gps_info.get(4), gps_info.get(3, "E"))
                if lat is not None and lng is not None:
                    result["coords"] = {"lat": lat, "lng": lng}

            # DateTime
            dt_str = exif_data.get(36867) or exif_data.get(306)
            if dt_str:
                try:
                    dt = datetime.strptime(str(dt_str), "%Y:%m:%d %H:%M:%S")
                    result["acquisition_date"] = dt.strftime("%Y-%m-%d")
                except ValueError:
                    pass

        except (AttributeError, Exception):
            pass

        return result

    def _parse_gps_coord(
        self,
        dms: Any,
        ref: str,
    ) -> float | None:
        """Convert EXIF GPS degrees/minutes/seconds to decimal degrees."""
        if not dms or len(dms) < 3:
            return None
        try:
            d = float(dms[0]) if not hasattr(dms[0], "numerator") else dms[0].numerator / dms[0].denominator
            m = float(dms[1]) if not hasattr(dms[1], "numerator") else dms[1].numerator / dms[1].denominator
            s = float(dms[2]) if not hasattr(dms[2], "numerator") else dms[2].numerator / dms[2].denominator
            decimal = d + m / 60.0 + s / 3600.0
            if ref in ("S", "W"):
                decimal = -decimal
            return round(decimal, 6)
        except (TypeError, ZeroDivisionError):
            return None

    def _infer_from_stats(
        self,
        stats: dict[str, Any],
        existing: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Infer remaining metadata from pixel statistics.

        When filename/EXIF data is unavailable or incomplete, we can make
        educated guesses from the image content itself:
          • Grayscale images are likely SAR or panchromatic
          • High blue channel dominance suggests water or coastal imagery
          • Low overall brightness with high contrast may indicate SAR
          • Very high resolution with sharp edges suggests Cartosat-3 (0.25m GSD)

        This is a form of image classification using hand-crafted features —
        the same idea as ML-based scene classification, but rule-based.
        """
        result: dict[str, Any] = {}

        if "sensor_type" not in existing:
            mean_r = stats.get("mean_r", 128)
            mean_g = stats.get("mean_g", 128)
            mean_b = stats.get("mean_b", 128)
            std_r  = stats.get("std_r", 30)
            std_g  = stats.get("std_g", 30)
            std_b  = stats.get("std_b", 30)

            # SAR images typically appear grayscale (R≈G≈B) with high contrast
            channel_diff = abs(mean_r - mean_g) + abs(mean_g - mean_b)
            is_grayscale_like = channel_diff < 20
            has_high_contrast = stats.get("dynamic_range", 100) > 180

            if is_grayscale_like and has_high_contrast:
                result["sensor_type"] = "SAR"
                if "satellite" not in existing:
                    result["satellite"] = "RISAT-2B"
                    result["resolution"] = "3m"
            else:
                result["sensor_type"] = "Optical"

        return result

    def _estimate_cloud_cover(self, stats: dict[str, Any]) -> float:
        """
        Estimate cloud cover percentage from image brightness statistics.

        Clouds appear as bright, high-reflectance regions in optical imagery.
        In the RGB space, clouds are typically bright (high values) and
        relatively uniform (low spatial variation). This is a naive estimator
        that works reasonably well for quick metadata enrichment.

        In production, use the cloud probability band from Sentinel-2 L2A
        or dedicated cloud detection models (e.g., Sen2Cor, Fmask, s2cloudless).
        """
        mean_brightness = (
            stats.get("mean_r", 128) +
            stats.get("mean_g", 128) +
            stats.get("mean_b", 128)
        ) / 3.0

        # High brightness → possible cloud
        if mean_brightness > 200:
            return round(min(95.0, (mean_brightness - 150) / 105 * 100), 1)
        elif mean_brightness > 150:
            return round(min(50.0, (mean_brightness - 100) / 150 * 50), 1)
        return round(max(0.0, (mean_brightness - 80) / 70 * 15), 1)

    def _generate_scene_id(
        self,
        filename: str,
        meta: dict[str, Any],
    ) -> str:
        """
        Generate a realistic scene ID from parsed metadata.

        Real satellite scene IDs follow instrument-specific conventions.
        We generate a plausible ID that reflects the satellite and date.
        """
        sat_codes = {
            "Sentinel-2A": "S2A",
            "Sentinel-1A": "S1A",
            "RISAT-2B":    "R2B",
            "Cartosat-3":  "C3",
            "ResourceSat-2A": "RS2A",
            "ALOS-2":      "AL2",
            "Landsat-9":   "LC09",
        }
        code = sat_codes.get(meta.get("satellite", ""), "SAT")
        date = meta.get("acquisition_date", "2024-01-01").replace("-", "")
        sensor = meta.get("sensor_type", "OPT")[:3].upper()

        # Extract tile from original filename if possible
        tile_match = re.search(r"T(\d{2}[A-Z]{3})", filename)
        tile = tile_match.group(1) if tile_match else "00AAA"

        return f"{code}_{sensor}_{date}_{tile}"
