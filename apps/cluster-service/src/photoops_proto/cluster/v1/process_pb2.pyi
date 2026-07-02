from google.protobuf.internal import enum_type_wrapper as _enum_type_wrapper
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class ClusterOutcome(int, metaclass=_enum_type_wrapper.EnumTypeWrapper):
    __slots__ = ()
    CLUSTER_OUTCOME_UNSPECIFIED: _ClassVar[ClusterOutcome]
    CLUSTER_OUTCOME_SUCCEEDED: _ClassVar[ClusterOutcome]
    CLUSTER_OUTCOME_FAILED: _ClassVar[ClusterOutcome]
CLUSTER_OUTCOME_UNSPECIFIED: ClusterOutcome
CLUSTER_OUTCOME_SUCCEEDED: ClusterOutcome
CLUSTER_OUTCOME_FAILED: ClusterOutcome

class ClusterProcessJob(_message.Message):
    __slots__ = ("result_id", "user_id", "method", "params_json", "correlation_id")
    RESULT_ID_FIELD_NUMBER: _ClassVar[int]
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    METHOD_FIELD_NUMBER: _ClassVar[int]
    PARAMS_JSON_FIELD_NUMBER: _ClassVar[int]
    CORRELATION_ID_FIELD_NUMBER: _ClassVar[int]
    result_id: str
    user_id: str
    method: str
    params_json: str
    correlation_id: str
    def __init__(self, result_id: _Optional[str] = ..., user_id: _Optional[str] = ..., method: _Optional[str] = ..., params_json: _Optional[str] = ..., correlation_id: _Optional[str] = ...) -> None: ...

class ClusterProcessResult(_message.Message):
    __slots__ = ("result_id", "user_id", "correlation_id", "outcome", "error_message")
    RESULT_ID_FIELD_NUMBER: _ClassVar[int]
    USER_ID_FIELD_NUMBER: _ClassVar[int]
    CORRELATION_ID_FIELD_NUMBER: _ClassVar[int]
    OUTCOME_FIELD_NUMBER: _ClassVar[int]
    ERROR_MESSAGE_FIELD_NUMBER: _ClassVar[int]
    result_id: str
    user_id: str
    correlation_id: str
    outcome: ClusterOutcome
    error_message: str
    def __init__(self, result_id: _Optional[str] = ..., user_id: _Optional[str] = ..., correlation_id: _Optional[str] = ..., outcome: _Optional[_Union[ClusterOutcome, str]] = ..., error_message: _Optional[str] = ...) -> None: ...
