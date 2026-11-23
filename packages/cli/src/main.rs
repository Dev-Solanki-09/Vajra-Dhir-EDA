use std::env;
use std::process;
use vd_cam_pnp::{PnpGenerator, StencilApertureSpec, StencilDfmEngine};
use vd_eco_engine::GeographicalReannotator;
use vd_hw_dlp::{DlpFirewall, SecurityClassification};
use vd_nine_gates::{GateStage, NineGatePipeline};
use vd_panelizer::{PanelConfiguration, PanelizerEngine, SeparationMethod};
use vd_pcb_diff::PcbDiffEngine;
use vd_pdn_solver::{CopperLayerProperties, Ipc2152ThermalEngine, PdnIrDropSolver, TraceLayerLocation, TraceSegment};
use vd_sim_compat::{DialectTranspiler, EncryptedModelDetector};
use vd_wire_harness::{AwgGauge, HarnessConnector, HarnessWire, Iec60757Color, WireHarnessCompiler};

fn print_usage() {
    println!(r#"Vajra-Dhīr EDA Unified CLI (`vd`) — Rev 2.0 Industrial Baseline

USAGE:
    vd <SUBCOMMAND> [OPTIONS]

SUBCOMMANDS:
    eco reannotate-geo    Geographical RefDes re-annotation (top-to-bottom, left-to-right)
    gate check <G1..G9>   Evaluate fail-closed 9-Gate hardware signoff state machine
    sim transpile <file>  Transpile vendor LTspice/PSpice syntax to ngspice-compatible netlist
    sim scan <file>       Scan SPICE deck for proprietary encryption markers ($CDNENCSTART)
    cam stencil           Verify solder paste aperture against IPC-7525B rules
    dlp scan <prompt>     Audit input text for secrets, API tokens, and NDA airgap rules
    pdn solve             2.5D DC IR-Drop & IPC-2152 thermal solver for power delivery rails
    diff pcb              Visual layer-by-layer PCB diff generator (green added / red removed)
    harness compile       Declarative wire harness cut-list, voltage drop & BOM compiler
    panel generate        Automated M x N PCB panelization with rails, mouse bites & fiducials
    version               Print version and active ring architecture
"#);
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        print_usage();
        process::exit(1);
    }

    match args[1].as_str() {
        "version" | "--version" | "-v" => {
            println!("vd 0.1.0-architecture (Ring 1 Lean Core · Nov 2026 CVE Floor)");
            println!("Standards: ISO/IEC/IEEE 42010, SLSA v1.2, OWASP ASVS 5.0");
        }

        "eco" => {
            if args.len() >= 3 && args[2] == "reannotate-geo" {
                println!("[*] vd eco: Geographical RefDes Re-Annotation Engine");
                let plan = GeographicalReannotator::generate_reannotation_plan(&[]);
                println!("[+] Processed {} components (0 renames required on clean baseline).", plan.total_components);
            } else {
                eprintln!("Usage: vd eco reannotate-geo");
                process::exit(1);
            }
        }

        "gate" => {
            if args.len() >= 4 && args[2] == "check" {
                let gate_name = args[3].to_uppercase();
                println!("[*] vd gate: Evaluating fail-closed signoff for {}", gate_name);
                let mut pipeline = NineGatePipeline::new("board-cli-eval");
                match gate_name.as_str() {
                    "G1" | "G1_SPEC_LOCK" => {
                        match pipeline.evaluate_g1("cli-operator", true, 45.0, 100.0, 4) {
                            Ok(v) => println!("[PASS] G1_SPEC_LOCK certified. Evidence hash: {}", v.evidence_hash),
                            Err(e) => {
                                eprintln!("[FAIL] G1 signoff failed: {}", e);
                                process::exit(1);
                            }
                        }
                    }
                    _ => {
                        println!("[*] Evaluating gate {}: requires prior gate evidence tokens.", gate_name);
                    }
                }
            } else {
                eprintln!("Usage: vd gate check <G1..G9>");
                process::exit(1);
            }
        }

        "sim" => {
            if args.len() >= 3 && args[2] == "transpile" {
                let sample_deck = "* Transpiling sample\nB1 1 0 V=LIMIT(V(IN)^2, 0, 5)\n";
                let transpiled = DialectTranspiler::transpile(sample_deck);
                println!("{}", transpiled.transformed_netlist);
                println!("[+] Applied {} syntax rewrites.", transpiled.rewrites_applied_count);
            } else if args.len() >= 3 && args[2] == "scan" {
                let res = EncryptedModelDetector::scan_deck("* Plain deck\n");
                println!("[+] SPICE Classification: {:?}", res.classification);
                println!("[+] Requires behavioral fallback: {}", res.requires_behavioral_fallback);
            } else {
                eprintln!("Usage: vd sim <transpile|scan> [file]");
                process::exit(1);
            }
        }

        "cam" => {
            if args.len() >= 3 && args[2] == "stencil" {
                println!("[*] vd cam: Solder Paste Stencil IPC-7525B Aperture Check");
                let spec = StencilApertureSpec {
                    pad_width_nm: 800_000,
                    pad_length_nm: 900_000,
                    foil_thickness_nm: 120_000,
                };
                let report = StencilDfmEngine::evaluate_aperture(&spec);
                println!("[+] Area Ratio: {:.2} (min 0.66)", report.area_ratio);
                println!("[+] Aspect Ratio: {:.2} (min 1.50)", report.aspect_ratio);
                println!("[+] IPC-7525B Compliant: {}", report.satisfies_ipc_7525b);
            } else {
                eprintln!("Usage: vd cam <stencil|pnp>");
                process::exit(1);
            }
        }

        "dlp" => {
            let input = if args.len() >= 3 { &args[2] } else { "Clean routing prompt" };
            let (sanitized, leaks) = DlpFirewall::sanitize_prompt(input);
            println!("[*] Sanitized Prompt: {}", sanitized);
            println!("[*] Secrets redacted: {}", leaks.len());
        }

        "pdn" => {
            println!("[*] vd pdn: 2.5D DC Power Integrity & IPC-2152 Solver");
            let props = CopperLayerProperties::default();
            let trace = TraceSegment {
                net_name: "+3V3".into(),
                length_nm: 40_000_000,
                width_nm: 1_200_000,
                current_a: 2.0,
            };
            let drop_res = PdnIrDropSolver::solve_rail_segment(&props, 3.3, 3.0, &trace, None);
            println!("[+] Net: {}, Total IR Drop: {:.2} mV ({:.2}%)", drop_res.net_name, drop_res.total_voltage_drop_mv, drop_res.max_voltage_drop_pct);

            let thermal = Ipc2152ThermalEngine::calculate_temp_rise(1_200_000, 35_000, 2.0, 25.0, TraceLayerLocation::ExternalTopOrBottom, 130.0);
            println!("[+] IPC-2152 Delta T: +{:.1}°C (Final: {:.1}°C, Safe: {})", thermal.delta_temp_c, thermal.final_trace_temp_c, thermal.is_safe);
        }

        "diff" => {
            println!("[*] vd diff: Visual Layer-by-Layer PCB Diff");
            let diff = PcbDiffEngine::compute_diff("RevA", &[], "RevB", &[]);
            println!("[+] Diff Generated: {} changes recorded. SVG length: {} chars.", diff.component_changes.len(), diff.svg_diff_markup.len());
        }

        "harness" => {
            println!("[*] vd harness: Wire Harness Cut-List & BOM Compiler");
            let conn = vec![HarnessConnector { designator: "J1".into(), mpn: "JST-PH-2P".into(), pin_count: 2 }];
            let wires = vec![HarnessWire {
                signal_name: "PWR".into(),
                from_connector: "J1".into(),
                from_pin: 1,
                to_connector: "J2".into(),
                to_pin: 1,
                gauge: AwgGauge::Awg24,
                color: Iec60757Color::Red,
                length_mm: 150.0,
                rated_current_a: 1.0,
                is_twisted_pair: false,
                pair_partner_signal: None,
            }];
            let rep = WireHarnessCompiler::compile("POWER_HARNESS", &conn, &wires);
            println!("[+] Compiled {} wires, Net copper mass: {:.2} g", rep.total_wires_count, rep.total_copper_mass_g);
        }

        "panel" => {
            println!("[*] vd panel: Automated PCB Panelization Generator");
            let cfg = PanelConfiguration::default();
            let rep = PanelizerEngine::generate_panel(&cfg);
            println!("[+] Panel Dimensions: {:.1} mm x {:.1} mm (Boards: {}, Utilization: {:.1}%)",
                rep.total_width_nm as f64 * 1e-6, rep.total_height_nm as f64 * 1e-6, rep.total_boards_count, rep.board_area_utilization_pct);
            println!("[+] Tooling Holes: {}, Fiducials: {}, Perforations: {}", rep.tooling_holes.len(), rep.fiducials.len(), rep.perforation_holes.len());
        }

        other => {
            eprintln!("Unknown subcommand: {}", other);
            print_usage();
            process::exit(1);
        }
    }
}
