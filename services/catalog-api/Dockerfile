FROM ghcr.io/astral-sh/uv:0.11.29 AS uv
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app
COPY --from=uv /uv /uvx /bin/
COPY pyproject.toml uv.lock README.md alembic.ini ./
COPY alembic ./alembic
COPY src ./src
RUN uv sync --no-dev --locked
RUN mkdir -p /data

VOLUME ["/data"]

EXPOSE 8001
CMD ["sh", "-c", "uv run --no-sync alembic upgrade head && uv run --no-sync didaca-catalog-seed && exec uv run --no-sync uvicorn didaca_catalog.main:app --host 0.0.0.0 --port 8001"]
