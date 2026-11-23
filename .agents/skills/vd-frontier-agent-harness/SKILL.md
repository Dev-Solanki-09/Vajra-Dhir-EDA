---
name: vd-frontier-agent-harness
description: Frontier 2026 AI harness engineering (Harness MCP v2 12-verb dispatch, Deferred Tool Search, Wasmtime Code Mode, ACP, Dual-Context Auditor, hw-dlp NDA firewall, WorkerContract). Trigger on mcp-gateway, agent-harness, hw-dlp, or worker-sdk changes.
---
# Frontier AI Harness & Protocol Architecture — Vajra-Dhīr EDA

## 1. Strict 12-Verb Harness MCP v2 Discipline
- Expose ONLY the 12 stable top-level verbs (`hw_discover`, `hw_inspect`, `hw_patch`, `hw_lock`, `hw_compile`, `hw_verify`, `hw_simulate`, `hw_layout`, `hw_signoff`, `hw_firmware`, `hw_export`, `hw_diff`).
- Every specialized engine option (`openems.*`, `kikit.*`, `openroad.*`, `palace.*`, `pybert.*`) MUST register with `defer_loading: true` and be discovered via `hw_discover`.
- Every verb MUST define a strict JSON `outputSchema` and keep direct payloads `<= 16 KiB`; larger DRC/STA/waveform files return an `artifact_uri` inspected via Wasmtime Code Mode.

## 2. ACP + Dual Checkpoint Atomicity
- Implement ACP (`initialize`, `session/new`, `session/prompt`, `session/update`, `session/request_permission`, `session/cancel`) over newline JSON-RPC 2.0 stdio so `vd-agent`, Claude Code, Codex CLI, and local Ollama are interchangeable.
- Every user prompt turn MUST record a `DualCheckpoint(git_tree_sha, hwir_lamport, otel_trace_id)` so Rewind rolls back firmware/RTL code AND `HW-IR` simultaneously.

## 3. Dual-Context Isolation & Hard Gate 8 Block
- The Auditor Context (Gate 3 / Security Audit) MUST be instantiated as a fresh session with ZERO solver conversation history or chain-of-thought.
- Gate 8 (`hw_export` production release) MUST fail closed without an explicit cryptographic `human_signoff_token`. Autonomous mode L5 stops at Gate 7.
- In `NDA_AIRGAPPED` workspaces (or when `.vd-airgap` / foundry NDA file patterns exist), `hw-dlp` MUST fail closed before TCP/DNS open and restrict execution strictly to local Ollama/vLLM + `gVisor` `network_mode: none`.
