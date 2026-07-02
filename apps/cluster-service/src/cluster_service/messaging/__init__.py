"""Broker-agnostic messaging port + in-memory fake + RabbitMQ adapter.

Mirrors apps/media-worker/src/media_worker/messaging. Topology (direct exchange
+ DLX/DLQ per logical name) is canonical and shared with the other adapters — do
not diverge the constants.
"""
