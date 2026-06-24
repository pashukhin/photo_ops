"""Tests for EXIF/GPS extraction (Task 2.3).

TDD: tests written BEFORE implementation.
"""

import io

import piexif
from PIL import Image

from src.media_worker.exif import extract_attributes


def _with_exif(exif_dict: dict, w: int = 800, h: int = 600) -> bytes:
    """Build a minimal JPEG with the given piexif-format exif_dict."""
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (1, 2, 3)).save(buf, format="JPEG", exif=piexif.dump(exif_dict))
    return buf.getvalue()


def _jpeg_no_exif(w: int = 320, h: int = 240) -> bytes:
    """Build a minimal JPEG with NO EXIF at all."""
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (50, 100, 150)).save(buf, format="JPEG")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Dimensions
# ---------------------------------------------------------------------------


def test_dimensions_always_present_even_without_exif() -> None:
    a = extract_attributes(_with_exif({}))
    assert (a.width, a.height) == (800, 600)
    assert a.taken_at_tz_source == "unknown"
    assert a.taken_at_utc == ""


def test_dimensions_no_exif_at_all() -> None:
    a = extract_attributes(_jpeg_no_exif())
    assert (a.width, a.height) == (320, 240)
    assert a.taken_at_utc == ""
    assert a.taken_at_local == ""
    assert a.lat is None
    assert a.lon is None


# ---------------------------------------------------------------------------
# taken_at + timezone resolution
# ---------------------------------------------------------------------------


def test_taken_at_local_and_offset_to_utc() -> None:
    exif = {
        "Exif": {
            piexif.ExifIFD.DateTimeOriginal: b"2026:01:02 09:30:00",
            piexif.ExifIFD.OffsetTimeOriginal: b"+03:00",
        }
    }
    a = extract_attributes(_with_exif(exif))
    assert a.taken_at_local == "2026-01-02T09:30:00"
    # Must include explicit UTC designator (+00:00), NOT a naked naive string
    assert a.taken_at_utc == "2026-01-02T06:30:00+00:00"
    assert a.taken_at_tz_source == "exif_offset"


def test_taken_at_local_without_offset_is_unknown() -> None:
    exif = {
        "Exif": {
            piexif.ExifIFD.DateTimeOriginal: b"2026:03:15 12:00:00",
        }
    }
    a = extract_attributes(_with_exif(exif))
    assert a.taken_at_local == "2026-03-15T12:00:00"
    assert a.taken_at_utc == ""
    assert a.taken_at_tz_source == "unknown"


def test_taken_at_utc_from_gps_time_when_no_offset() -> None:
    exif = {
        "Exif": {
            piexif.ExifIFD.DateTimeOriginal: b"2026:06:10 15:00:00",
        },
        "GPS": {
            piexif.GPSIFD.GPSDateStamp: b"2026:06:10",
            piexif.GPSIFD.GPSTimeStamp: ((15, 1), (0, 1), (0, 1)),
        },
    }
    a = extract_attributes(_with_exif(exif))
    assert a.taken_at_local == "2026-06-10T15:00:00"
    assert a.taken_at_utc == "2026-06-10T15:00:00+00:00"
    assert a.taken_at_tz_source == "gps_time"


def test_taken_at_fallback_to_digitized() -> None:
    """When DateTimeOriginal absent, fall back to DateTimeDigitized."""
    exif = {
        "Exif": {
            piexif.ExifIFD.DateTimeDigitized: b"2025:12:25 08:00:00",
        }
    }
    a = extract_attributes(_with_exif(exif))
    assert a.taken_at_local == "2025-12-25T08:00:00"


def test_taken_at_offset_negative() -> None:
    """Negative UTC offset resolves correctly."""
    exif = {
        "Exif": {
            piexif.ExifIFD.DateTimeOriginal: b"2026:07:04 10:00:00",
            piexif.ExifIFD.OffsetTimeOriginal: b"-05:00",
        }
    }
    a = extract_attributes(_with_exif(exif))
    assert a.taken_at_utc == "2026-07-04T15:00:00+00:00"
    assert a.taken_at_tz_source == "exif_offset"


# ---------------------------------------------------------------------------
# GPS DMS → decimal
# ---------------------------------------------------------------------------


def test_gps_dms_to_decimal() -> None:
    gps = {
        "GPS": {
            piexif.GPSIFD.GPSLatitudeRef: b"N",
            piexif.GPSIFD.GPSLatitude: ((34, 1), (3, 1), (0, 1)),
            piexif.GPSIFD.GPSLongitudeRef: b"W",
            piexif.GPSIFD.GPSLongitude: ((118, 1), (15, 1), (0, 1)),
        }
    }
    a = extract_attributes(_with_exif(gps))
    assert round(a.lat, 3) == 34.050  # type: ignore[arg-type]
    assert round(a.lon, 3) == -118.250  # type: ignore[arg-type]


def test_gps_south_west_negative() -> None:
    gps = {
        "GPS": {
            piexif.GPSIFD.GPSLatitudeRef: b"S",
            piexif.GPSIFD.GPSLatitude: ((33, 1), (52, 1), (0, 1)),
            piexif.GPSIFD.GPSLongitudeRef: b"E",
            piexif.GPSIFD.GPSLongitude: ((151, 1), (12, 1), (0, 1)),
        }
    }
    a = extract_attributes(_with_exif(gps))
    assert a.lat is not None and a.lat < 0
    assert a.lon is not None and a.lon > 0


def test_gps_out_of_range_returns_none() -> None:
    """GPS values outside valid range should be rejected → None."""
    gps = {
        "GPS": {
            piexif.GPSIFD.GPSLatitudeRef: b"N",
            piexif.GPSIFD.GPSLatitude: ((91, 1), (0, 1), (0, 1)),  # lat > 90
            piexif.GPSIFD.GPSLongitudeRef: b"W",
            piexif.GPSIFD.GPSLongitude: ((118, 1), (15, 1), (0, 1)),
        }
    }
    a = extract_attributes(_with_exif(gps))
    assert a.lat is None
    assert a.lon is None


# ---------------------------------------------------------------------------
# Camera make/model + orientation
# ---------------------------------------------------------------------------


def test_camera_make_model_and_orientation() -> None:
    exif = {
        "0th": {
            piexif.ImageIFD.Make: b"Apple\x00",
            piexif.ImageIFD.Model: b"iPhone 15 Pro\x00",
            piexif.ImageIFD.Orientation: 6,
        }
    }
    a = extract_attributes(_with_exif(exif))
    assert a.camera_make == "Apple"
    assert a.camera_model == "iPhone 15 Pro"
    assert a.orientation == 6


def test_orientation_absent_returns_zero() -> None:
    a = extract_attributes(_with_exif({}))
    assert a.orientation == 0


# ---------------------------------------------------------------------------
# metadata_json
# ---------------------------------------------------------------------------


def test_metadata_json_is_valid_json_string() -> None:
    import json

    exif = {
        "0th": {piexif.ImageIFD.Make: b"Canon"},
        "Exif": {piexif.ExifIFD.DateTimeOriginal: b"2026:01:01 00:00:00"},
    }
    a = extract_attributes(_with_exif(exif))
    parsed = json.loads(a.metadata_json)
    assert isinstance(parsed, dict)


def test_metadata_json_never_raises_on_no_exif() -> None:
    import json

    a = extract_attributes(_jpeg_no_exif())
    # Must be valid JSON even when there is nothing to parse
    parsed = json.loads(a.metadata_json)
    assert isinstance(parsed, dict)


# ---------------------------------------------------------------------------
# Defensive / malformed EXIF
# ---------------------------------------------------------------------------


def test_malformed_exif_does_not_raise() -> None:
    """A JPEG with junk EXIF bytes must not raise; dimensions must be present."""
    # Build a real JPEG then splice in garbage EXIF bytes
    buf = io.BytesIO()
    Image.new("RGB", (160, 120), (10, 20, 30)).save(buf, format="JPEG")
    jpeg_bytes = bytearray(buf.getvalue())

    # Find the APP1/EXIF marker (FF E1) and overwrite with junk
    for i in range(len(jpeg_bytes) - 1):
        if jpeg_bytes[i] == 0xFF and jpeg_bytes[i + 1] == 0xE1:
            # Corrupt the EXIF payload with random bytes
            start = i + 4  # skip marker + 2-byte length
            for j in range(start, min(start + 64, len(jpeg_bytes))):
                jpeg_bytes[j] = (j % 256)
            break

    a = extract_attributes(bytes(jpeg_bytes))
    assert a.width == 160
    assert a.height == 120
    # Corrupted EXIF → all defaults, no raise
    assert a.taken_at_local == ""
    assert a.lat is None


def test_all_defaults_for_empty_exif() -> None:
    """Empty exif dict produces all-default scalar fields."""
    a = extract_attributes(_with_exif({}))
    assert a.camera_make == ""
    assert a.camera_model == ""
    assert a.orientation == 0
    assert a.lat is None
    assert a.lon is None
    assert a.taken_at_local == ""
    assert a.taken_at_utc == ""
    assert a.taken_at_tz_source == "unknown"
