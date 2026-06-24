"""Media-worker entry point.

Configures structured logging and starts the RabbitMQ consume loop.
The health HTTP scaffold has been removed — worker liveness is signalled
by the consumer connection remaining open (see apps/media-worker/CLAUDE.md).
"""
import logging

from media_worker.app import run
from media_worker.config import load

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    run(load())
