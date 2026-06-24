"""
backend/ai/image_processing/metadata.py

PURPOSE:
  Stage 1 of the AKSHA AI pipeline.
  Extracts structured metadata from the uploaded satellite image:
    - Satellite name and sensor type
    - Acquisition date and time
    - Geographic coordinates (from EXIF GPS or filename)
    - Image dimensions, bands, resolution
    - Estimated cloud cover (from pixel statistics)
    - Scene ID (standardized identifier)

ALGORITHM:
  Three-pass extraction (cheapest first, most expensive last):
    Pass 1: Filename pattern matching with regex
            Most ISRO/ESA filenames encode satellite, date, tile in the name.
    Pass 2: EXIF header parsing (JPEG/TIFF only)
            GPS DMS (degrees/minutes/seconds) → decimal degrees.
    Pass 3: Pixel statistics inference
            Bright + uniform → likely SAR or cloud-covered optical
            High blue channel → possible water/flood scene
            High green channel → vegetation-dominant scene

INPUT:
  filename: str         — original upload filename
  img: PIL.Image        — loaded and mode-converted image
  stats: dict           — pixel statistics from preprocessing stage

OUTPUT:
  dict with keys: satellite, sensor_type, acquisition_date, region,
                  coordinates, resolution_m, cloud_cover_pct, scene_id,
                  bands, file_size_bytes, width, height

EDUCATIONAL NOTE (What is EXIF?):
  EXIF (Exchangeable Image File Format) is metadata embedded in image files.
  Consumer cameras embed GPS, focal length, exposure time, etc.
  Professional satellite sensors embed mission-specific metadata.
  We parse GPS coordinates using the DMS-to-decimal conversion:
    decimal = degrees + minutes/60 + seconds/3600
  For south latitude or west longitude, we negate the result.

COMPLEXITY: O(L) where L = length of filename; O(P) for pixel stats (P = pixels).
"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timedelta
from typing import Any

from PIL import Image


# ── Satellite / sensor name patterns ─────────────────────────────────────────
# These patterns match standard naming conventions used by ESA, ISRO, USGS.
# Regex captures groups: (satellite, sensor, date, tile/orbit)

FILENAME_PATTERNS: list[tuple[str, str, str, re.Pattern]] = [
    # ESA Sentinel-2: S2A_MSIL2A_20240715T052651_N0510_R005_T44QMF_20240715T092012
    ("Sentinel-2A", "Optical", "Multispectral", re.compile(
        r"S2A.*?(\d{8})", re.IGNORECASE)),
    ("Sentinel-2B", "Optical", "Multispectral", re.compile(
        r"S2B.*?(\d{8})", re.IGNORECASE)),
    # ESA Sentinel-1: S1A_IW_SLC__1SDV_20240715T003215
    ("Sentinel-1A", "SAR", "SAR-C", re.compile(
        r"S1A.*?(\d{8})", re.IGNORECASE)),
    ("Sentinel-1B", "SAR", "SAR-C", re.compile(
        r"S1B.*?(\d{8})", re.IGNORECASE)),
    # ISRO RISAT-2B: R2B_SAR_20240715_00123
    ("RISAT-2B", "SAR", "SAR-X", re.compile(
        r"R2B.*?(\d{8})", re.IGNORECASE)),
    # ISRO Cartosat-3: CS3_PAN_20240715_04521
    ("Cartosat-3", "Optical", "Panchromatic", re.compile(
        r"CS3.*?(\d{8})", re.IGNORECASE)),
    # ISRO ResourceSat-2A: RS2A_LISS.*?(\d{8})
    ("ResourceSat-2A", "Optical", "Multispectral", re.compile(
        r"RS2A.*?(\d{8})", re.IGNORECASE)),
    # JAXA ALOS-2: ALOS2.*?(\d{8})
    ("ALOS-2", "SAR", "SAR-L", re.compile(
        r"ALOS2.*?(\d{8})", re.IGNORECASE)),
    # USGS Landsat-9: LC09_L2SP_146044_20240715
    ("Landsat-9", "Optical", "OLI-TIRS", re.compile(
        r"LC09.*?(\d{8})", re.IGNORECASE)),
    # Generic date patterns (fallback)
    (None, None, None, re.compile(r"(\d{8})", re.IGNORECASE)),
]

# ── Region keywords → approximate coordinates ─────────────────────────────────
# Used when filename contains a recognizable Indian geographic name.
REGION_COORDS: dict[str, dict[str, float]] = {
    "brahmaputra": {"lat": 26.14, "lng": 91.73, "name": "Brahmaputra Basin, Assam"},
    "assam":       {"lat": 26.20, "lng": 91.70, "name": "Assam, India"},
    "bihar":       {"lat": 25.09, "lng": 85.31, "name": "Bihar, India"},
    "kerala":      {"lat": 10.85, "lng": 76.27, "name": "Kerala, India"},
    "odisha":      {"lat": 20.95, "lng": 84.24, "name": "Odisha, India"},
    "bengal":      {"lat": 22.57, "lng": 88.36, "name": "West Bengal, India"},
    "delhi":       {"lat": 28.61, "lng": 77.21, "name": "Delhi, India"},
    "mumbai":      {"lat": 19.08, "lng": 72.88, "name": "Mumbai, India"},
    "chennai":     {"lat": 13.09, "lng": 80.27, "name": "Chennai, India"},
    "hyderabad":   {"lat": 17.39, "lng": 78.49, "name": "Hyderabad, India"},
    "rajasthan":   {"lat": 27.02, "lng": 74.22, "name": "Rajasthan, India"},
    "kashmir":     {"lat": 34.08, "lng": 74.80, "name": "Jammu & Kashmir, India"},
    "uttarakhand": {"lat": 30.06, "lng": 79.01, "name": "Uttarakhand, India"},
    "punjab":      {"lat": 31.15, "lng": 75.34, "name": "Punjab, India"},
    "gujarat":     {"lat": 22.26, "lng": 71.19, "name": "Gujarat, India"},
    "goa":         {"lat": 15.30, "lng": 74.12, "name": "Goa, India"},
    "andaman":     {"lat": 11.66, "lng": 92.74, "name": "Andaman Islands, India"},
}

# ── Default sensor resolution (meters) ───────────────────────────────────────
SENSOR_RESOLUTION: dict[str, int] = {
    "Sentinel-2A":  10,
    "Sentinel-2B":  10,
    "Sentinel-1A":  5,
    "Sentinel-1B":  5,
    "RISAT-2B":     1,
    "Cartosat-3":   0,  # sub-meter, report as <1m
    "ResourceSat-2A": 24,
    "ALOS-2":       3,
    "Landsat-9":    30,
    "Unknown":      10,
}


class MetadataExtractor:
    """
    Extracts structured satellite image metadata using three approaches:
      1. Filename regex matching
      2. EXIF header parsing
      3. Pixel statistics inference

    The results are merged (filename takes priority over inference).
    """

    def extract(
        self,
        filename: str,
        img: Image.Image,
        stats: dict[str, Any],
        file_size_bytes: int = 0,
    ) -> dict[str, Any]:
        """
        Main metadata extraction entry point.

        Args:
            filename: Original upload filename (may contain satellite identifiers)
            img: Loaded PIL image (after mode normalization)
            stats: Pixel statistics dict from preprocessing (mean_r, mean_g, mean_b, etc.)
            file_size_bytes: Size of the uploaded file in bytes

        Returns:
            Metadata dict with standardized keys for downstream pipeline stages.
        """
        # Step 1: Parse filename (cheapest, highest priority for satellite identification)
        meta = self._parse_filename(filename.upper())

        # Step 2: Parse EXIF if present (GPS coordinates are gold if available)
        exif_coords = self._parse_exif_gps(img)
        if exif_coords:
            meta["coordinates"] = exif_coords
            meta["coords_source"] = "exif_gps"

        # Step 3: Infer from pixel statistics (fallback for unknown images)
        inferred = self._infer_from_stats(stats)
        # Only use inference if not already set from filename
        if not meta.get("sensor_type"):
            meta["sensor_type"] = inferred.get("sensor_type", "Optical")
        if not meta.get("scene_hint"):
            meta["scene_hint"] = inferred.get("scene_hint", "unknown")

        # Step 4: Fill in derived fields
        meta["width"]           = img.width
        meta["height"]          = img.height
        meta["bands"]           = self._count_bands(img)
        meta["file_size_bytes"] = file_size_bytes
        meta["file_size_kb"]    = round(file_size_bytes / 1024, 1)
        meta["resolution_m"]    = SENSOR_RESOLUTION.get(meta.get("satellite", ""), 10)
        meta["cloud_cover_pct"] = self._estimate_cloud(stats)
        meta["processing_level"] = "L1B"
        meta["archive_source"]  = "ISRO Bhuvan" if "RISAT" in meta.get("satellite", "") or "Cartosat" in meta.get("satellite", "") else "Copernicus"

        # Step 5: Generate deterministic scene ID from filename hash
        meta["scene_id"] = self._scene_id(filename, meta)

        return meta

    # ─────────────────────────────────────────────────────────────────────────
    # Private helpers
    # ─────────────────────────────────────────────────────────────────────────

    def _parse_filename(self, fname: str) -> dict[str, Any]:
        """
        Try each satellite's filename pattern against the uploaded filename.
        Returns partial metadata dict with satellite, sensor_type, acquisition_date.

        Pattern matching is the fastest and most reliable source when available.
        ISRO and ESA both follow strict naming standards for operational products.
        """
        meta: dict[str, Any] = {}
        fname_lower = fname.lower()

        for satellite, sensor_type, bands, pattern in FILENAME_PATTERNS:
            match = pattern.search(fname)
            if match:
                if satellite:
                    meta["satellite"]    = satellite
                    meta["sensor_type"]  = sensor_type
                    meta["bands"]        = bands
                # Try to parse date from the 8-digit capture group
                date_str = match.group(1)
                try:
                    parsed = datetime.strptime(date_str, "%Y%m%d")
                    meta["acquisition_date"] = parsed.strftime("%Y-%m-%d")
                except ValueError:
                    pass
                break  # First match wins

        # Check filename for known region keywords
        for keyword, info in REGION_COORDS.items():
            if keyword in fname_lower:
                meta["region"] = info["name"]
                meta.setdefault("coordinates", {"lat": info["lat"], "lng": info["lng"]})
                meta["coords_source"] = "filename_keyword"
                break

        # Defaults for unidentified images
        meta.setdefault("satellite",         "Unknown Satellite")
        meta.setdefault("sensor_type",       "Optical")
        meta.setdefault("acquisition_date",  datetime.utcnow().strftime("%Y-%m-%d"))
        meta.setdefault("region",            "India")
        meta.setdefault("coordinates",       {"lat": 20.59, "lng": 78.96})
        meta.setdefault("coords_source",     "default_india_center")

        return meta

    def _parse_exif_gps(self, img: Image.Image) -> dict[str, float] | None:
        """
        Extract GPS coordinates from EXIF metadata.

        GPS in EXIF uses DMS (Degrees, Minutes, Seconds) format:
          GPSLatitude = (26, 7, 12.5)  → 26° 7' 12.5"
          GPSLatitudeRef = 'N'          → North (positive)

        Conversion to decimal degrees:
          decimal = degrees + minutes/60 + seconds/3600
          If LatitudeRef = 'S' or LongitudeRef = 'W', negate the result.

        DMS was historically used by maritime navigation; decimal degrees
        are standard for GIS/remote sensing applications.
        """
        try:
            exif = img.getexif()
            if not exif:
                return None
            gps_info = exif.get(34853)  # GPS IFD tag
            if not gps_info:
                return None

            def dms_to_decimal(dms: tuple, ref: str) -> float:
                d, m, s = [float(v) for v in dms]
                decimal = d + m / 60.0 + s / 3600.0
                if ref in ("S", "W"):
                    decimal = -decimal
                return round(decimal, 6)

            lat = dms_to_decimal(gps_info.get(2, (0, 0, 0)), gps_info.get(1, "N"))
            lng = dms_to_decimal(gps_info.get(4, (0, 0, 0)), gps_info.get(3, "E"))

            if abs(lat) < 0.001 and abs(lng) < 0.001:
                return None  # (0,0) is ocean, almost certainly a parse error
            return {"lat": lat, "lng": lng}
        except Exception:
            return None

    def _infer_from_stats(self, stats: dict[str, Any]) -> dict[str, Any]:
        """
        Infer sensor type and scene hints from pixel statistics.

        Rules derived from remote sensing domain knowledge:
          - SAR images are typically grayscale with high speckle noise
            (std_gray > 0.15) and lower dynamic range in uniform areas
          - Optical images have color information (std across channels varies)
          - High blue channel → water presence
          - High green channel → vegetation presence
          - Very high brightness → cloud cover or snow
        """
        mean_r = stats.get("mean_r", 0.5)
        mean_g = stats.get("mean_g", 0.5)
        mean_b = stats.get("mean_b", 0.5)
        std_r  = stats.get("std_r", 0.1)
        std_g  = stats.get("std_g", 0.1)
        std_b  = stats.get("std_b", 0.1)

        inferred: dict[str, Any] = {}

        # If all channels are very similar → likely grayscale → likely SAR
        channel_variance = abs(mean_r - mean_g) + abs(mean_g - mean_b) + abs(mean_r - mean_b)
        if channel_variance < 0.05:
            inferred["sensor_type"] = "SAR"
        else:
            inferred["sensor_type"] = "Optical"

        # Scene hint from dominant spectral signature
        water_idx = (mean_b - mean_r) / (mean_b + mean_r + 1e-6)
        veg_idx   = (mean_g - mean_r) / (mean_g + mean_r + 1e-6)
        brightness = (mean_r + mean_g + mean_b) / 3.0

        if water_idx > 0.15:
            inferred["scene_hint"] = "water"
        elif veg_idx > 0.08:
            inferred["scene_hint"] = "vegetation"
        elif brightness > 0.70:
            inferred["scene_hint"] = "cloud_or_snow"
        else:
            inferred["scene_hint"] = "urban_or_mixed"

        return inferred

    def _estimate_cloud(self, stats: dict[str, Any]) -> float:
        """
        Estimate cloud cover percentage from pixel brightness statistics.

        Clouds appear as bright, high-reflectance pixels in optical imagery.
        Heuristic: pixels above 0.85 brightness are likely cloud.

        This is a very rough estimate — production systems use:
          1. Sen2Cor (ESA atmospheric correction + cloud mask)
          2. s2cloudless (ML-based cloud detection for Sentinel-2)
          3. Fmask (multi-spectral rule-based, uses SWIR bands)

        We only have RGB here, so we use histogram analysis.
        """
        brightness = stats.get("mean_brightness", 0.5)
        std_brightness = stats.get("std_gray", 0.1)

        # High mean brightness with low std → uniform bright → cloud
        if brightness > 0.80 and std_brightness < 0.10:
            return round(min(90.0, (brightness - 0.80) * 5 * 100), 1)
        elif brightness > 0.70:
            return round(min(60.0, (brightness - 0.65) * 2 * 100), 1)
        else:
            return round(max(0.0, brightness * 20 - 5), 1)

    def _count_bands(self, img: Image.Image) -> int:
        """Return number of image channels (bands)."""
        mode_to_bands = {"L": 1, "LA": 2, "RGB": 3, "RGBA": 4, "I": 1, "F": 1}
        return mode_to_bands.get(img.mode, 3)

    def _scene_id(self, filename: str, meta: dict[str, Any]) -> str:
        """
        Generate a deterministic scene ID from filename + satellite + date.
        Using a hash ensures the same upload always gets the same ID,
        which is important for mission deduplication in production.
        """
        satellite = meta.get("satellite", "UNK")
        date_str  = meta.get("acquisition_date", "").replace("-", "")
        raw       = f"{filename}_{satellite}_{date_str}"
        h         = hashlib.sha256(raw.encode()).hexdigest()[:8].upper()
        return f"{satellite[:4].upper()}_{date_str}_{h}"
