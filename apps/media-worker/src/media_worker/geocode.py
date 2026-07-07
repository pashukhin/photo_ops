"""Offline reverse-geocoding (022): coords → named place, city granularity.

Defensive like exif.py — never raises into the pipeline; any failure → None so
processing keeps the coordinates and continues (project_description §3.4).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass
class GeoPlace:
    continent: str
    country: str
    region: str
    city: str
    district: str          # '' this session (manual 9q4.3 fills)
    raw_provider_data: str  # JSON of the matched GeoNames record


def _lookup(lat: float, lon: float) -> GeoPlace:
    """Nearest-city lookup over the vendored GeoNames extract."""
    raise NotImplementedError  # GREEN is the implementer's job


def reverse_geocode(lat: float | None, lon: float | None) -> GeoPlace | None:
    """Coords → GeoPlace, or None when absent/invalid/unresolvable. Never raises."""
    raise NotImplementedError  # GREEN is the implementer's job
