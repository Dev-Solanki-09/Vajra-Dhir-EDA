# Tool Packs & Storage Architecture

Vajra-Dhir keeps the Git source repository lean (`< 150 MB`) by downloading large tool binaries, KiCad library packs, and optional simulation engines outside Git into your local **Data Directory**.

## Storage Locations
- **Portable Mode (`--portable`):** `.vd-portable/{config, data, cache, projects}`
- **Standard OS Mode:** OS AppData / XDG directories (`~/.config/vajra-dhir`, `~/.local/share/vajra-dhir`, `~/VajraDhirProjects`)

## Managing Packs Offline & Garbage Collection
- Open **Home -> Environment** to check free disk space, download progress (`MB/s` + ETA), and SHA-256 verification status.
- For air-gapped workstations, pre-download release archives from `Vajra-Dhir-Packs` and click **Import Offline Archive**.
- Click **Prune CAS & Cache** to safely clean stale build caches while keeping pinned tool packs intact.
