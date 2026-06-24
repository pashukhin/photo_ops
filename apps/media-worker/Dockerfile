FROM python:3.12-slim
WORKDIR /app
COPY apps/media-worker /app
RUN pip install --no-cache-dir -e .
CMD ["python", "-m", "src.main"]
