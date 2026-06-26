"""
backend/services/metadata_parser.py

PIPELINE STAGE: 0.5 — Query Metadata Extraction
INPUT:  Uploaded filename (str) + raw file bytes + PIL Image
OUTPUT: Dict of inferred metadata about the query image

PURPOSE:
  Extracts whatever contextual information we can infer about the uploaded
  satellite image from its filename and embedded EXIF/metadata tags.

  This metadata is used by:
    1. The re-ranker (reranker.py) to apply temporal and sensor-type bonuses
    2. The result formatter to display query image details to the user
    3. The API response for display in the frontend's "Query Metadata" panel

  Crucially, this extraction is BEST-EFFORT. Most users will upload images
  without structured filenames or EXIF metadata. In that case, all inferred
  fields return None and the pipeline continues with cosine-only ranking.

SATELLITE FILENAME CONVENTIONS:
  ISRO and ESA archives use structured filenames that encode metadata.
  Examples:
    RISAT-2B_SAR_20240912_Assam.tif
    → satellite=RISAT-2B, sensor=SAR, date=2024-09-12, region=Assam

    S2A_MSIL2A_20230815T052651.tif
    → satellite=Sentinel-2A, sensor=Multispectral, date=2023-08-15

    LC09_L2SP_141041_20231020.tif
    → satellite=Landsat-9, date=2023-10-20

  We extract these fields using string pattern matching, not machine learning.
  If the filename doesn't match any known pattern, all fields return None.

EXIF METADATA:
  Some satellite image formats (especially GeoTIFF) embed metadata in EXIF tags:
    - DateTime (tag 306): acquisition date
    - ImageDescription (tag 270): may contain satellite/scene info
    - GPSLatitude/GPSLongitude: scene center coordinates
  We attempt to read these via PIL's _getexif() method.
  Standard satellite imagery files typically do NOT have EXIF, so EXIF
  extraction is primarily useful for images taken by consumer cameras.
"""

from __future__ import annotations

import re
from typing import Any

from PIL import Image


# ── Satellite name patterns ───────────────────────────────────────────────────
# Maps regex patterns (checked against filename) to canonical satellite names.
# Patterns are checked in order — first match wins.
_SAT_PATTERNS: list[tuple[re.Pattern, str, str]] = [
    # (compiled_regex, satellite_name, sensor_type)
    (re.compile(r'RISAT.?2B?',   re.IGNORECASE), "RISAT-2B",    "SAR"),
    (re.compile(r'RISAT.?1A?',   re.IGNORECASE), "RISAT-1A",    "SAR"),
    (re.compile(r'S2[AB]',       re.IGNORECASE), "Sentinel-2",  "Multispectral"),
    (re.compile(r'S1[AB]',       re.IGNORECASE), "Sentinel-1",  "SAR"),
    (re.compile(r'LC0?9',        re.IGNORECASE), "Landsat-9",   "Optical"),
    (re.compile(r'LC0?8',        re.IGNORECASE), "Landsat-8",   "Optical"),
    (re.compile(r'CART3?',       re.IGNORECASE), "Cartosat-3",  "Optical"),
    (re.compile(r'CART2?',       re.IGNORECASE), "Cartosat-2",  "Optical"),
    (re.compile(r'RESOURCESAT',  re.IGNORECASE), "ResourceSat-2A", "Multispectral"),
    (re.compile(r'LISS',         re.IGNORECASE), "ResourceSat-2A", "Multispectral"),
    (re.compile(r'ALOS.?2',      re.IGNORECASE), "ALOS-2",      "SAR"),
    (re.compile(r'ALOS',         re.IGNORECASE), "ALOS",        "SAR"),
    (re.compile(r'MODIS',        re.IGNORECASE), "Terra/MODIS",  "Optical"),
    (re.compile(r'VIIRS',        re.IGNORECASE), "NOAA-20",     "Optical"),
]

# ── Date patterns ─────────────────────────────────────────────────────────────
# Common date formats in satellite filenames. Tried in order.
_DATE_PATTERNS: list[tuple[re.Pattern, str]] = [
    # YYYYMMDD (most common in satellite archives)
    (re.compile(r'(\d{4})(\d{2})(\d{2})'), "{0}-{1}-{2}"),
    # YYYY-MM-DD (ISO 8601)
    (re.compile(r'(\d{4})-(\d{2})-(\d{2})'), "{0}-{1}-{2}"),
    # YYYY_MM_DD (underscore separator)
    (re.compile(r'(\d{4})_(\d{2})_(\d{2})'), "{0}-{1}-{2}"),
]

# ── Indian region name patterns ───────────────────────────────────────────────
# States and major regions that may appear in filenames
_REGION_KEYWORDS: list[str] = [
    "Assam", "Bihar", "Odisha", "Orissa", "Kerala", "Bengal", "WB",
    "Punjab", "Haryana", "UP", "Uttarakhand", "Himachal", "HP",
    "Rajasthan", "Gujarat", "Maharashtra", "Karnataka", "TamilNadu",
    "TN", "AP", "Telangana", "Chhattisgarh", "CG", "Jharkhand",
    "Sikkim", "Meghalaya", "Manipur", "Nagaland", "Mizoram", "Tripura",
    "Arunachal", "Brahmaputra", "Ganga", "Indus", "Godavari", "Krishna",
    "Cauvery", "Narmada", "Tapti", "Mahanadi", "Damodar", "Kosi",
    "Yamuna", "Chambal", "Betwa", "Son", "Ghaghra",
    "Delhi", "Mumbai", "Chennai", "Kolkata", "Bangalore", "Hyderabad",
    "Dhaka", "Bangladesh", "Lanka", "SriLanka",
]


def _extract_from_filename(filename: str) -> dict[str, str | None]:
    """
    Parse satellite metadata from the filename string.

    SATELLITE/SENSOR DETECTION:
      Iterates through _SAT_PATTERNS in order.
      Returns the first matching satellite name and sensor type.

    DATE DETECTION:
      Tries each date pattern in _DATE_PATTERNS.
      Returns the first valid date found (validates month in [01,12], day in [01,31]).

    REGION DETECTION:
      Checks if any of the known Indian region keywords appear in the filename
      (case-insensitive). Returns the first match found.

    Args:
      filename: Original filename of the uploaded file.

    Returns:
      Dict with possibly-None values:
        inferred_satellite, inferred_sensor_type, inferred_date, inferred_region
    """
    result: dict[str, str | None] = {
        "inferred_satellite":   None,
        "inferred_sensor_type": None,
        "inferred_date":        None,
        "inferred_region":      None,
    }

    # ── Satellite and sensor type ─────────────────────────────────────────────
    for pattern, sat_name, sensor_type in _SAT_PATTERNS:
        if pattern.search(filename):
            result["inferred_satellite"]   = sat_name
            result["inferred_sensor_type"] = sensor_type
            break

    # ── Date ─────────────────────────────────────────────────────────────────
    for pattern, fmt in _DATE_PATTERNS:
        match = pattern.search(filename)
        if match:
            year, month, day = match.group(1), match.group(2), match.group(3)
            # Basic sanity check on extracted date components
            if 1900 <= int(year) <= 2100 and 1 <= int(month) <= 12 and 1 <= int(day) <= 31:
                result["inferred_date"] = fmt.format(year, month, day)
                break

    # ── Region ────────────────────────────────────────────────────────────────
    fname_lower = filename.lower()
    for region in _REGION_KEYWORDS:
        if region.lower() in fname_lower:
            result["inferred_region"] = region
            break

    return result


def _extract_exif(image: Image.Image) -> dict[str, Any]:
    """
    Attempt to read EXIF metadata from a PIL Image.

    EXIF (Exchangeable Image File Format) is a standard for storing metadata
    in JPEG files. Satellite imagery rarely has EXIF, but consumer camera images
    or format-converted scenes might.

    EXIF tag numbers used:
      306  → DateTime (format: "YYYY:MM:DD HH:MM:SS")
      270  → ImageDescription (free text, may contain scene info)
      34853 → GPSInfo (nested dict with GPS coordinates)

    Args:
      image: PIL.Image object.

    Returns:
      Dict with any successfully extracted EXIF fields, or empty dict if none.
    """
    exif_data: dict[str, Any] = {}

    # PIL's _getexif() is only available for JPEG images.
    # For PNG, TIFF, and others, this raises AttributeError or returns None.
    try:
        exif = image._getexif()  # type: ignore[attr-defined]
        if not exif:
            return exif_data

        # Tag 306: DateTime
        if 306 in exif:
            raw_dt = str(exif[306])
            # Convert "YYYY:MM:DD HH:MM:SS" → "YYYY-MM-DD"
            parts = raw_dt.split(" ")[0].split(":")
            if len(parts) == 3:
                exif_data["exif_date"] = f"{parts[0]}-{parts[1]}-{parts[2]}"

        # Tag 270: ImageDescription
        if 270 in exif:
            exif_data["exif_description"] = str(exif[270])[:200]

    except (AttributeError, Exception):
        # EXIF not available or unreadable — this is the expected case for satellite imagery
        pass

    return exif_data


def parse_metadata(
    filename: str,
    file_bytes: bytes,
    image: Image.Image,
) -> dict[str, Any]:
    """
    Extract all available metadata about the query image.

    PRIORITY:
      1. EXIF date (most reliable if present, from the image itself)
      2. Filename date (extracted from structured filename)
      3. None (no date available — triggers neutral temporal scoring)

    Args:
      filename:   Original filename of the uploaded file.
      file_bytes: Raw bytes (used for file_size_bytes).
      image:      PIL Image opened by image_loader.py.

    Returns:
      Dict with:
        filename:             str
        file_size_bytes:      int
        image_width:          int (original, before resize)
        image_height:         int (original, before resize)
        inferred_satellite:   str or None
        inferred_sensor_type: str or None
        inferred_date:        str "YYYY-MM-DD" or None
        inferred_region:      str or None
        exif_date:            str "YYYY-MM-DD" or None
        exif_description:     str or None
    """
    # Parse filename for metadata
    from_filename = _extract_from_filename(filename)

    # Try EXIF extraction
    exif = _extract_exif(image)

    # Prefer EXIF date over filename-inferred date (EXIF comes from the image itself)
    best_date = exif.get("exif_date") or from_filename.get("inferred_date")

    return {
        "filename":             filename,
        "file_size_bytes":      len(file_bytes),
        "image_width":          image.width,
        "image_height":         image.height,
        "inferred_satellite":   from_filename.get("inferred_satellite"),
        "inferred_sensor_type": from_filename.get("inferred_sensor_type"),
        "inferred_date":        best_date,
        "inferred_region":      from_filename.get("inferred_region"),
        "exif_date":            exif.get("exif_date"),
        "exif_description":     exif.get("exif_description"),
    }
