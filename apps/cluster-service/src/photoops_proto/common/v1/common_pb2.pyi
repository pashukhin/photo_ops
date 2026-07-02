from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Optional as _Optional

DESCRIPTOR: _descriptor.FileDescriptor

class Empty(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class HealthCheckRequest(_message.Message):
    __slots__ = ()
    def __init__(self) -> None: ...

class HealthCheckResponse(_message.Message):
    __slots__ = ("status", "service")
    STATUS_FIELD_NUMBER: _ClassVar[int]
    SERVICE_FIELD_NUMBER: _ClassVar[int]
    status: str
    service: str
    def __init__(self, status: _Optional[str] = ..., service: _Optional[str] = ...) -> None: ...

class ErrorResponse(_message.Message):
    __slots__ = ("code", "message", "correlation_id")
    CODE_FIELD_NUMBER: _ClassVar[int]
    MESSAGE_FIELD_NUMBER: _ClassVar[int]
    CORRELATION_ID_FIELD_NUMBER: _ClassVar[int]
    code: str
    message: str
    correlation_id: str
    def __init__(self, code: _Optional[str] = ..., message: _Optional[str] = ..., correlation_id: _Optional[str] = ...) -> None: ...
