# Troubleshooting Guide

### Browser did not remember my settings / layout after reopening
Ensure you launch via `Vajra-Dhir-EDA.vbs` (Windows) or `node scripts/launch.mjs`. Launches now persist a dedicated app profile under `<dataDir>/app-profile` rather than an ephemeral incognito directory.

### `kicad-cli` not detected on Windows
1. Confirm KiCad 10+ is installed (default path: `%LOCALAPPDATA%\Programs\KiCad\10.0\bin\kicad-cli.exe` or `C:\Program Files\KiCad\10.0\bin\kicad-cli.exe`).
2. Or set a custom path in **Settings -> External Tools & Paths -> kicad-cli**.
3. Use **Home -> Environment -> Run Doctor** (`F1 -> System Doctor`) to inspect path resolution immediately.

### BYOK connection shows `NDA_AIRGAP_VIOLATION`
Your active Privacy Policy is `NDA_AIRGAPPED`, which blocks non-loopback network requests at the firewall layer. Either use local loopback `Ollama` (`127.0.0.1:11434`) / `Offline Planner`, or change **Privacy / Network Policy** in **Settings -> AI Agent** if the project is not under airgap restriction.

### Recovery from corrupted window layout or crash
If panes fail to load after resizing monitors, click **Window -> Reset Current Workspace Layout** (or click **Restore autosave** if the crash recovery banner appears on launch).
