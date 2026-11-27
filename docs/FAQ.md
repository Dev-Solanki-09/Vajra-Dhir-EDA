# Frequently Asked Questions (FAQ)

### Does Vajra-Dhir require an internet connection or subscription?
No. Core schematic capture, PCB layout, 45° routing, SPICE simulation (`ngspice`), Z3 verification, Gerber export, and the offline AI planner all run locally on your machine with `$0` ongoing cost.

### Where are my projects and settings stored?
- **Installed / Standard mode:** User projects default to `~/VajraDhirProjects/` (configurable in Settings), with settings under OS app config directories.
- **Portable USB / Folder mode:** Launch with `--portable` to keep settings, cache, encrypted BYOK vault (`.vault.enc`), offline packs, and projects completely self-contained inside `.vd-portable/`.

### Can the AI assistant move my locked connectors or traces?
No. Entities locked with `L` trigger a strict fail-closed database block (`KERNEL_LOCK_VIOLATION`). AI suggestions affecting locked items appear only as non-destructive **Violet Ghost** proposals for you to accept or reject.

### How does KiCad integration stay license-safe?
Vajra-Dhir parses KiCad S-expressions cleanly in-process without importing GPL `pcbnew` libraries, and runs `kicad-cli` / optional `KiKit` strictly in isolated child subprocesses.
