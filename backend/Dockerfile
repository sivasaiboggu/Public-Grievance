FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY pyproject.toml requirements.lock ./
RUN pip install --no-cache-dir -r requirements.lock
COPY app ./app
COPY migrations ./migrations
COPY alembic.ini ./
RUN useradd --create-home appuser && mkdir -p /app/var/evidence && chown -R appuser:appuser /app
USER appuser
EXPOSE 8000
CMD ["python", "-m", "app.serve"]
