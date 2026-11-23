# AGENT KNOWLEDGE UPDATE — NOVEMBER 2026 BASELINE

> **Enforcement:** Mandatory reading for all AI agents prior to editing code or proposing dependencies.  
> **Effective Date:** 2026-11-23

---

## 1. Critical CVE Floors & Dependency Pins

1. **Wasmtime `>= 50.0.0`:**
   - **Vulnerability:** Earlier versions (`< 50.0.0`) are affected by CVSS 9.9 `CVE-2026-115889` (ARM64/x86 Cranelift sandbox escape via register allocation bug).
   - **Rule:** Never pin `wasmtime = "30.0"` or earlier. Pin `wasmtime = "50.0"` or higher with Component Model enabled.
2. **React & React-DOM `>= 19.3.1`:**
   - **Vulnerability:** React 19.0.0 through 19.2.x are affected by CVSS 9.5 `CVE-2026-126187` (SSR hydration prototype pollution and unsafe action serialization).
   - **Rule:** Pin `"react": "^19.3.1"` and `"react-dom": "^19.3.1"`.
3. **Node.js `>= 26.13.1`:**
   - **Vulnerability:** Node.js 26.13.1 LTS (Lithium) contains patches for 16 mid-November 2026 CVEs in HTTP parser, crypto engine, and permission model.
4. **Rust `1.100.0` & 72-Hour Registry Age Gate:**
   - **Supply-Chain Guard:** `.cargo/config.toml` MUST enforce `[registry] global-min-publish-age = "72 hours"` to block immediate zero-day malicious crate publishes.
   - **Features:** Rust 1.100 stabilizes arena allocators and layout primitives used in `vd-cad-geom`.
5. **TypeScript `7.0.2`:**
   - Use strict mode with `"moduleResolution": "bundler"` or `"nodenext"`.

---

## 2. Technical Reality: KiCad 10.0.8 & KiCad 11 Roadmap

1. **KiCad 10 IPC Protocol:**
   - KiCad 10’s NNG Protobuf IPC API (`kicad-python`) requires a live, running KiCad GUI.
   - It supports **PCB Editor only** (no schematic IPC, no headless IPC, no plotting/export).
   - Python SWIG bindings (`pcbnew.py`) are strictly deprecated and slated for complete removal in KiCad 11.
2. **3-Channel Bridge Requirement:**
   - **Channel A:** Direct deterministic S-expression parser/writer for `.kicad_sch` with atomic `.tmp -> fsync -> rename` and 5-second SHA-256 Echo Suppression Ring.
   - **Channel B:** Live optional PCB GUI NNG IPC socket (`ipc:///tmp/kicad/api.sock` or `ipc://\\.\pipe\kicad-api-*`), wrapped in single undo transactions (`begin_commit` / `push_commit`).
   - **Channel C:** Headless `kicad-cli` for `sch erc`, `pcb drc`, and exports (`gerber`, `step`, `pdf`, `ipc2581`).
   - Feature-flag headless IPC behind a runtime probe (`kicad_version >= 11.0`).

---

## 3. Model Context Protocol (MCP) Standards

1. **Harness MCP v2:**
   - Top-level tool registration is strictly limited to 12 verbs: `hw_discover`, `hw_inspect`, `hw_patch`, `hw_lock`, `hw_compile`, `hw_verify`, `hw_simulate`, `hw_layout`, `hw_signoff`, `hw_firmware`, `hw_export`, `hw_diff`.
   - Domain-specific sub-tools register with `defer_loading: true` and are discovered dynamically.
2. **MCP Apps (`@modelcontextprotocol/ext-apps`, SEP-1865):**
   - Served under `ui://vajradhir/<view>` (`text/html;profile=mcp-app`).
   - Strict Content Security Policy: `default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:; connect-src 'none';`.
   - `connect-src 'none'` guarantees zero data exfiltration from UI iframes. All data travels over host-mediated `postMessage` JSON-RPC.

---

## 4. Supply-Chain & Copyright Invariants

1. **Vendor Datasheets:**
   - Vendor PDFs must NEVER be committed to Git.
   - `datasheet-lens` stores PDFs locally in `~/.vajradhir/datasheets/<sha256>.pdf`.
   - Unstructured raw PDF text is quarantined: only typed numeric tables and 300-dpi cropped PNG bounding boxes reach agent contexts.
2. **License Guard:**
   - Zero AGPL (`KiBot`, `Konnect`, `Part-DB`, `PyPSA/pypsa-app`, `OpenModelica`) in Ring 1.
   - Zero GPL linked in Ring 1 core. (GPL tools run exclusively in isolated child processes or OCI containers).
