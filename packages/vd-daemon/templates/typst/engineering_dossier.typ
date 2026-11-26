// Vajra-Dhīr EDA — Senior EE Engineering Dossier & Bench Bring-Up Guide
// Apache-2.0 | Live-bound to HW-IR + CasStore outputs from Stages P1..P17.
// Customizing this template in Monaco (P4) regenerates the compiled dossier live.

#let data = json("dossier_data.json")

#set page(
  paper: "a4",
  margin: (x: 16mm, y: 18mm),
  header: [
    #set text(size: 8pt, fill: rgb("#64748B"))
    Vajra-Dhīr EDA — Engineering Signoff Dossier
    #h(1fr)
    Status: *#data.fabrication_status* | Revision: `#data.pcb_sha256.slice(0, 12)`
  ],
  footer: [
    #set text(size: 8pt, fill: rgb("#64748B"))
    `NOT_FABRICATED_0_OF_3` Honesty Stamp
    #h(1fr)
    Generated UTC: #data.generated_at | Page #context counter(page).display()
  ],
)

#set text(font: "DejaVu Sans", size: 9.5pt, fill: rgb("#0F172A"))
#set heading(numbering: "1.")

= Executive System Spec & Purpose
*Project:* #data.project_name (#data.board_dims_mm) \
*Target Architecture:* #data.system_purpose \
*Overall Technical Readiness:* *#data.overall_verdict* \

= Complete Schematics & Pinout Maps
Schematic pages captured from KiCad 10 (`P1`), assembly & polarity pinout callouts rendered from `PcbDraw` (`P16`), cross-referenced against verified component datasheets (`P8`).

= 3D Mechanical & Enclosure Views
Enclosure geometry generated cleanly via CadQuery (`P14`), clash-checked against board 3D bounds (`clash_count = #data.mcad_clash_count`).

= Full EE Team Verification Matrix
#for st in data.stages [
  - *#st.verdict* — #st.stage: #st.detail (`digest: #st.run_sha`)
]

= Shortcomings Caught & Fixed Audit Trail
#for item in data.shortcomings_log [
  - [#item.status] *#item.stage* (`#item.entity`): #item.finding -> #item.resolution
]

= BOM, Cost & Supply-Chain Summary
Total Components: #data.bom_summary.component_count | Unique Lines: #data.bom_summary.line_count | Est. Unit Cost: \$#data.bom_summary.total_usd

= Step-by-Step Bench Bring-Up Checklist & Self-Test Firmware Guide
#for step in data.bringup_steps [
  + *#step.order. #step.title*: #step.instruction (Expected: `#step.expected`)
]

= Cryptographic Integrity Footer
- HW-IR / PCB SHA-256: `#data.pcb_sha256`
- Schematic SHA-256: `#data.sch_sha256`
- Fab Manifest SHA-256: `#data.manifest_sha256`
- Human Gate-8 Signoff: *#data.gate8_status*
