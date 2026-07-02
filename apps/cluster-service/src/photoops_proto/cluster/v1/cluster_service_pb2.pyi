from common.v1 import common_pb2 as _common_pb2
from google.api import annotations_pb2 as _annotations_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class ClusteringStatus(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    CLUSTERING_STATUS_UNSPECIFIED: _ClassVar[ClusteringStatus]
    CLUSTERING_STATUS_PENDING: _ClassVar[ClusteringStatus]
    CLUSTERING_STATUS_READY: _ClassVar[ClusteringStatus]
    CLUSTERING_STATUS_FAILED: _ClassVar[ClusteringStatus]

class ClusterNodeKind(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    CLUSTER_NODE_KIND_UNSPECIFIED: _ClassVar[ClusterNodeKind]
    CLUSTER_NODE_KIND_ROOT: _ClassVar[ClusterNodeKind]
    CLUSTER_NODE_KIND_INTERNAL: _ClassVar[ClusterNodeKind]
    CLUSTER_NODE_KIND_LEAF: _ClassVar[ClusterNodeKind]
    CLUSTER_NODE_KIND_NOT_CLUSTERABLE: _ClassVar[ClusterNodeKind]
    CLUSTER_NODE_KIND_SEGMENT: _ClassVar[ClusterNodeKind]
CLUSTERING_STATUS_UNSPECIFIED: ClusteringStatus
CLUSTERING_STATUS_PENDING: ClusteringStatus
CLUSTERING_STATUS_READY: ClusteringStatus
CLUSTERING_STATUS_FAILED: ClusteringStatus
CLUSTER_NODE_KIND_UNSPECIFIED: ClusterNodeKind
CLUSTER_NODE_KIND_ROOT: ClusterNodeKind
CLUSTER_NODE_KIND_INTERNAL: ClusterNodeKind
CLUSTER_NODE_KIND_LEAF: ClusterNodeKind
CLUSTER_NODE_KIND_NOT_CLUSTERABLE: ClusterNodeKind
CLUSTER_NODE_KIND_SEGMENT: ClusterNodeKind

class ListClusteringMethodsRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class ListClusteringMethodsResponse(_message.Message):
    __slots__ = ("methods",)
    METHODS_FIELD_NUMBER: _ClassVar[int]
    methods: _containers.RepeatedCompositeFieldContainer[ClusteringMethodDescriptor]
    def __init__(self, methods: _Optional[_Iterable[_Union[ClusteringMethodDescriptor, _Mapping]]] = ...) -> None: ...

class ClusteringMethodDescriptor(_message.Message):
    __slots__ = ("id", "display_name", "description", "required_photo_fields", "default_params_json")
    ID_FIELD_NUMBER: _ClassVar[int]
    DISPLAY_NAME_FIELD_NUMBER: _ClassVar[int]
    DESCRIPTION_FIELD_NUMBER: _ClassVar[int]
    REQUIRED_PHOTO_FIELDS_FIELD_NUMBER: _ClassVar[int]
    DEFAULT_PARAMS_JSON_FIELD_NUMBER: _ClassVar[int]
    id: str
    display_name: str
    description: str
    required_photo_fields: _containers.RepeatedScalarFieldContainer[str]
    default_params_json: str
    def __init__(self, id: _Optional[str] = ..., display_name: _Optional[str] = ..., description: _Optional[str] = ..., required_photo_fields: _Optional[_Iterable[str]] = ..., default_params_json: _Optional[str] = ...) -> None: ...

class GenerateClustersRequest(_message.Message):
    __slots__ = ("user_id", "scope", "method", "params_json")
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    SCOPE_FIELD_NUMBER: _ClassVar[int]
    METHOD_FIELD_NUMBER: _ClassVar[int]
    PARAMS_JSON_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    scope: str
    method: str
    params_json: str
    def __init__(self, user_id: _Optional[str] = ..., scope: _Optional[str] = ..., method: _Optional[str] = ..., params_json: _Optional[str] = ...) -> None: ...

class GenerateClustersResponse(_message.Message):
    __slots__ = ("result_id", "status")
    RESULT_ID_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    result_id: str
    status: ClusteringStatus
    def __init__(self, result_id: _Optional[str] = ..., status: _Optional[_Union[ClusteringStatus, str]] = ...) -> None: ...

class GetClusteringResultRequest(_message.Message):
    __slots__ = ("result_id", "user_id")
    RESULT_ID_FIELD_NUMBER: _ClassVar[int]
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    result_id: str
    user_id: str
    def __init__(self, result_id: _Optional[str] = ..., user_id: _Optional[str] = ...) -> None: ...

class ListClusteringResultsRequest(_message.Message):
    __slots__ = ("user_id",)
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    def __init__(self, user_id: _Optional[str] = ...) -> None: ...

class ListClusteringResultsResponse(_message.Message):
    __slots__ = ("results",)
    RESULTS_FIELD_NUMBER: _ClassVar[int]
    results: _containers.RepeatedCompositeFieldContainer[ClusteringResultSummary]
    def __init__(self, results: _Optional[_Iterable[_Union[ClusteringResultSummary, _Mapping]]] = ...) -> None: ...

class ClusteringResultSummary(_message.Message):
    __slots__ = ("id", "method", "status", "photo_count", "date_from", "date_to", "created_at")
    ID_FIELD_NUMBER: _ClassVar[int]
    METHOD_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    PHOTO_COUNT_FIELD_NUMBER: _ClassVar[int]
    DATE_FROM_FIELD_NUMBER: _ClassVar[int]
    DATE_TO_FIELD_NUMBER: _ClassVar[int]
    CREATED_AT_FIELD_NUMBER: _ClassVar[int]
    id: str
    method: str
    status: ClusteringStatus
    photo_count: int
    date_from: str
    date_to: str
    created_at: str
    def __init__(self, id: _Optional[str] = ..., method: _Optional[str] = ..., status: _Optional[_Union[ClusteringStatus, str]] = ..., photo_count: _Optional[int] = ..., date_from: _Optional[str] = ..., date_to: _Optional[str] = ..., created_at: _Optional[str] = ...) -> None: ...

class ClusteringResult(_message.Message):
    __slots__ = ("id", "user_id", "method", "params_json", "input_fingerprint", "status", "error_message", "created_at", "root")
    ID_FIELD_NUMBER: _ClassVar[int]
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    METHOD_FIELD_NUMBER: _ClassVar[int]
    PARAMS_JSON_FIELD_NUMBER: _ClassVar[int]
    INPUT_FINGERPRINT_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    CREATED_AT_FIELD_NUMBER: _ClassVar[int]
    ROOT_FIELD_NUMBER: _ClassVar[int]
    id: str
    user_id: str
    method: str
    params_json: str
    input_fingerprint: str
    status: ClusteringStatus
    error_message: str
    created_at: str
    root: ClusterNode
    def __init__(self, id: _Optional[str] = ..., user_id: _Optional[str] = ..., method: _Optional[str] = ..., params_json: _Optional[str] = ..., input_fingerprint: _Optional[str] = ..., status: _Optional[_Union[ClusteringStatus, str]] = ..., error_message: _Optional[str] = ..., created_at: _Optional[str] = ..., root: _Optional[_Union[ClusterNode, _Mapping]] = ...) -> None: ...

class ClusterNode(_message.Message):
    __slots__ = ("id", "kind", "merge_distance", "date_from", "date_to", "photo_count", "cover_photo_id", "segment_label", "children", "items")
    ID_FIELD_NUMBER: _ClassVar[int]
    KIND_FIELD_NUMBER: _ClassVar[int]
    MERGE_DISTANCE_FIELD_NUMBER: _ClassVar[int]
    DATE_FROM_FIELD_NUMBER: _ClassVar[int]
    DATE_TO_FIELD_NUMBER: _ClassVar[int]
    PHOTO_COUNT_FIELD_NUMBER: _ClassVar[int]
    COVER_PHOTO_ID_FIELD_NUMBER: _ClassVar[int]
    SEGMENT_LABEL_FIELD_NUMBER: _ClassVar[int]
    CHILDREN_FIELD_NUMBER: _ClassVar[int]
    ITEMS_FIELD_NUMBER: _ClassVar[int]
    id: str
    kind: ClusterNodeKind
    merge_distance: float
    date_from: str
    date_to: str
    photo_count: int
    cover_photo_id: str
    segment_label: str
    children: _containers.RepeatedCompositeFieldContainer[ClusterNode]
    items: _containers.RepeatedCompositeFieldContainer[ClusterItem]
    def __init__(self, id: _Optional[str] = ..., kind: _Optional[_Union[ClusterNodeKind, str]] = ..., merge_distance: _Optional[float] = ..., date_from: _Optional[str] = ..., date_to: _Optional[str] = ..., photo_count: _Optional[int] = ..., cover_photo_id: _Optional[str] = ..., segment_label: _Optional[str] = ..., children: _Optional[_Iterable[_Union[ClusterNode, _Mapping]]] = ..., items: _Optional[_Iterable[_Union[ClusterItem, _Mapping]]] = ...) -> None: ...

class ClusterItem(_message.Message):
    __slots__ = ("photo_id",)
    PHOTO_ID_FIELD_NUMBER: _ClassVar[int]
    photo_id: str
    def __init__(self, photo_id: _Optional[str] = ...) -> None: ...
