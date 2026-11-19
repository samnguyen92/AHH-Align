FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/openclaw

# Node 20 is required by Next.js 16 (Debian's own nodejs is 18): the web-edit preview and the TypeScript check run
# on a clone of the site inside this container.
COPY --from=node:20-bookworm-slim /usr/local/bin/node /usr/local/bin/node
COPY --from=node:20-bookworm-slim /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -sf /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -sf /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    ca-certificates \
    libatomic1 \
    && rm -rf /var/lib/apt/lists/*

# Only for OPENCLAW_DEPLOY_MODE=docker (see docker-compose.deploy.yml). Off by default: the Docker CLI is useless
# without the socket, and the socket is root on the server.
ARG INSTALL_DOCKER_CLI=false
RUN if [ "$INSTALL_DOCKER_CLI" = "true" ]; then \
      apt-get update && apt-get install -y --no-install-recommends docker.io docker-compose \
      && rm -rf /var/lib/apt/lists/*; \
    fi

COPY openclaw/requirements.txt /app/openclaw/requirements.txt

RUN python -m pip install --upgrade pip \
    && pip install -r requirements.txt \
    && playwright install --with-deps chromium

COPY openclaw /app/openclaw

CMD ["python", "telegram_bot.py"]
