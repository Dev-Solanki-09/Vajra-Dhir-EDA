# ==============================================================================
# Vajra-Dhīr EDA — Pack 2C: Open-Source Silicon ASIC Co-Design Worker
# License Isolation: Apache-2.0 / MIT / BSD
# Security: Zero-Egress, Rootless User (uid=10001), Read-Only Rootfs
# ==============================================================================

FROM debian:bookworm-slim

LABEL org.opencontainers.image.title="Vajra-Dhīr EDA Pack 2C (Silicon ASIC Co-Design)" \
      org.opencontainers.image.description="Verilator RTL simulation, Yosys synthesis, and Chip-to-Package-to-Board (C2P2B) bridge" \
      org.opencontainers.image.licenses="Apache-2.0 AND MIT" \
      org.opencontainers.image.vendor="Vajra-Dhīr EDA Core Team"

ENV DEBIAN_FRONTEND=noninteractive \
    LC_ALL=C.UTF-8 \
    LANG=C.UTF-8

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    verilator \
    yosys \
    ca-certificates \
    jq \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir --break-system-packages cocotb

# Hardened non-root execution
RUN groupadd -g 10001 vdworker && \
    useradd -u 10001 -g vdworker -d /vd_work -s /bin/bash vdworker && \
    mkdir -p /vd_work && \
    chown -R vdworker:vdworker /vd_work

WORKDIR /vd_work
USER 10001:10001

COPY entrypoint.sh /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/bin/bash", "/usr/local/bin/entrypoint.sh"]
