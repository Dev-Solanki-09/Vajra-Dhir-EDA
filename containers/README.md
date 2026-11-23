# Vajra-Dhīr EDA — Ring 2 OCI Container Isolation Architecture

| Metadata Field | Value |
|---|---|
| **Architectural Layer** | Ring 2: Isolated Workers (GPL / Heavy Solvers / ASIC / Virtual Lab) |
| **Sandbox Runtime** | OCI (`podman` / `docker`) with optional `gVisor` (`runsc`) hypervisor |
| **Security Ceiling** | `network_mode: none` (Zero Egress), `read_only: true`, `cap_drop: ALL` |
| **Execution Model** | Stateless job contract (`schemas/worker_contract.v1.json`) |
| **Shared Storage** | Content-Addressed Volume `/vd_work` (`vd_cas_work`) |

---

## 1. Architectural Principles

1. **Permissive Core Protection:**
   The Ring 1 Core (`packages/*`, `apps/*`, `cli`) is strictly licensed under **MIT OR Apache-2.0**. Heavy external tools (KiCad 10, ngspice, Renode, OpenLane 2, Verilator) containing copyleft licenses (GPLv2, GPLv3) or complex system dependencies run strictly inside Ring 2 OCI containers. No copyleft code is ever statically or dynamically linked into Ring 1.

2. **Zero-Egress Security Fence:**
   Every Ring 2 worker container runs with `network_mode: none`. No inbound or outbound network sockets are permitted. Even if a third-party solver or script is compromised, it cannot exfiltrate proprietary schematics, netlists, or NDA hardware models.

3. **Content-Addressed Staging (`/vd_work`):**
   The host CLI (`vd worker run <pack>`) stages inputs into a dedicated job directory on a shared volume:
   ```text
   /vd_work/
   ├── job.json                # Job specification conforming to worker_contract.v1.json
   ├── inputs/                 # Staged board.kicad_pcb, board.vd-ir.jsonl, etc.
   └── outputs/                # Generated Gerbers, STEP models, DRC reports, test logs
   ```
   Upon completion, the worker generates `result.json` containing SHA-256 evidence hashes for every generated output artifact.

---

## 2. Container Pack Roster

| Pack ID | Directory | Core Solvers & Engines | Primary Use Cases |
|---|---|---|---|
| **`pack-2a`** | `containers/pack-2a-kicad` | KiCad 10 `kicad-cli`, Python 3 | Headless ERC, DRC, Gerber X2 export, IPC-2581C, STEP 3D assembly. |
| **`pack-2b`** | `containers/pack-2b-virtual-lab` | Renode, ngspice, OpenHTF | Firmware digital twin, lockstep SPICE co-simulation, factory test plans. |
| **`pack-2c`** | `containers/pack-2c-silicon-asic` | Verilator, Yosys, cocotb, OpenROAD | Digital RTL simulation, SkyWater 130nm ASIC flow, C2P2B ball-map. |
