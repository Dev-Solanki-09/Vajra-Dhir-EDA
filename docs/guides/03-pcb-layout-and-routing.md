# Guide 03 — PCB Layout, Human Locks & 45° Routing

## Essential Layout Keys
| Key | Action |
|---|---|
| `G` | Grab / Move selected component |
| `R` | Rotate +90° |
| `Shift+F` | Flip side (`F.Cu <-> B.Cu`) |
| `L` | Toggle Human Lock (fail-closed protection against AI/script overwrites) |
| `X` | Route 45° copper trace |
| `V` | Drop stitching/layer-transition via (flips active copper layer mid-route) |
| `B` | Refill copper pour zones |
| `Space + Drag` / Middle Drag | Smooth viewport pan |
| `Wheel` | Zoom to cursor (`Invert` setting honored) |
| `0` / `F` / `Home` | Zoom to fit entire board |
| `Alt + Hover` | Redline clearance & delta X/Y ruler |

## Protected Placement (Human Locks)
When a part is marked **Locked (`L`)**, automated placement tools, autorouters, and AI assistants cannot modify its coordinates or traces. Instead, any AI proposal targeting a locked component renders strictly as a non-destructive **Violet Ghost** until you inspect and approve or reject it manually.
