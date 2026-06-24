from src.media_worker.messaging.in_memory import BusMessage, InMemoryBus


def test_delivers_to_handler_on_same_name():
    bus = InMemoryBus()
    seen = []
    bus.consume("photo.process", lambda m: seen.append(m.correlation_id))
    bus.publish("photo.process", BusMessage(body=b"x", correlation_id="corr-1"))
    bus.drain()
    assert seen == ["corr-1"]


def test_retries_on_exception_then_stops():
    bus = InMemoryBus()
    attempts = {"n": 0}

    def handler(_m):
        attempts["n"] += 1
        if attempts["n"] < 2:
            raise RuntimeError("boom")

    bus.consume("q", handler)
    bus.publish("q", BusMessage(body=b"", correlation_id="c"))
    bus.drain()
    assert attempts["n"] == 2


def test_always_raising_handler_is_called_exactly_3_times_then_dropped():
    """An always-failing handler must be retried up to 3 total attempts then dropped."""
    bus = InMemoryBus()
    attempts = 0

    def bad_handler(_m):
        nonlocal attempts
        attempts += 1
        raise RuntimeError("always fails")

    bus.consume("q", bad_handler)
    bus.publish("q", BusMessage(body=b"", correlation_id="x"))
    bus.drain()  # must not hang
    assert attempts == 3
