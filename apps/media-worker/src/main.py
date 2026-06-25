"""Media-worker entry point.

Configures structured logging and starts the RabbitMQ consume loop.
"""
from media_worker.app import run
from media_worker.config import load
from media_worker.logging_setup import setup_logging

if __name__ == "__main__":
    setup_logging()
    run(load())
