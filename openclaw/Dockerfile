FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/openclaw

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    nodejs \
    npm \
    docker.io \
    docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

COPY openclaw/requirements.txt /app/openclaw/requirements.txt

RUN python -m pip install --upgrade pip \
    && pip install -r requirements.txt \
    && playwright install --with-deps chromium

COPY openclaw /app/openclaw

CMD ["python", "telegram_bot.py"]
