FROM python:3.12-slim
WORKDIR /app
COPY apps/cluster-service /app
RUN pip install --no-cache-dir -e .
# Generated grpc stubs import from the proto root; service code from src/.
ENV PYTHONPATH=/app/src:/app/src/photoops_proto
# Default role is the API server; the worker role overrides `command` in compose.
CMD ["python", "-m", "cluster_service.server_main"]
