from common.v1 import common_pb2 as _common_pb2
from google.api import annotations_pb2 as _annotations_pb2
from photo.v1 import processing_pb2 as _processing_pb2
from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class PhotoStatus(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    PHOTO_STATUS_UNSPECIFIED: _ClassVar[PhotoStatus]
    PHOTO_STATUS_UPLOADING: _ClassVar[PhotoStatus]
    PHOTO_STATUS_UPLOADED: _ClassVar[PhotoStatus]
    PHOTO_STATUS_PROCESSING: _ClassVar[PhotoStatus]
    PHOTO_STATUS_READY: _ClassVar[PhotoStatus]
    PHOTO_STATUS_FAILED: _ClassVar[PhotoStatus]

class PhotoSortField(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    PHOTO_SORT_FIELD_UNSPECIFIED: _ClassVar[PhotoSortField]
    PHOTO_SORT_FIELD_CREATED_AT: _ClassVar[PhotoSortField]
    PHOTO_SORT_FIELD_TAKEN_AT: _ClassVar[PhotoSortField]
    PHOTO_SORT_FIELD_FILENAME: _ClassVar[PhotoSortField]
    PHOTO_SORT_FIELD_SIZE_BYTES: _ClassVar[PhotoSortField]

class SortDirection(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    SORT_DIRECTION_UNSPECIFIED: _ClassVar[SortDirection]
    SORT_DIRECTION_ASC: _ClassVar[SortDirection]
    SORT_DIRECTION_DESC: _ClassVar[SortDirection]
PHOTO_STATUS_UNSPECIFIED: PhotoStatus
PHOTO_STATUS_UPLOADING: PhotoStatus
PHOTO_STATUS_UPLOADED: PhotoStatus
PHOTO_STATUS_PROCESSING: PhotoStatus
PHOTO_STATUS_READY: PhotoStatus
PHOTO_STATUS_FAILED: PhotoStatus
PHOTO_SORT_FIELD_UNSPECIFIED: PhotoSortField
PHOTO_SORT_FIELD_CREATED_AT: PhotoSortField
PHOTO_SORT_FIELD_TAKEN_AT: PhotoSortField
PHOTO_SORT_FIELD_FILENAME: PhotoSortField
PHOTO_SORT_FIELD_SIZE_BYTES: PhotoSortField
SORT_DIRECTION_UNSPECIFIED: SortDirection
SORT_DIRECTION_ASC: SortDirection
SORT_DIRECTION_DESC: SortDirection

class GetVariantsByIdsRequest(_message.Message):
    __slots__ = ("user_id", "photo_id")
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    PHOTO_ID_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    photo_id: _containers.RepeatedScalarFieldContainer[str]
    def __init__(self, user_id: _Optional[str] = ..., photo_id: _Optional[_Iterable[str]] = ...) -> None: ...

class PhotoVariantsForId(_message.Message):
    __slots__ = ("photo_id", "variants")
    PHOTO_ID_FIELD_NUMBER: _ClassVar[int]
    VARIANTS_FIELD_NUMBER: _ClassVar[int]
    photo_id: str
    variants: _containers.RepeatedCompositeFieldContainer[PhotoVariantView]
    def __init__(self, photo_id: _Optional[str] = ..., variants: _Optional[_Iterable[_Union[PhotoVariantView, _Mapping]]] = ...) -> None: ...

class GetVariantsByIdsResponse(_message.Message):
    __slots__ = ("results",)
    RESULTS_FIELD_NUMBER: _ClassVar[int]
    results: _containers.RepeatedCompositeFieldContainer[PhotoVariantsForId]
    def __init__(self, results: _Optional[_Iterable[_Union[PhotoVariantsForId, _Mapping]]] = ...) -> None: ...

class ListPhotoSpacetimeRequest(_message.Message):
    __slots__ = ("user_id",)
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    user_id: str
    def __init__(self, user_id: _Optional[str] = ...) -> None: ...

class ListPhotoSpacetimeResponse(_message.Message):
    __slots__ = ("photos",)
    PHOTOS_FIELD_NUMBER: _ClassVar[int]
    photos: _containers.RepeatedCompositeFieldContainer[PhotoSpacetime]
    def __init__(self, photos: _Optional[_Iterable[_Union[PhotoSpacetime, _Mapping]]] = ...) -> None: ...

class PhotoSpacetime(_message.Message):
    __slots__ = ("photo_id", "taken_at_utc", "taken_at_local", "lat", "lon", "camera_make", "camera_model")
    PHOTO_ID_FIELD_NUMBER: _ClassVar[int]
    TAKEN_AT_UTC_FIELD_NUMBER: _ClassVar[int]
    TAKEN_AT_LOCAL_FIELD_NUMBER: _ClassVar[int]
    LAT_FIELD_NUMBER: _ClassVar[int]
    LON_FIELD_NUMBER: _ClassVar[int]
    CAMERA_MAKE_FIELD_NUMBER: _ClassVar[int]
    CAMERA_MODEL_FIELD_NUMBER: _ClassVar[int]
    photo_id: str
    taken_at_utc: str
    taken_at_local: str
    lat: float
    lon: float
    camera_make: str
    camera_model: str
    def __init__(self, photo_id: _Optional[str] = ..., taken_at_utc: _Optional[str] = ..., taken_at_local: _Optional[str] = ..., lat: _Optional[float] = ..., lon: _Optional[float] = ..., camera_make: _Optional[str] = ..., camera_model: _Optional[str] = ...) -> None: ...

class CreateUploadIntentRequest(_message.Message):
    __slots__ = ("filename", "content_type", "size_bytes", "user_id")
    FILENAME_FIELD_NUMBER: _ClassVar[int]
    CONTENT_TYPE_FIELD_NUMBER: _ClassVar[int]
    SIZE_BYTES_FIELD_NUMBER: _ClassVar[int]
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    filename: str
    content_type: str
    size_bytes: str
    user_id: str
    def __init__(self, filename: _Optional[str] = ..., content_type: _Optional[str] = ..., size_bytes: _Optional[str] = ..., user_id: _Optional[str] = ...) -> None: ...

class CreateUploadIntentResponse(_message.Message):
    __slots__ = ("photo_id", "object_key", "upload_url", "expires_at")
    PHOTO_ID_FIELD_NUMBER: _ClassVar[int]
    OBJECT_KEY_FIELD_NUMBER: _ClassVar[int]
    UPLOAD_URL_FIELD_NUMBER: _ClassVar[int]
    EXPIRES_AT_FIELD_NUMBER: _ClassVar[int]
    photo_id: str
    object_key: str
    upload_url: str
    expires_at: str
    def __init__(self, photo_id: _Optional[str] = ..., object_key: _Optional[str] = ..., upload_url: _Optional[str] = ..., expires_at: _Optional[str] = ...) -> None: ...

class CompleteUploadRequest(_message.Message):
    __slots__ = ("photo_id", "user_id")
    PHOTO_ID_FIELD_NUMBER: _ClassVar[int]
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    photo_id: str
    user_id: str
    def __init__(self, photo_id: _Optional[str] = ..., user_id: _Optional[str] = ...) -> None: ...

class ListPhotosRequest(_message.Message):
    __slots__ = ("page_size", "user_id", "page", "sort_by", "sort_dir", "status_filter", "filename_query")
    PAGE_SIZE_FIELD_NUMBER: _ClassVar[int]
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    PAGE_FIELD_NUMBER: _ClassVar[int]
    SORT_BY_FIELD_NUMBER: _ClassVar[int]
    SORT_DIR_FIELD_NUMBER: _ClassVar[int]
    STATUS_FILTER_FIELD_NUMBER: _ClassVar[int]
    FILENAME_QUERY_FIELD_NUMBER: _ClassVar[int]
    page_size: int
    user_id: str
    page: int
    sort_by: PhotoSortField
    sort_dir: SortDirection
    status_filter: _containers.RepeatedScalarFieldContainer[PhotoStatus]
    filename_query: str
    def __init__(self, page_size: _Optional[int] = ..., user_id: _Optional[str] = ..., page: _Optional[int] = ..., sort_by: _Optional[_Union[PhotoSortField, str]] = ..., sort_dir: _Optional[_Union[SortDirection, str]] = ..., status_filter: _Optional[_Iterable[_Union[PhotoStatus, str]]] = ..., filename_query: _Optional[str] = ...) -> None: ...

class ListPhotosResponse(_message.Message):
    __slots__ = ("photos", "total_count")
    PHOTOS_FIELD_NUMBER: _ClassVar[int]
    TOTAL_COUNT_FIELD_NUMBER: _ClassVar[int]
    photos: _containers.RepeatedCompositeFieldContainer[PhotoAsset]
    total_count: int
    def __init__(self, photos: _Optional[_Iterable[_Union[PhotoAsset, _Mapping]]] = ..., total_count: _Optional[int] = ...) -> None: ...

class GetPhotoRequest(_message.Message):
    __slots__ = ("photo_id", "user_id")
    PHOTO_ID_FIELD_NUMBER: _ClassVar[int]
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    photo_id: str
    user_id: str
    def __init__(self, photo_id: _Optional[str] = ..., user_id: _Optional[str] = ...) -> None: ...

class SetPhotoLocationRequest(_message.Message):
    __slots__ = ("photo_id", "user_id", "place", "lat", "lon")
    PHOTO_ID_FIELD_NUMBER: _ClassVar[int]
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    PLACE_FIELD_NUMBER: _ClassVar[int]
    LAT_FIELD_NUMBER: _ClassVar[int]
    LON_FIELD_NUMBER: _ClassVar[int]
    photo_id: str
    user_id: str
    place: _processing_pb2.GeoPlace
    lat: float
    lon: float
    def __init__(self, photo_id: _Optional[str] = ..., user_id: _Optional[str] = ..., place: _Optional[_Union[_processing_pb2.GeoPlace, _Mapping]] = ..., lat: _Optional[float] = ..., lon: _Optional[float] = ...) -> None: ...

class PhotoVariantView(_message.Message):
    __slots__ = ("variant_type", "url", "width", "height")
    VARIANT_TYPE_FIELD_NUMBER: _ClassVar[int]
    URL_FIELD_NUMBER: _ClassVar[int]
    WIDTH_FIELD_NUMBER: _ClassVar[int]
    HEIGHT_FIELD_NUMBER: _ClassVar[int]
    variant_type: str
    url: str
    width: int
    height: int
    def __init__(self, variant_type: _Optional[str] = ..., url: _Optional[str] = ..., width: _Optional[int] = ..., height: _Optional[int] = ...) -> None: ...

class PhotoAsset(_message.Message):
    __slots__ = ("id", "filename", "content_type", "size_bytes", "object_key", "status", "created_at", "updated_at", "user_id", "width", "height", "taken_at_local", "taken_at_utc", "taken_at_tz_source", "camera_make", "camera_model", "orientation", "lat", "lon", "variants", "location")
    ID_FIELD_NUMBER: _ClassVar[int]
    FILENAME_FIELD_NUMBER: _ClassVar[int]
    CONTENT_TYPE_FIELD_NUMBER: _ClassVar[int]
    SIZE_BYTES_FIELD_NUMBER: _ClassVar[int]
    OBJECT_KEY_FIELD_NUMBER: _ClassVar[int]
    STATUS_FIELD_NUMBER: _ClassVar[int]
    CREATED_AT_FIELD_NUMBER: _ClassVar[int]
    UPDATED_AT_FIELD_NUMBER: _ClassVar[int]
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    WIDTH_FIELD_NUMBER: _ClassVar[int]
    HEIGHT_FIELD_NUMBER: _ClassVar[int]
    TAKEN_AT_LOCAL_FIELD_NUMBER: _ClassVar[int]
    TAKEN_AT_UTC_FIELD_NUMBER: _ClassVar[int]
    TAKEN_AT_TZ_SOURCE_FIELD_NUMBER: _ClassVar[int]
    CAMERA_MAKE_FIELD_NUMBER: _ClassVar[int]
    CAMERA_MODEL_FIELD_NUMBER: _ClassVar[int]
    ORIENTATION_FIELD_NUMBER: _ClassVar[int]
    LAT_FIELD_NUMBER: _ClassVar[int]
    LON_FIELD_NUMBER: _ClassVar[int]
    VARIANTS_FIELD_NUMBER: _ClassVar[int]
    LOCATION_FIELD_NUMBER: _ClassVar[int]
    id: str
    filename: str
    content_type: str
    size_bytes: str
    object_key: str
    status: PhotoStatus
    created_at: str
    updated_at: str
    user_id: str
    width: int
    height: int
    taken_at_local: str
    taken_at_utc: str
    taken_at_tz_source: str
    camera_make: str
    camera_model: str
    orientation: int
    lat: float
    lon: float
    variants: _containers.RepeatedCompositeFieldContainer[PhotoVariantView]
    location: _processing_pb2.GeoPlace
    def __init__(self, id: _Optional[str] = ..., filename: _Optional[str] = ..., content_type: _Optional[str] = ..., size_bytes: _Optional[str] = ..., object_key: _Optional[str] = ..., status: _Optional[_Union[PhotoStatus, str]] = ..., created_at: _Optional[str] = ..., updated_at: _Optional[str] = ..., user_id: _Optional[str] = ..., width: _Optional[int] = ..., height: _Optional[int] = ..., taken_at_local: _Optional[str] = ..., taken_at_utc: _Optional[str] = ..., taken_at_tz_source: _Optional[str] = ..., camera_make: _Optional[str] = ..., camera_model: _Optional[str] = ..., orientation: _Optional[int] = ..., lat: _Optional[float] = ..., lon: _Optional[float] = ..., variants: _Optional[_Iterable[_Union[PhotoVariantView, _Mapping]]] = ..., location: _Optional[_Union[_processing_pb2.GeoPlace, _Mapping]] = ...) -> None: ...
