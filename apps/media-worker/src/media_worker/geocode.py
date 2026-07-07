"""Offline reverse-geocoding (022): coords → named place, city granularity.

Defensive like exif.py — never raises into the pipeline; any failure → None so
processing keeps the coordinates and continues (project_description §3.4).

Provider: a vendored GeoNames extract (``data/``, CC-BY 4.0 — see ``data/NOTICE``)
+ a pure-python nearest-neighbour. No scipy/numpy: the wrapper libs
(``reverse_geocode``/``reverse_geocoder``) hard-depend on scipy, an unwanted weight
add to the lean worker image; a brute-force NN over ~34k cities is milliseconds at
one photo per message (ADR-0007).
"""
from __future__ import annotations

import gzip
import json
import math
import os
from dataclasses import dataclass

_DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

# GeoNames continent codes → human-readable names (§3.4 wants "Europe", not "EU").
_CONTINENTS = {
    "AF": "Africa",
    "AS": "Asia",
    "EU": "Europe",
    "NA": "North America",
    "SA": "South America",
    "OC": "Oceania",
    "AN": "Antarctica",
}


@dataclass
class GeoPlace:
    continent: str
    country: str
    region: str
    city: str
    district: str          # '' this session (manual 9q4.3 fills)
    raw_provider_data: str  # JSON of the matched GeoNames record


@dataclass
class _City:
    name: str
    lat: float
    lon: float
    cc: str
    admin1: str


_cache: tuple[list[_City], dict[str, str], dict[str, tuple[str, str]]] | None = None


def _load() -> tuple[list[_City], dict[str, str], dict[str, tuple[str, str]]]:
    """Load the vendored GeoNames extract: cities + admin1 names + country info."""
    cities: list[_City] = []
    with gzip.open(os.path.join(_DATA_DIR, "cities15000.tsv.gz"), "rt", encoding="utf-8") as f:
        for line in f:
            name, lat, lon, cc, admin1 = line.rstrip("\n").split("\t")
            cities.append(_City(name, float(lat), float(lon), cc, admin1))

    admin1_names: dict[str, str] = {}
    with open(os.path.join(_DATA_DIR, "admin1.tsv"), encoding="utf-8") as f:
        for line in f:
            key, name = line.rstrip("\n").split("\t")
            admin1_names[key] = name

    countries: dict[str, tuple[str, str]] = {}
    with open(os.path.join(_DATA_DIR, "countries.tsv"), encoding="utf-8") as f:
        for line in f:
            cc, country_name, continent_code = line.rstrip("\n").split("\t")
            countries[cc] = (country_name, continent_code)

    return cities, admin1_names, countries


def _lookup(lat: float, lon: float) -> GeoPlace:
    """Nearest-city lookup over the vendored GeoNames extract.

    Equirectangular squared distance (cos of the query latitude only) — no
    per-city trig, correct for picking the nearest city at this granularity.
    """
    global _cache
    if _cache is None:
        _cache = _load()
    cities, admin1_names, countries = _cache

    coslat = math.cos(math.radians(lat))
    nearest = min(cities, key=lambda c: (c.lat - lat) ** 2 + ((c.lon - lon) * coslat) ** 2)

    country_name, continent_code = countries.get(nearest.cc, ("", ""))
    region = admin1_names.get(f"{nearest.cc}.{nearest.admin1}", "")
    continent = _CONTINENTS.get(continent_code, "")

    raw = json.dumps(
        {
            "name": nearest.name,
            "lat": nearest.lat,
            "lon": nearest.lon,
            "cc": nearest.cc,
            "admin1": nearest.admin1,
            "country": country_name,
            "region": region,
            "continent": continent,
        }
    )
    return GeoPlace(
        continent=continent,
        country=country_name,
        region=region,
        city=nearest.name,
        district="",
        raw_provider_data=raw,
    )


def reverse_geocode(lat: float | None, lon: float | None) -> GeoPlace | None:
    """Coords → GeoPlace, or None when absent/invalid/unresolvable. Never raises."""
    if lat is None or lon is None:
        return None
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        return None
    try:
        return _lookup(lat, lon)
    except Exception:
        return None
