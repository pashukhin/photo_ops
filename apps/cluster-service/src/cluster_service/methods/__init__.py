"""Importing this package registers all built-in clustering methods.

The registry (`.base`) is populated as a side effect of importing each concrete
method module. Keep new methods listed here so `cluster_service.methods` is the
one place that wires them in.
"""
from __future__ import annotations

from . import time_only  # noqa: F401  (import for registration side effect)
from .base import ClusteringMethod, MethodDescriptor, all_methods, get, register

__all__ = ["ClusteringMethod", "MethodDescriptor", "all_methods", "get", "register"]
