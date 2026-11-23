# ==============================================================================
# Vajra-Dhīr EDA — Pack 2B: Virtual Lab & Hardware-In-The-Loop Worker
# License Isolation: MIT (Renode) / Apache-2.0 (OpenHTF) / BSD (ngspice)
# Security: Zero-Egress, Rootless User (uid=10001), Read-Only Rootfs
# ==============================================================================

FROM debian:bookworm-slim

LABEL org.opencontainers.image.title="Vajra-Dhīr EDA Pack 2B (Virtual Lab & HIL)" \
      org.opencontainers.image.description="Firmware digital twin, lockstep SPICE co-simulation, and factory test execution" \
      org.opencontainers.image.licenses="MIT AND Apache-2.0 AND BSD-3-Clause" \
      org.opencontainers.image.vendor="Vajra-Dhīr EDA Core Team"

ENV DEBIAN_FRONTEND=noninteractive \
    LC_ALL=C.UTF-8 \
    LANG=C.UTF-8

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ngspice \
    ca-certificates \
    jq \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir --break-system-packages openhtf

# Hardened non-root execution
RUN groupadd -g 10001 vdworker && \
    useradd -u 10001 -g vdworker -d /vd_work -s /bin/bash vdworker && \
    mkdir -p /vd_work && \
    chown -R vdworker:vdworker /vd_work

WORKDIR /vd_work
USER 10001:10001

COPY entrypoint.sh /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/bin/bash", "/usr/local/bin/entrypoint.sh"]
