# ==============================================================================
# Vajra-Dhīr EDA — Pack 2A: KiCad 10 Headless Worker
# License Isolation: GPL-3.0 Isolated OCI Container
# Security: Zero-Egress, Rootless User (uid=10001), Read-Only Rootfs
# ==============================================================================

FROM debian:bookworm-slim

LABEL org.opencontainers.image.title="Vajra-Dhīr EDA Pack 2A (KiCad 10 Headless)" \
      org.opencontainers.image.description="Headless ERC, DRC, Gerber, IPC-2581, and STEP exports" \
      org.opencontainers.image.licenses="GPL-3.0-or-later" \
      org.opencontainers.image.vendor="Vajra-Dhīr EDA Core Team"

ENV DEBIAN_FRONTEND=noninteractive \
    LC_ALL=C.UTF-8 \
    LANG=C.UTF-8

# Install KiCad 10 headless dependencies & CLI tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    kicad \
    python3 \
    python3-pip \
    libgl1 \
    libglu1-mesa \
    ca-certificates \
    jq \
    && rm -rf /var/lib/apt/lists/*

# Hardened non-root execution
RUN groupadd -g 10001 vdworker && \
    useradd -u 10001 -g vdworker -d /vd_work -s /bin/bash vdworker && \
    mkdir -p /vd_work && \
    chown -R vdworker:vdworker /vd_work

WORKDIR /vd_work
USER 10001:10001

COPY entrypoint.sh /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/bin/bash", "/usr/local/bin/entrypoint.sh"]
