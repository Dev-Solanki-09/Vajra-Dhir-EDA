# THREAT_MODEL.md — Vajra-Dhīr EDA Industrial Threat Model

> **Standard:** STRIDE + OWASP Top 10 for Agentic AI 2026 (`ASI01`–`ASI10`)  
> **Status:** Active Baseline · Aligned with `VD-SAD-001` Section 6

---

## 1. System Overview & Trust Boundaries

```
                      ┌────────────────────────────────────────┐
                      │ External Untrusted Sources             │
                      │ (Vendor PDFs, Community CUBOs, Web)    │
                      └───────────────────┬────────────────────┘
                                          │ TB-1: PDF / CUBO Quarantine
                                          ▼
                      ┌────────────────────────────────────────┐
                      │ Ring 1: Lean Core IDE                  │
                      │ • vd-daemon (Rust, SQLite WAL)         │
                      │ • Wasmtime 50 Code Mode Sandbox        │ ◄── TB-2: Agent Script Sandbox
                      │ • Chromium Renderer / MCP Apps (ui://) │
                      │ • ACP Agent Broker (Local / Cloud LLM) │
                      └───────┬────────────────────────┬───────┘
                              │                        │
         TB-4: hw-dlp Airgap  │                        │ TB-3: gVisor OCI Sandbox
                              ▼                        ▼
┌────────────────────────────────────────┐   ┌────────────────────────────────────────┐
│ Cloud / Local LLM Inference Engines    │   │ Ring 2: Isolated Multi-Physics Packs   │
│ (Claude, Codex, Ollama, vLLM)          │   │ (KiCad, openEMS, ElmerFEM, LibreLane)  │
└────────────────────────────────────────┘   └───────────────────┬────────────────────┘
                                                                 │ TB-5: Gate 8 Fab Handoff
                                                                 ▼
                                             ┌────────────────────────────────────────┐
                                             │ Physical Hardware Production           │
                                             │ (PCB Fab, JLCPCB, Tapeout Foundry)     │
                                             └────────────────────────────────────────┘
```

---

## 2. Detailed Threat Analysis by Trust Boundary

### TB-1: Untrusted Vendor PDFs & Community Open-CUBOs
- **Assets:** User workspace code, schematic netlists, host file system integrity.
- **Threats:**
  - *Indirect Prompt Injection (`ASI01`):* Malicious text hidden in white-on-white PDF layers instructing agents to short $V_{\text{IN}}$ to GND or exfiltrate private tokens.
  - *Malicious Script Execution:* Community CUBOs containing backdoor Python scripts in `verify_assertions.py`.
  - *Copyright & Trademark Infringement:* Unintentional redistribution of vendor-copyrighted PDF documents in public repositories.
- **Controls:**
  - `datasheet-lens` parses PDFs inside an isolated child subprocess; raw PDF text NEVER enters LLM contexts. Only type-checked numeric tables and rasterized 300–600 dpi PNG crops pass to the Auditor.
  - All official CUBOs require Ed25519 cryptographic signatures verified against a pinned trusted key.
  - Pre-commit hook (`vd-guard.sh`) hard-blocks any file matching `*.pdf` from being staged into Git.

### TB-2: LLM-Authored Code Mode Scripts
- **Assets:** Host machine OS, environment variables, credentials, network interfaces.
- **Threats:**
  - *Host Escape & Data Exfiltration (`ASI02`):* Agent writing Python or Rust code attempting to read `~/.ssh`, `~/.aws`, or foundry PDKs.
  - *Resource Exhaustion DoS (`ASI05`):* Infinite loops in generated AST filters or DRC parsing scripts freezing the IDE.
- **Controls:**
  - `Wasmtime >= 50.0.0` WASI sandbox (`CVE-2026-115889` patched).
  - Zero preopened host directories, zero inherited environment variables, zero network sockets.
  - Linear memory hard-capped at 256 MiB (`StoreLimitsBuilder`), CPU fuel capped at 50,000,000 instructions, and independent 5-second wall-clock epoch watchdog.
  - Output payload size hard-capped at 16 KiB.

### TB-3: Ring 2 Multi-Physics & Silicon Containers
- **Assets:** Host kernel stability, multi-tenant container isolation.
- **Threats:**
  - *Container Escape via Parser Vulnerability:* Malformed STEP models or GDSII files triggering buffer overflows in native C/C++ solvers (`Gmsh`, `ElmerSolver`, `Magic`).
- **Controls:**
  - Google `gVisor` (`runsc`) userspace kernel sandbox separating container workloads from host OS kernel.
  - Mandatory container security options: `network_mode: none`, `read_only: true`, `security_opt: ["no-new-privileges:true"]`, `cap_drop: ["ALL"]`.
  - Pinned OCI image digests (`@sha256:...`) recorded in `hw.lock`.

### TB-4: NDA / Foundry PDK Workspaces
- **Assets:** Proprietary schematics, netlists, PDK design rules, customer IP.
- **Threats:**
  - *Data Leakage to Public Cloud LLMs:* Inadvertently sending commercial foundry netlists (TSMC, Intel, GF, IHP) to third-party model APIs.
  - *UI Exfiltration via Iframe:* Webview iframes fetching external tracking pixels or exfiltrating canvas geometries.
- **Controls:**
  - `hw-dlp` policy engine intercepts all outbound gateway calls. When workspace is tagged `NDA_AIRGAPPED` (or matches foundry NDA file patterns), all outbound TCP/DNS traffic is hard-blocked.
  - Autonomous routing restricted strictly to local offline Ollama/vLLM instances (`127.0.0.1`).
  - MCP App iframes enforce strict Content Security Policy (`connect-src 'none'`).

### TB-5: Autonomous Hardware Fabrication
- **Assets:** Hardware budget, physical safety, factory manufacturing runs.
- **Threats:**
  - *Hallucinated Shorts & Overheating (`ASI08`):* Agent generating netlist errors that cause battery fires, reverse-polarity explosions, or shorted power rails.
  - *Unauthorized Autonomous Ordering:* Agent using payment tools or fab APIs without human knowledge.
- **Controls:**
  - 9-Gate fail-closed architecture: DRC/ERC/LVS, Z3 pinmux solver, 10 EE Footgun assertions, and isolated Auditor must all pass deterministically before release.
  - **Mandatory Human Cryptographic Signoff Token:** Gate 8 (`hw_export`) physically refuses to package production release bundles without an explicit human signoff token. Autonomous mode (L5) terminates strictly at Gate 7.
