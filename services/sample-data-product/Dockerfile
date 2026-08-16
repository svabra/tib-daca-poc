FROM ghcr.io/astral-sh/uv:0.11.29 AS uv
FROM python:3.14-slim

ARG IMAGE_VERSION
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH" \
    IMAGE_VERSION="${IMAGE_VERSION}"
LABEL org.opencontainers.image.version="${IMAGE_VERSION}"

WORKDIR /app
COPY --from=uv /uv /uvx /bin/
COPY pyproject.toml uv.lock README.md alembic.ini ./
COPY alembic ./alembic
COPY app ./app
RUN uv sync --no-dev --locked

EXPOSE 8000
CMD ["sh", "-c", "uv run --no-sync alembic upgrade head && exec uv run --no-sync uvicorn app.main:app --host 0.0.0.0 --port 8000"]
