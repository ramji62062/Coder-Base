FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV HOME=/home/codetogether

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    gnupg \
    gcc \
    g++ \
    golang \
    default-jdk \
    git \
    lua5.4 \
    php-cli \
    python3 \
    python3-pip \
    ruby \
    rustc \
    procps \
    coreutils \
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y --no-install-recommends nodejs \
  && npm install -g tsx yarn pnpm \
  && npm install -g typescript@5 typescript-language-server@6 \
  && pip3 install --break-system-packages --no-cache-dir \
    flask \
    fastapi \
    uvicorn \
    requests \
    numpy \
    python-lsp-server \
    pylsp-mypy \
    pylsp-rope \
  && groupadd -r codetogether \
  && useradd -r -g codetogether -d /home/codetogether -s /bin/bash codetogether \
  && mkdir -p /workspace /home/codetogether/.npm /home/codetogether/.cache \
  && chown -R codetogether:codetogether /workspace /home/codetogether \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
USER codetogether

# Let globally-installed npm packages (typescript, typescript-language-server)
# resolve each other at runtime inside `docker exec`.
ENV NODE_PATH=/usr/lib/node_modules:/usr/local/lib/node_modules

CMD ["sleep", "infinity"]
