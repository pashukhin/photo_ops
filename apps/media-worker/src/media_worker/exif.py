"""EXIF/GPS attribute extraction for the media-worker pipeline.

Public API
----------
extract_attributes(original: bytes) -> Attributes

Defensive rules
---------------
- Missing or malformed EXIF never raises — return what is valid, defaults for
  the rest.
- GPS DMS + ref → signed decimal, range-validated (invalid → None).
- taken_at_utc is always an unambiguous UTC ISO string with explicit +00:00
  designator when present, so that JavaScript `new Date(taken_at_utc)` parses
  it correctly.
"""

import io
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import piexif
from PIL import Image, ImageOps

log = logging.getLogger(__name__)


@dataclass
class Attributes:
    width: int
    height: int
    taken_at_local: str          # ISO local wall-clock, no tz; "" if absent
    taken_at_utc: str            # ISO instant with explicit +00:00; "" if unresolved
    taken_at_tz_source: str      # "exif_offset" | "gps_time" | "unknown"
    camera_make: str
    camera_model: str
    orientation: int             # EXIF value 1-8; 0 = absent
    lat: float | None
    lon: float | None
    metadata_json: str           # sanitized JSON string of full readable EXIF


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _bytes_to_str(value: object) -> str:
    """Decode a bytes field, stripping trailing NULs and whitespace."""
    if not isinstance(value, bytes):
        return ""
    return value.decode("utf-8", errors="ignore").rstrip("\x00").strip()


def _parse_datetime_str(raw: object) -> str:
    """Convert b'YYYY:MM:DD HH:MM:SS' → 'YYYY-MM-DDTHH:MM:SS', or ''."""
    s = _bytes_to_str(raw)
    if not s or len(s) < 19:
        return ""
    try:
        # Format: "2026:01:02 09:30:00"
        date_part, time_part = s[:10], s[11:19]
        date_iso = date_part.replace(":", "-")
        return f"{date_iso}T{time_part}"
    except Exception:
        return ""


def _parse_offset(raw: object) -> timedelta | None:
    """Parse b'+03:00' or b'-05:00' → timedelta (or None on failure)."""
    s = _bytes_to_str(raw)
    if not s or len(s) < 6:
        return None
    try:
        sign = 1 if s[0] == "+" else -1
        hours, minutes = int(s[1:3]), int(s[4:6])
        return timedelta(hours=sign * hours, minutes=sign * minutes)
    except Exception:
        return None


def _rational_to_float(rat: object) -> float | None:
    """Convert a piexif rational (num, den) tuple to float."""
    if not isinstance(rat, (tuple, list)) or len(rat) != 2:
        return None
    num, den = rat
    if den == 0:
        return None
    return num / den


def _dms_to_decimal(dms: object, ref: object) -> float | None:
    """Convert DMS rationals + ref byte string to signed decimal degrees.

    dms: ((deg_num,deg_den), (min_num,min_den), (sec_num,sec_den))
    ref: b"N" | b"S" | b"E" | b"W"
    Returns None on any parse error or out-of-range value.
    """
    try:
        if not isinstance(dms, (tuple, list)) or len(dms) != 3:
            return None
        deg = _rational_to_float(dms[0])
        mn = _rational_to_float(dms[1])
        sec = _rational_to_float(dms[2])
        if deg is None or mn is None or sec is None:
            return None
        decimal = deg + mn / 60.0 + sec / 3600.0
        ref_str = _bytes_to_str(ref).upper()
        if ref_str in ("S", "W"):
            decimal = -decimal
        return decimal
    except Exception:
        return None


def _build_metadata_json(ifd_map: dict) -> str:
    """Build a sanitized, JSON-serializable dict from piexif IFD data.

    Drops:
    - MakerNote (piexif.ExifIFD.MakerNote)
    - UserComment (piexif.ExifIFD.UserComment)
    - thumbnail entry
    - any bytes value longer than 64 chars after decoding

    Converts:
    - bytes → utf-8 str (ignore errors)
    - (num, den) rationals → float
    - nested rational tuples (GPS fields) → list[float]
    """
    _DROP_EXIF_TAGS = {piexif.ExifIFD.MakerNote, piexif.ExifIFD.UserComment}

    def _sanitize_value(v: object) -> object:
        if isinstance(v, bytes):
            decoded = v.decode("utf-8", errors="ignore").rstrip("\x00")
            if len(decoded) > 64:
                return None  # drop long binary blobs
            return decoded
        if isinstance(v, tuple):
            # Check if it's a rational (2-int tuple)
            if len(v) == 2 and isinstance(v[0], int) and isinstance(v[1], int):
                f = _rational_to_float(v)
                return f if f is not None else None
            # Could be a tuple of rationals (e.g., GPS DMS)
            sanitized = [_sanitize_value(item) for item in v]
            return sanitized
        if isinstance(v, list):
            return [_sanitize_value(item) for item in v]
        return v

    result: dict[str, dict] = {}
    for ifd_name, ifd_data in ifd_map.items():
        if ifd_name == "thumbnail" or not isinstance(ifd_data, dict):
            continue
        ifd_out: dict[str, object] = {}
        for tag_id, value in ifd_data.items():
            if ifd_name == "Exif" and tag_id in _DROP_EXIF_TAGS:
                continue
            sanitized = _sanitize_value(value)
            if sanitized is None:
                continue
            ifd_out[str(tag_id)] = sanitized
        if ifd_out:
            result[ifd_name] = ifd_out

    try:
        return json.dumps(result)
    except Exception:
        return "{}"


# ---------------------------------------------------------------------------
# Main public function
# ---------------------------------------------------------------------------

def extract_attributes(original: bytes) -> Attributes:
    """Extract display + searchable attributes from raw image bytes.

    Dimensions are always populated (from Pillow decode).
    All other fields degrade gracefully if EXIF is absent or malformed.
    """
    # --- Dimensions (always, even without EXIF) ---
    try:
        img: Image.Image = Image.open(io.BytesIO(original))
        img = ImageOps.exif_transpose(img) or img
        width, height = img.width, img.height
    except Exception as exc:
        log.warning("Failed to open image for dimensions: %s", exc)
        width, height = 0, 0

    # --- EXIF parse (defensive) ---
    try:
        ifd_map: dict = piexif.load(original)
    except Exception as exc:
        log.warning("piexif.load failed, using empty EXIF: %s", exc)
        ifd_map = {"0th": {}, "Exif": {}, "GPS": {}}

    ifd_0th: dict = ifd_map.get("0th") or {}
    ifd_exif: dict = ifd_map.get("Exif") or {}
    ifd_gps: dict = ifd_map.get("GPS") or {}

    # --- taken_at_local ---
    raw_dto = ifd_exif.get(piexif.ExifIFD.DateTimeOriginal)
    raw_dtd = ifd_exif.get(piexif.ExifIFD.DateTimeDigitized)
    taken_at_local = _parse_datetime_str(raw_dto) or _parse_datetime_str(raw_dtd)

    # --- camera make / model ---
    camera_make = _bytes_to_str(ifd_0th.get(piexif.ImageIFD.Make))
    camera_model = _bytes_to_str(ifd_0th.get(piexif.ImageIFD.Model))

    # --- orientation ---
    orientation_raw = ifd_0th.get(piexif.ImageIFD.Orientation)
    orientation = int(orientation_raw) if isinstance(orientation_raw, int) else 0

    # --- GPS lat / lon ---
    lat: float | None = None
    lon: float | None = None
    try:
        lat_dms = ifd_gps.get(piexif.GPSIFD.GPSLatitude)
        lat_ref = ifd_gps.get(piexif.GPSIFD.GPSLatitudeRef)
        lon_dms = ifd_gps.get(piexif.GPSIFD.GPSLongitude)
        lon_ref = ifd_gps.get(piexif.GPSIFD.GPSLongitudeRef)

        if lat_dms is not None and lat_ref is not None:
            lat_candidate = _dms_to_decimal(lat_dms, lat_ref)
            if lat_candidate is not None and -90.0 <= lat_candidate <= 90.0:
                lat = lat_candidate

        if lon_dms is not None and lon_ref is not None:
            lon_candidate = _dms_to_decimal(lon_dms, lon_ref)
            if lon_candidate is not None and -180.0 <= lon_candidate <= 180.0:
                lon = lon_candidate

        # If either coordinate is invalid, invalidate both
        if lat is None or lon is None:
            lat = None
            lon = None
    except Exception as exc:
        log.warning("GPS parse failed: %s", exc)
        lat = None
        lon = None

    # --- taken_at_utc + taken_at_tz_source ---
    taken_at_utc = ""
    taken_at_tz_source = "unknown"

    if taken_at_local:
        # Strategy 1: OffsetTimeOriginal
        raw_offset = ifd_exif.get(piexif.ExifIFD.OffsetTimeOriginal)
        offset_td = _parse_offset(raw_offset)
        if offset_td is not None:
            try:
                local_dt = datetime.fromisoformat(taken_at_local)
                aware_dt = local_dt.replace(tzinfo=timezone(offset_td))
                utc_dt = aware_dt.astimezone(timezone.utc)
                taken_at_utc = utc_dt.isoformat()
                taken_at_tz_source = "exif_offset"
            except Exception as exc:
                log.warning("OffsetTimeOriginal conversion failed: %s", exc)

    if not taken_at_utc:
        # Strategy 2: GPS timestamp (always UTC per EXIF spec)
        raw_gps_date = ifd_gps.get(piexif.GPSIFD.GPSDateStamp)
        raw_gps_time = ifd_gps.get(piexif.GPSIFD.GPSTimeStamp)
        if raw_gps_date is not None and raw_gps_time is not None:
            try:
                date_str = _bytes_to_str(raw_gps_date).replace(":", "-")
                if isinstance(raw_gps_time, (tuple, list)) and len(raw_gps_time) == 3:
                    h = _rational_to_float(raw_gps_time[0]) or 0
                    m = _rational_to_float(raw_gps_time[1]) or 0
                    s = _rational_to_float(raw_gps_time[2]) or 0
                    gps_dt = datetime(
                        int(date_str[:4]),
                        int(date_str[5:7]),
                        int(date_str[8:10]),
                        int(h),
                        int(m),
                        int(s),
                        tzinfo=timezone.utc,
                    )
                    taken_at_utc = gps_dt.isoformat()
                    taken_at_tz_source = "gps_time"
            except Exception as exc:
                log.warning("GPS timestamp conversion failed: %s", exc)

    # --- metadata_json ---
    try:
        metadata_json = _build_metadata_json(ifd_map)
    except Exception as exc:
        log.warning("metadata_json build failed: %s", exc)
        metadata_json = "{}"

    return Attributes(
        width=width,
        height=height,
        taken_at_local=taken_at_local,
        taken_at_utc=taken_at_utc,
        taken_at_tz_source=taken_at_tz_source,
        camera_make=camera_make,
        camera_model=camera_model,
        orientation=orientation,
        lat=lat,
        lon=lon,
        metadata_json=metadata_json,
    )
