FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    gcc \
    g++ \
    golang \
    default-jdk \
    git \
    lua5.4 \
    nodejs \
    npm \
    php-cli \
    python3 \
    python3-pip \
    ruby \
    rustc \
  && npm install -g tsx yarn pnpm \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace

CMD ["sh"]
