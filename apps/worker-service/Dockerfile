FROM node:20-bookworm-slim

WORKDIR /app

# ── System dependencies: curl, unzip, Blender (headless) ─────────────
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     curl unzip ca-certificates \
     blender \
     xvfb \
     python3-pip \
  && pip3 install --break-system-packages imageio Pillow \
  && rm -rf /var/lib/apt/lists/*

# ── Lune CLI ──────────────────────────────────────────────────────────
RUN curl -L "https://github.com/lune-org/lune/releases/download/v0.10.4/lune-0.10.4-linux-x86_64.zip" -o /tmp/lune.zip \
  && unzip /tmp/lune.zip -d /usr/local/bin \
  && chmod +x /usr/local/bin/lune \
  && rm /tmp/lune.zip

# ── Application ───────────────────────────────────────────────────────
COPY package.json tsconfig.json ./
COPY src ./src
COPY runtime ./runtime

RUN npm install && npm run build

ENV WORKER_PORT=8080
ENV BLENDER_BIN=blender
ENV LUNE_BIN=lune
ENV MESH_MAX_TRIANGLES=100000
ENV MESH_TARGET_RATIO=0.5

EXPOSE 8080

CMD ["npm", "run", "start"]
