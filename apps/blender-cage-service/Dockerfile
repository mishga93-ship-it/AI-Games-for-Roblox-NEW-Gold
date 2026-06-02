# Roblox layered-clothing cage generator — Blender 4.x headless on Cloud Run.
#
# Why ubuntu:22.04 base: Blender 4.x's official binary tarball ships its own
# Python + libs; we only need glibc + a handful of X11/OpenGL stubs because
# even in --background mode Blender dlopens libGL etc.

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV BLENDER_VERSION=4.2.3
ENV BLENDER_MAJOR=4.2
ENV BLENDER_ARCHIVE=blender-${BLENDER_VERSION}-linux-x64.tar.xz
ENV BLENDER_URL=https://download.blender.org/release/Blender${BLENDER_MAJOR}/${BLENDER_ARCHIVE}
ENV PORT=8080

# Minimum runtime deps for Blender headless + Python stdlib HTTP server.
# libxi/libxxf86vm/libxfixes/libxrender are dlopened even without a display.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    xz-utils \
    python3 \
    python3-pip \
    libfreetype6 \
    libxi6 \
    libxxf86vm1 \
    libxfixes3 \
    libxrender1 \
    libxkbcommon0 \
    libsm6 \
    libgl1 \
    libegl1 \
    libglu1-mesa \
 && rm -rf /var/lib/apt/lists/*

# Install Blender into /usr/local/blender so the binary path is stable.
RUN mkdir -p /usr/local/blender \
 && curl -fsSL "${BLENDER_URL}" -o /tmp/blender.tar.xz \
 && tar -xJf /tmp/blender.tar.xz -C /usr/local/blender --strip-components=1 \
 && rm /tmp/blender.tar.xz \
 && /usr/local/blender/blender --version

# Install Pillow into Blender's own Python so vehicle_fix.py can soften
# window-glass pixels in Meshy textures (Phase B, session 373 round 13).
# Blender bundles its own python 3.11 under <BLENDER>/4.2/python/bin/; pip
# install must target THAT interpreter, not the system python3.
RUN /usr/local/blender/4.2/python/bin/python3.11 -m ensurepip --upgrade \
 && /usr/local/blender/4.2/python/bin/python3.11 -m pip install --no-cache-dir Pillow==10.4.0

WORKDIR /app
COPY generate_cages.py /app/generate_cages.py
COPY vehicle_fix.py /app/vehicle_fix.py
COPY Clothing_Cage_Template.blend /app/Clothing_Cage_Template.blend
# Combined-Template.blend ships Roblox's R15 armature + the official 1358-vert
# clothing inner/outer cages. generate_cages.py opens it to skin the garment to
# the rig (auto bone-heat weights) and shrink the outer cage over it — producing
# a real layered-clothing WrapLayer on import (verified in Studio 2026-06-02).
COPY Combined-Template.blend /app/Combined-Template.blend
COPY server.py /app/server.py

ENV BLENDER_BIN=/usr/local/blender/blender
EXPOSE 8080

# Cloud Run respects $PORT.
CMD ["python3", "/app/server.py"]
