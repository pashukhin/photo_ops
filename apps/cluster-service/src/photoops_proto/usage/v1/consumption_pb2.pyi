from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class Measurement(_message.Message):
    __slots__ = ("event_type", "resource_type", "quantity", "unit", "source_entity_type", "source_entity_id")
    EVENT_TYPE_FIELD_NUMBER: _ClassVar[int]
    RESOURCE_TYPE_FIELD_NUMBER: _ClassVar[int]
    QUANTITY_FIELD_NUMBER: _ClassVar[int]
    UNIT_FIELD_NUMBER: _ClassVar[int]
    SOURCE_ENTITY_TYPE_FIELD_NUMBER: _ClassVar[int]
    SOURCE_ENTITY_ID_FIELD_NUMBER: _ClassVar[int]
    event_type: str
    resource_type: str
    quantity: int
    unit: str
    source_entity_type: str
    source_entity_id: str
    def __init__(self, event_type: _Optional[str] = ..., resource_type: _Optional[str] = ..., quantity: _Optional[int] = ..., unit: _Optional[str] = ..., source_entity_type: _Optional[str] = ..., source_entity_id: _Optional[str] = ...) -> None: ...

class ConsumptionEvent(_message.Message):
    __slots__ = ("idempotency_key", "user_id", "provider", "occurred_at", "measurements", "correlation_id")
    IDEMPOTENCY_KEY_FIELD_NUMBER: _ClassVar[int]
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    PROVIDER_FIELD_NUMBER: _ClassVar[int]
    OCCURRED_AT_FIELD_NUMBER: _ClassVar[int]
    MEASUREMENTS_FIELD_NUMBER: _ClassVar[int]
    CORRELATION_ID_FIELD_NUMBER: _ClassVar[int]
    idempotency_key: str
    user_id: str
    provider: str
    occurred_at: str
    measurements: _containers.RepeatedCompositeFieldContainer[Measurement]
    correlation_id: str
    def __init__(self, idempotency_key: _Optional[str] = ..., user_id: _Optional[str] = ..., provider: _Optional[str] = ..., occurred_at: _Optional[str] = ..., measurements: _Optional[_Iterable[_Union[Measurement, _Mapping]]] = ..., correlation_id: _Optional[str] = ...) -> None: ...
