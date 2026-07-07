from google.protobuf.internal import containers as _containers
from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class ProcessingType(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    PROCESSING_TYPE_UNSPECIFIED: _ClassVar[ProcessingType]
    PROCESSING_TYPE_INITIAL: _ClassVar[ProcessingType]
    PROCESSING_TYPE_REPROCESS: _ClassVar[ProcessingType]

class ProcessingOutcome(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    PROCESSING_OUTCOME_UNSPECIFIED: _ClassVar[ProcessingOutcome]
    PROCESSING_OUTCOME_SUCCEEDED: _ClassVar[ProcessingOutcome]
    PROCESSING_OUTCOME_FAILED: _ClassVar[ProcessingOutcome]
PROCESSING_TYPE_UNSPECIFIED: ProcessingType
PROCESSING_TYPE_INITIAL: ProcessingType
PROCESSING_TYPE_REPROCESS: ProcessingType
PROCESSING_OUTCOME_UNSPECIFIED: ProcessingOutcome
PROCESSING_OUTCOME_SUCCEEDED: ProcessingOutcome
PROCESSING_OUTCOME_FAILED: ProcessingOutcome

class ProcessPhotoJob(_message.Message):
    __slots__ = ("job_id", "photo_id", "user_id", "object_key", "type", "correlation_id")
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    PHOTO_ID_FIELD_NUMBER: _ClassVar[int]
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    OBJECT_KEY_FIELD_NUMBER: _ClassVar[int]
    TYPE_FIELD_NUMBER: _ClassVar[int]
    CORRELATION_ID_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    photo_id: str
    user_id: str
    object_key: str
    type: ProcessingType
    correlation_id: str
    def __init__(self, job_id: _Optional[str] = ..., photo_id: _Optional[str] = ..., user_id: _Optional[str] = ..., object_key: _Optional[str] = ..., type: _Optional[_Union[ProcessingType, str]] = ..., correlation_id: _Optional[str] = ...) -> None: ...

class GeoPlace(_message.Message):
    __slots__ = ("continent", "country", "region", "city", "district", "raw_provider_data")
    CONTINENT_FIELD_NUMBER: _ClassVar[int]
    COUNTRY_FIELD_NUMBER: _ClassVar[int]
    REGION_FIELD_NUMBER: _ClassVar[int]
    CITY_FIELD_NUMBER: _ClassVar[int]
    DISTRICT_FIELD_NUMBER: _ClassVar[int]
    RAW_PROVIDER_DATA_FIELD_NUMBER: _ClassVar[int]
    continent: str
    country: str
    region: str
    city: str
    district: str
    raw_provider_data: str
    def __init__(self, continent: _Optional[str] = ..., country: _Optional[str] = ..., region: _Optional[str] = ..., city: _Optional[str] = ..., district: _Optional[str] = ..., raw_provider_data: _Optional[str] = ...) -> None: ...

class ImageAttributes(_message.Message):
    __slots__ = ("width", "height", "taken_at_local", "taken_at_utc", "taken_at_tz_source", "camera_make", "camera_model", "orientation", "lat", "lon", "place")
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
    PLACE_FIELD_NUMBER: _ClassVar[int]
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
    place: GeoPlace
    def __init__(self, width: _Optional[int] = ..., height: _Optional[int] = ..., taken_at_local: _Optional[str] = ..., taken_at_utc: _Optional[str] = ..., taken_at_tz_source: _Optional[str] = ..., camera_make: _Optional[str] = ..., camera_model: _Optional[str] = ..., orientation: _Optional[int] = ..., lat: _Optional[float] = ..., lon: _Optional[float] = ..., place: _Optional[_Union[GeoPlace, _Mapping]] = ...) -> None: ...

class VariantResult(_message.Message):
    __slots__ = ("variant_type", "object_key", "width", "height", "size_bytes", "content_type")
    VARIANT_TYPE_FIELD_NUMBER: _ClassVar[int]
    OBJECT_KEY_FIELD_NUMBER: _ClassVar[int]
    WIDTH_FIELD_NUMBER: _ClassVar[int]
    HEIGHT_FIELD_NUMBER: _ClassVar[int]
    SIZE_BYTES_FIELD_NUMBER: _ClassVar[int]
    CONTENT_TYPE_FIELD_NUMBER: _ClassVar[int]
    variant_type: str
    object_key: str
    width: int
    height: int
    size_bytes: int
    content_type: str
    def __init__(self, variant_type: _Optional[str] = ..., object_key: _Optional[str] = ..., width: _Optional[int] = ..., height: _Optional[int] = ..., size_bytes: _Optional[int] = ..., content_type: _Optional[str] = ...) -> None: ...

class PhotoProcessingResult(_message.Message):
    __slots__ = ("job_id", "photo_id", "correlation_id", "outcome", "error_message", "attributes", "variants", "metadata_json")
    JOB_ID_FIELD_NUMBER: _ClassVar[int]
    PHOTO_ID_FIELD_NUMBER: _ClassVar[int]
    CORRELATION_ID_FIELD_NUMBER: _ClassVar[int]
    OUTCOME_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    ATTRIBUTES_FIELD_NUMBER: _ClassVar[int]
    VARIANTS_FIELD_NUMBER: _ClassVar[int]
    METADATA_JSON_FIELD_NUMBER: _ClassVar[int]
    job_id: str
    photo_id: str
    correlation_id: str
    outcome: ProcessingOutcome
    error_message: str
    attributes: ImageAttributes
    variants: _containers.RepeatedCompositeFieldContainer[VariantResult]
    metadata_json: str
    def __init__(self, job_id: _Optional[str] = ..., photo_id: _Optional[str] = ..., correlation_id: _Optional[str] = ..., outcome: _Optional[_Union[ProcessingOutcome, str]] = ..., error_message: _Optional[str] = ..., attributes: _Optional[_Union[ImageAttributes, _Mapping]] = ..., variants: _Optional[_Iterable[_Union[VariantResult, _Mapping]]] = ..., metadata_json: _Optional[str] = ...) -> None: ...
