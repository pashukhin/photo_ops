"""Pluggable clustering methods (SOLID): a small ABC + a process-wide registry.

A method declares a descriptor (id, label, the photo fields it requires, default
params) and implements `cluster()` over already-validated points. The pipeline
owns the generic concerns (partitioning out not-clusterable photos, wrapping the
result under a root, determinism) so methods stay focused on their algorithm.

Adding a method = subclass `ClusteringMethod`, `register()` it. Space-time
(haversine metric + spacelike overlay) is the next method behind this seam.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable, Sequence
from dataclasses import dataclass

from ..errors import UnknownMethodError
from ..model import PhotoPoint, TreeNode


@dataclass(frozen=True)
class MethodDescriptor:
    """What the registry advertises about a method (the ListClusteringMethods surface)."""

    id: str
    display_name: str
    description: str
    required_photo_fields: tuple[str, ...]
    default_params: dict


class ClusteringMethod(ABC):
    """A clustering strategy. Stateless; one instance is registered per id."""

    @property
    @abstractmethod
    def descriptor(self) -> MethodDescriptor:
        """Static metadata for the registry."""

    @abstractmethod
    def cluster(
        self,
        points: Sequence[PhotoPoint],
        params: dict,
        id_factory: Callable[[], str],
    ) -> list[TreeNode]:
        """Cluster already-validated points into top-level tree nodes.

        The pipeline supplies only points that satisfy
        `descriptor.required_photo_fields` (sorted deterministically) and wraps
        the returned nodes under a root plus a `not_clusterable` bucket. Returns
        a list because a method may split the top level (e.g. one node per device
        segment). `id_factory` mints node ids (injected for deterministic tests).
        """


# --- process-wide registry ---------------------------------------------------

_REGISTRY: dict[str, ClusteringMethod] = {}


def register(method: ClusteringMethod) -> None:
    """Register (or replace) a method by its descriptor id."""
    _REGISTRY[method.descriptor.id] = method


def get(method_id: str) -> ClusteringMethod:
    """Look up a method; raise UnknownMethodError if absent."""
    try:
        return _REGISTRY[method_id]
    except KeyError:
        raise UnknownMethodError(method_id) from None


def all_methods() -> list[ClusteringMethod]:
    """All registered methods, ordered by id (stable for ListClusteringMethods)."""
    return [_REGISTRY[k] for k in sorted(_REGISTRY)]
