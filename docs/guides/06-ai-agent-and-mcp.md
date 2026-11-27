# Guide 06 — AI Co-Designer (BYOK / Offline Airgap) & Live MCP

## Local Offline & BYOK Modes
Vajra-Dhir defaults to **100% Offline Airgapped ($0)** operation.
To connect your own API key (OpenAI, Anthropic Claude, Google Gemini, OpenRouter, Nous Portal, NVIDIA NIM, or loopback Ollama):
1. Press `Ctrl+,` and open **AI Agent, MCP, Plugins & Security**.
2. Choose your **AI Provider**, enter your model name, paste your key, and click **Save** (stored strictly in your OS Keychain or local encrypted `.vault.enc` — never in plain config or logs).
3. Update **Privacy / Network Policy** from `NDA_AIRGAPPED` to `PRIVATE_CLOUD_OK` if calling external cloud APIs, then click **Test Connection**. Local loopback `Ollama` (`127.0.0.1:11434`) remains allowed even in strict airgap mode.

## Context Tags, Checkpoints & Rollback
- Reference live project context in chat using `@board`, `@pcb`, `@drc`, `@spice`, or `@file:relative/path`.
- Before mutating components or files, Vajra-Dhir saves a dual Git + database checkpoint. Click **Rewind** or type `/rollback` at any time to restore cleanly.
- Both **Memory writes** and **Skill writes** require explicit user confirmation by default.
