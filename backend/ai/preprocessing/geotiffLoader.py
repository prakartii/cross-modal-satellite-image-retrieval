"""
AKSHA Earth Intelligence Platform — GeoTIFF Loader
====================================================

PURPOSE:
  Specialized loader for GeoTIFF satellite imagery. GeoTIFF extends the
  TIFF format with geospatial metadata (coordinate reference system,
  bounding box, pixel resolution in ground units).

WHY IT EXISTS:
  Standard Pillow cannot read GeoTIFF geospatial metadata — it only reads
  pixels. This module extracts the geographic coordinates embedded in
  GeoTIFF tags, which are essential for spatial search and visualization.

AI CONCEPT DEMONSTRATED:
  Geospatial data ingestion. In production Earth observation systems, all
  imagery is georeferenced — every pixel maps to a real-world coordinate.
  This georeferencing enables spatial queries, overlap computation, and
  accurate visualization on the Earth globe.

PRODUCTION REPLACEMENT:
  Replace with rasterio (Python binding for GDAL) which provides full
  coordinate reference system (CRS) support, reprojection, band selection,
  and efficient tiled reading of large GeoTIFF files.

INPUTS:
  file_bytes: Raw bytes of a GeoTIFF file

OUTPUTS:
  image: PIL Image (converted to RGB)
  geo_metadata: dict with {bbox, crs, pixel_size, band_count, nodata}

PIPELINE POSITION:
  Upload → [GeoTIFF Loader ← IF .tif/.tiff] → Preprocessing → Features
"""

from __future__ import annotations

import io
import struct
from typing import Any

from PIL import Image


class GeoTIFFLoader:
    """
    Loads GeoTIFF files and extracts embedded geospatial metadata.

    GeoTIFF stores geospatial info in TIFF tags:
      Tag 33550 (ModelPixelScaleTag):   pixel size in CRS units
      Tag 33922 (ModelTiepointTag):     anchor point mapping pixel → CRS coords
      Tag 34736 (GeoDoubleParamsTag):   CRS parameters as doubles
      Tag 34737 (GeoAsciiParamsTag):    CRS name as ASCII string

    These tags define a spatial transform that maps pixel coordinates
    to real-world coordinates (latitude/longitude or projected).
    """

    def load(self, file_bytes: bytes) -> tuple[Image.Image, dict[str, Any]]:
        """
        Load a GeoTIFF and extract both the image and geospatial metadata.

        Args:
          file_bytes: Raw bytes of the GeoTIFF file

        Returns:
          Tuple of (PIL Image in RGB mode, geo_metadata dict)
        """
        img = Image.open(io.BytesIO(file_bytes))
        img.load()

        geo_meta = self._extract_geo_tags(img)
        rgb_img = self._to_rgb(img)

        return rgb_img, geo_meta

    def _extract_geo_tags(self, img: Image.Image) -> dict[str, Any]:
        """
        Read GeoTIFF-specific TIFF tags from the image.

        The GeoTIFF standard defines a geospatial transform:
          X_world = X_origin + col × pixel_width
          Y_world = Y_origin - row × pixel_height   (note the negation!)
        where (X_origin, Y_origin) is the coordinate of the top-left pixel.

        Returns dict with bounding box in approximate lat/lng if CRS is
        geographic (WGS84), or in CRS units if projected (e.g., UTM).
        """
        geo: dict[str, Any] = {
            "band_count":  getattr(img, "n_frames", 1),
            "width":       img.size[0],
            "height":      img.size[1],
            "pixel_width":  None,
            "pixel_height": None,
            "origin_x":    None,
            "origin_y":    None,
            "crs":         "Unknown",
            "bbox":        None,
            "has_geo":     False,
        }

        try:
            tag_data = img.tag_v2 if hasattr(img, "tag_v2") else {}

            # ModelPixelScaleTag (33550): [scale_x, scale_y, scale_z]
            pixel_scale = tag_data.get(33550)
            if pixel_scale:
                vals = list(pixel_scale)
                geo["pixel_width"]  = float(vals[0]) if len(vals) > 0 else None
                geo["pixel_height"] = float(vals[1]) if len(vals) > 1 else None

            # ModelTiepointTag (33922): [I, J, K, X, Y, Z]
            # Maps pixel (I,J,K) → world (X,Y,Z)
            tiepoint = tag_data.get(33922)
            if tiepoint:
                vals = list(tiepoint)
                if len(vals) >= 6:
                    geo["origin_x"] = float(vals[3])
                    geo["origin_y"] = float(vals[4])

            # GeoAsciiParamsTag (34737): CRS name string
            geo_ascii = tag_data.get(34737)
            if geo_ascii:
                geo["crs"] = str(geo_ascii).strip().rstrip("|")

            # Compute bounding box if we have origin + pixel scale
            if (
                geo["origin_x"] is not None
                and geo["pixel_width"] is not None
                and geo["pixel_height"] is not None
            ):
                x0 = geo["origin_x"]
                y0 = geo["origin_y"]
                pw = geo["pixel_width"]
                ph = geo["pixel_height"]
                w  = geo["width"]
                h  = geo["height"]

                geo["bbox"] = {
                    "west":  round(x0, 6),
                    "north": round(y0, 6),
                    "east":  round(x0 + pw * w, 6),
                    "south": round(y0 - ph * h, 6),
                }
                geo["center_lat"] = round((geo["bbox"]["north"] + geo["bbox"]["south"]) / 2, 6)
                geo["center_lng"] = round((geo["bbox"]["west"]  + geo["bbox"]["east"])  / 2, 6)
                geo["has_geo"] = True

        except Exception:
            pass

        return geo

    def _to_rgb(self, img: Image.Image) -> Image.Image:
        """
        Convert GeoTIFF to RGB, handling multi-band and high bit-depth cases.

        Multi-band GeoTIFF (e.g., 12-band Sentinel-2) are opened by Pillow
        as a single-band image or with limited band support. In production,
        rasterio would be used to select specific bands (B4=Red, B3=Green,
        B2=Blue for true-color, or B8=NIR, B4=Red, B3=Green for false-color).

        Here we take the first three bands if available, otherwise convert
        grayscale to RGB.
        """
        import numpy as np

        if img.mode == "RGB":
            return img

        if img.mode == "RGBA":
            bg = Image.new("RGB", img.size, (255, 255, 255))
            bg.paste(img, mask=img.split()[3])
            return bg

        if img.mode in ("I", "I;16", "I;16B", "F"):
            arr = np.array(img, dtype=np.float32)
            mn, mx = float(arr.min()), float(arr.max())
            if mx > mn:
                arr = ((arr - mn) / (mx - mn) * 255).astype(np.uint8)
            else:
                arr = np.zeros(arr.shape, dtype=np.uint8)
            gray = Image.fromarray(arr, mode="L")
            return Image.merge("RGB", [gray, gray, gray])

        if img.mode == "L":
            return Image.merge("RGB", [img, img, img])

        return img.convert("RGB")
