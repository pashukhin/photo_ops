"""RED: offline reverse-geocoding — resolution + defensive fallbacks (3iy)."""
import media_worker.geocode as geocode
from media_worker.geocode import reverse_geocode


def test_moscow_resolves_to_russia_europe():
    # why: a known major city resolves to stable country/continent + a city name.
    # (55.75N, 37.62E is central Moscow — the smoke fixture's coordinate.)
    place = reverse_geocode(55.75, 37.62)
    assert place is not None
    assert place.country == "Russia"
    assert place.continent == "Europe"
    assert "Moscow" in place.city


def test_none_coords_return_none():
    # why (§3.4): no GPS → no place, processing must continue (never raises).
    assert reverse_geocode(None, None) is None
    assert reverse_geocode(55.75, None) is None


def test_out_of_range_coords_return_none():
    # why: defensive validation, mirroring exif.py's lat/lon range guard.
    assert reverse_geocode(91.0, 0.0) is None
    assert reverse_geocode(0.0, 200.0) is None


def test_lookup_failure_is_swallowed_to_none(monkeypatch):
    # why (§3.4 "geocoder unavailable"): a dataset/lookup error degrades to None,
    # NOT a raise into the handler — coordinates preserved, processing continues.
    def boom(lat, lon):
        raise RuntimeError("dataset missing")
    monkeypatch.setattr(geocode, "_lookup", boom)
    assert reverse_geocode(55.75, 37.62) is None
