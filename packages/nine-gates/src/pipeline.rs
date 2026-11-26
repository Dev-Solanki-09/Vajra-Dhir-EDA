use crate::gates::*;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum GatePipelineError {
    #[error("Precondition failed: Gate {required:?} must pass before evaluating Gate {target:?}")]
    PreconditionUnmet {
        required: GateStage,
        target: GateStage,
    },

    #[error("Gate {gate:?} failed signoff: {reason}")]
    GateFailed {
        gate: GateStage,
        reason: String,
        recommendations: Vec<String>,
    },
}

#[derive(Debug, Clone)]
pub struct NineGatePipeline {
    board_id: String,
    passed_verdicts: BTreeMap<GateStage, GateVerdict>,
}

impl NineGatePipeline {
    pub fn new(board_id: &str) -> Self {
        Self {
            board_id: board_id.to_string(),
            passed_verdicts: BTreeMap::new(),
        }
    }

    pub fn is_gate_passed(&self, gate: GateStage) -> bool {
        self.passed_verdicts.get(&gate).map(|v| v.passed).unwrap_or(false)
    }

    pub fn highest_passed_gate(&self) -> Option<GateStage> {
        self.passed_verdicts.keys().copied().max()
    }

    pub fn all_verdicts(&self) -> Vec<&GateVerdict> {
        self.passed_verdicts.values().collect()
    }

    /// Evaluates G1: Requirement Envelope & Human Spec Lock
    pub fn evaluate_g1(
        &mut self,
        auditor_id: &str,
        spec_locked_by_human: bool,
        target_budget_usd: f64,
        max_allowed_budget_usd: f64,
        layer_count: u32,
    ) -> Result<&GateVerdict, GatePipelineError> {
        let mut findings = Vec::new();
        let mut recommendations = Vec::new();
        let mut metrics = BTreeMap::new();
        metrics.insert("target_budget_usd".into(), target_budget_usd);
        metrics.insert("layer_count".into(), layer_count as f64);

        if !spec_locked_by_human {
            findings.push("Specification is not locked by human architect.".into());
            recommendations.push("Obtain explicit human lock signoff before triggering synthesis.".into());
        }

        if target_budget_usd > max_allowed_budget_usd {
            findings.push(format!(
                "Target BOM budget ${:.2} exceeds project maximum ${:.2}.",
                target_budget_usd, max_allowed_budget_usd
            ));
            recommendations.push("Optimize component selection in budget.json to lower unit cost.".into());
        }

        if layer_count == 0 || !layer_count.is_multiple_of(2) {
            findings.push(format!("Invalid PCB layer count: {} (must be even and >= 2).", layer_count));
            recommendations.push("Set layer count to standard 2, 4, 6, or 8 layers.".into());
        }

        let passed = findings.is_empty();
        let evidence_hash = Self::hash_evidence(&self.board_id, GateStage::G1SpecLock, &findings);

        let verdict = GateVerdict {
            gate: GateStage::G1SpecLock,
            passed,
            timestamp_utc: "2026-11-23T00:00:00Z".into(),
            auditor_id: auditor_id.to_string(),
            evidence_hash,
            metrics,
            findings: findings.clone(),
            recovery_recommendations: recommendations.clone(),
        };

        if passed {
            self.passed_verdicts.insert(GateStage::G1SpecLock, verdict);
            Ok(self.passed_verdicts.get(&GateStage::G1SpecLock).unwrap())
        } else {
            Err(GatePipelineError::GateFailed {
                gate: GateStage::G1SpecLock,
                reason: findings.join("; "),
                recommendations,
            })
        }
    }

    /// Evaluates G2: Schematic Formal Netlist & Electrical Rules
    pub fn evaluate_g2(
        &mut self,
        auditor_id: &str,
        unconnected_nets_count: usize,
        power_short_detected: bool,
        multi_driver_contention_count: usize,
    ) -> Result<&GateVerdict, GatePipelineError> {
        if !self.is_gate_passed(GateStage::G1SpecLock) {
            return Err(GatePipelineError::PreconditionUnmet {
                required: GateStage::G1SpecLock,
                target: GateStage::G2SchematicFormal,
            });
        }

        let mut findings = Vec::new();
        let mut recommendations = Vec::new();
        let mut metrics = BTreeMap::new();
        metrics.insert("unconnected_nets".into(), unconnected_nets_count as f64);
        metrics.insert("multi_driver_contentions".into(), multi_driver_contention_count as f64);

        if power_short_detected {
            findings.push("CRITICAL: Direct short circuit detected between power and ground rails.".into());
            recommendations.push("Isolate VDD/VCC net from GND; inspect netlist labels.".into());
        }

        if unconnected_nets_count > 0 {
            findings.push(format!("Detected {} unconnected net stubs.", unconnected_nets_count));
            recommendations.push("Verify all nets are either connected or explicitly marked with No-Connect flags.".into());
        }

        if multi_driver_contention_count > 0 {
            findings.push(format!("Detected {} active push-pull output driver contentions.", multi_driver_contention_count));
            recommendations.push("Ensure high-impedance tri-state or open-drain logic on shared bus lines.".into());
        }

        let passed = findings.is_empty();
        let evidence_hash = Self::hash_evidence(&self.board_id, GateStage::G2SchematicFormal, &findings);

        let verdict = GateVerdict {
            gate: GateStage::G2SchematicFormal,
            passed,
            timestamp_utc: "2026-11-23T00:00:00Z".into(),
            auditor_id: auditor_id.to_string(),
            evidence_hash,
            metrics,
            findings: findings.clone(),
            recovery_recommendations: recommendations.clone(),
        };

        if passed {
            self.passed_verdicts.insert(GateStage::G2SchematicFormal, verdict);
            Ok(self.passed_verdicts.get(&GateStage::G2SchematicFormal).unwrap())
        } else {
            Err(GatePipelineError::GateFailed {
                gate: GateStage::G2SchematicFormal,
                reason: findings.join("; "),
                recommendations,
            })
        }
    }

    /// Evaluates G3: Physics Sanity & 10 EE Footguns
    pub fn evaluate_g3(
        &mut self,
        auditor_id: &str,
        footgun_findings: &[vd_symbolic_verifier::FootgunFinding],
    ) -> Result<&GateVerdict, GatePipelineError> {
        if !self.is_gate_passed(GateStage::G2SchematicFormal) {
            return Err(GatePipelineError::PreconditionUnmet {
                required: GateStage::G2SchematicFormal,
                target: GateStage::G3PhysicsSanity,
            });
        }

        let mut findings = Vec::new();
        let mut recommendations = Vec::new();
        let mut fatal_count = 0;
        let mut error_count = 0;

        for fg in footgun_findings {
            match fg.severity {
                vd_symbolic_verifier::FindingSeverity::Fatal => {
                    fatal_count += 1;
                    findings.push(format!("[FATAL] {}: {}", fg.title, fg.explanation));
                    recommendations.push(fg.remedy.clone());
                }
                vd_symbolic_verifier::FindingSeverity::Error => {
                    error_count += 1;
                    findings.push(format!("[ERROR] {}: {}", fg.title, fg.explanation));
                    recommendations.push(fg.remedy.clone());
                }
                vd_symbolic_verifier::FindingSeverity::Warning => {
                    findings.push(format!("[WARNING] {}: {}", fg.title, fg.explanation));
                }
                vd_symbolic_verifier::FindingSeverity::Advisory => {}
            }
        }

        let mut metrics = BTreeMap::new();
        metrics.insert("fatal_footgun_count".into(), fatal_count as f64);
        metrics.insert("error_footgun_count".into(), error_count as f64);

        let passed = fatal_count == 0 && error_count == 0;
        let evidence_hash = Self::hash_evidence(&self.board_id, GateStage::G3PhysicsSanity, &findings);

        let verdict = GateVerdict {
            gate: GateStage::G3PhysicsSanity,
            passed,
            timestamp_utc: "2026-11-23T00:00:00Z".into(),
            auditor_id: auditor_id.to_string(),
            evidence_hash,
            metrics,
            findings: findings.clone(),
            recovery_recommendations: recommendations.clone(),
        };

        if passed {
            self.passed_verdicts.insert(GateStage::G3PhysicsSanity, verdict);
            Ok(self.passed_verdicts.get(&GateStage::G3PhysicsSanity).unwrap())
        } else {
            Err(GatePipelineError::GateFailed {
                gate: GateStage::G3PhysicsSanity,
                reason: format!("Triggered {} fatal and {} error EE footguns.", fatal_count, error_count),
                recommendations,
            })
        }
    }

    /// Evaluates G4: Placement Convergence & Courtyard Clearance
    pub fn evaluate_g4(
        &mut self,
        auditor_id: &str,
        overlap_violations_count: usize,
        max_decoupling_distance_mm: f64,
        thermal_density_ok: bool,
    ) -> Result<&GateVerdict, GatePipelineError> {
        if !self.is_gate_passed(GateStage::G3PhysicsSanity) {
            return Err(GatePipelineError::PreconditionUnmet {
                required: GateStage::G3PhysicsSanity,
                target: GateStage::G4PlacementSolved,
            });
        }

        let mut findings = Vec::new();
        let mut recommendations = Vec::new();

        if overlap_violations_count > 0 {
            findings.push(format!("Detected {} component courtyard overlapping collisions.", overlap_violations_count));
            recommendations.push("Run Simulated Annealing placer with higher overlap penalty or expand board area.".into());
        }

        if max_decoupling_distance_mm > 2.0 {
            findings.push(format!("Max decoupling capacitor distance is {:.2} mm (exceeds 2.0 mm limit).", max_decoupling_distance_mm));
            recommendations.push("Move bypass capacitors directly adjacent to IC power pins.".into());
        }

        if !thermal_density_ok {
            findings.push("Thermal clustering hotspot detected: high-dissipation ICs are too closely placed.".into());
            recommendations.push("Distribute heat-generating power devices across the board surface.".into());
        }

        let passed = findings.is_empty();
        let evidence_hash = Self::hash_evidence(&self.board_id, GateStage::G4PlacementSolved, &findings);

        let verdict = GateVerdict {
            gate: GateStage::G4PlacementSolved,
            passed,
            timestamp_utc: "2026-11-23T00:00:00Z".into(),
            auditor_id: auditor_id.to_string(),
            evidence_hash,
            metrics: {
                let mut m = BTreeMap::new();
                m.insert("overlap_violations".into(), overlap_violations_count as f64);
                m.insert("max_decouple_dist_mm".into(), max_decoupling_distance_mm);
                m
            },
            findings: findings.clone(),
            recovery_recommendations: recommendations.clone(),
        };

        if passed {
            self.passed_verdicts.insert(GateStage::G4PlacementSolved, verdict);
            Ok(self.passed_verdicts.get(&GateStage::G4PlacementSolved).unwrap())
        } else {
            Err(GatePipelineError::GateFailed {
                gate: GateStage::G4PlacementSolved,
                reason: findings.join("; "),
                recommendations,
            })
        }
    }

    /// Evaluates G5: 100% Routing Completion & Differential Pair Constraints
    pub fn evaluate_g5(
        &mut self,
        auditor_id: &str,
        unrouted_airwires_count: usize,
        diff_pair_skew_ps: f64,
        max_allowed_skew_ps: f64,
    ) -> Result<&GateVerdict, GatePipelineError> {
        if !self.is_gate_passed(GateStage::G4PlacementSolved) {
            return Err(GatePipelineError::PreconditionUnmet {
                required: GateStage::G4PlacementSolved,
                target: GateStage::G5RoutingComplete,
            });
        }

        let mut findings = Vec::new();
        let mut recommendations = Vec::new();

        if unrouted_airwires_count > 0 {
            findings.push(format!("Incomplete routing: {} unrouted connections remain.", unrouted_airwires_count));
            recommendations.push("Run negotiation router or rip-up and retry on congested channels.".into());
        }

        if diff_pair_skew_ps > max_allowed_skew_ps {
            findings.push(format!("Differential pair skew {:.2} ps exceeds max limit {:.2} ps.", diff_pair_skew_ps, max_allowed_skew_ps));
            recommendations.push("Apply serpentine delay accordion tuning to match differential trace lengths.".into());
        }

        let passed = findings.is_empty();
        let evidence_hash = Self::hash_evidence(&self.board_id, GateStage::G5RoutingComplete, &findings);

        let verdict = GateVerdict {
            gate: GateStage::G5RoutingComplete,
            passed,
            timestamp_utc: "2026-11-23T00:00:00Z".into(),
            auditor_id: auditor_id.to_string(),
            evidence_hash,
            metrics: {
                let mut m = BTreeMap::new();
                m.insert("unrouted_airwires".into(), unrouted_airwires_count as f64);
                m.insert("diff_pair_skew_ps".into(), diff_pair_skew_ps);
                m
            },
            findings: findings.clone(),
            recovery_recommendations: recommendations.clone(),
        };

        if passed {
            self.passed_verdicts.insert(GateStage::G5RoutingComplete, verdict);
            Ok(self.passed_verdicts.get(&GateStage::G5RoutingComplete).unwrap())
        } else {
            Err(GatePipelineError::GateFailed {
                gate: GateStage::G5RoutingComplete,
                reason: findings.join("; "),
                recommendations,
            })
        }
    }

    /// Evaluates G6: Exact Polygon Physical DRC
    pub fn evaluate_g6(
        &mut self,
        auditor_id: &str,
        clearance_violations_count: usize,
        min_width_violations_count: usize,
        annular_ring_violations_count: usize,
    ) -> Result<&GateVerdict, GatePipelineError> {
        if !self.is_gate_passed(GateStage::G5RoutingComplete) {
            return Err(GatePipelineError::PreconditionUnmet {
                required: GateStage::G5RoutingComplete,
                target: GateStage::G6PhysicalDrc,
            });
        }

        let mut findings = Vec::new();
        let mut recommendations = Vec::new();

        if clearance_violations_count > 0 {
            findings.push(format!("{} copper clearance violations detected.", clearance_violations_count));
            recommendations.push("Nudge traces or increase spacing to satisfy fab DRC clearance rules.".into());
        }

        if min_width_violations_count > 0 {
            findings.push(format!("{} trace min-width violations detected.", min_width_violations_count));
            recommendations.push("Upsize narrow trace segments to minimum fab allowable width.".into());
        }

        if annular_ring_violations_count > 0 {
            findings.push(format!("{} annular ring breakout violations detected.", annular_ring_violations_count));
            recommendations.push("Enlarge via pad diameter or decrease via drill size.".into());
        }

        let passed = findings.is_empty();
        let evidence_hash = Self::hash_evidence(&self.board_id, GateStage::G6PhysicalDrc, &findings);

        let verdict = GateVerdict {
            gate: GateStage::G6PhysicalDrc,
            passed,
            timestamp_utc: "2026-11-23T00:00:00Z".into(),
            auditor_id: auditor_id.to_string(),
            evidence_hash,
            metrics: {
                let mut m = BTreeMap::new();
                m.insert("clearance_violations".into(), clearance_violations_count as f64);
                m.insert("min_width_violations".into(), min_width_violations_count as f64);
                m
            },
            findings: findings.clone(),
            recovery_recommendations: recommendations.clone(),
        };

        if passed {
            self.passed_verdicts.insert(GateStage::G6PhysicalDrc, verdict);
            Ok(self.passed_verdicts.get(&GateStage::G6PhysicalDrc).unwrap())
        } else {
            Err(GatePipelineError::GateFailed {
                gate: GateStage::G6PhysicalDrc,
                reason: findings.join("; "),
                recommendations,
            })
        }
    }

    /// Evaluates G7: Signal & Power Integrity (SI/PI)
    pub fn evaluate_g7(
        &mut self,
        auditor_id: &str,
        max_ir_drop_pct: f64,
        max_impedance_deviation_pct: f64,
    ) -> Result<&GateVerdict, GatePipelineError> {
        if !self.is_gate_passed(GateStage::G6PhysicalDrc) {
            return Err(GatePipelineError::PreconditionUnmet {
                required: GateStage::G6PhysicalDrc,
                target: GateStage::G7SignalPowerIntegrity,
            });
        }

        let mut findings = Vec::new();
        let mut recommendations = Vec::new();

        if max_ir_drop_pct > 3.0 {
            findings.push(format!("DC IR drop on power rail is {:.2}%, exceeding 3.0% limit.", max_ir_drop_pct));
            recommendations.push("Widen power copper pours, add stitching vias, or add power planes.".into());
        }

        if max_impedance_deviation_pct > 10.0 {
            findings.push(format!("Controlled impedance deviation is {:.2}%, exceeding +/-10% target.", max_impedance_deviation_pct));
            recommendations.push("Adjust trace width or reference dielectric height in stackup.".into());
        }

        let passed = findings.is_empty();
        let evidence_hash = Self::hash_evidence(&self.board_id, GateStage::G7SignalPowerIntegrity, &findings);

        let verdict = GateVerdict {
            gate: GateStage::G7SignalPowerIntegrity,
            passed,
            timestamp_utc: "2026-11-23T00:00:00Z".into(),
            auditor_id: auditor_id.to_string(),
            evidence_hash,
            metrics: {
                let mut m = BTreeMap::new();
                m.insert("max_ir_drop_pct".into(), max_ir_drop_pct);
                m.insert("max_z0_dev_pct".into(), max_impedance_deviation_pct);
                m
            },
            findings: findings.clone(),
            recovery_recommendations: recommendations.clone(),
        };

        if passed {
            self.passed_verdicts.insert(GateStage::G7SignalPowerIntegrity, verdict);
            Ok(self.passed_verdicts.get(&GateStage::G7SignalPowerIntegrity).unwrap())
        } else {
            Err(GatePipelineError::GateFailed {
                gate: GateStage::G7SignalPowerIntegrity,
                reason: findings.join("; "),
                recommendations,
            })
        }
    }

    /// Evaluates G8: Manufacturing CAM (Gerber X3 / IPC-2581C)
    pub fn evaluate_g8(
        &mut self,
        auditor_id: &str,
        gerber_layers_generated: usize,
        expected_layers: usize,
        drill_table_synchronized: bool,
    ) -> Result<&GateVerdict, GatePipelineError> {
        if !self.is_gate_passed(GateStage::G7SignalPowerIntegrity) {
            return Err(GatePipelineError::PreconditionUnmet {
                required: GateStage::G7SignalPowerIntegrity,
                target: GateStage::G8ManufacturingCam,
            });
        }

        let mut findings = Vec::new();
        let mut recommendations = Vec::new();

        if gerber_layers_generated < expected_layers {
            findings.push(format!("CAM export incomplete: generated {} layers out of {} required.", gerber_layers_generated, expected_layers));
            recommendations.push("Regenerate missing solder mask, silkscreen, or copper Gerber layers.".into());
        }

        if !drill_table_synchronized {
            findings.push("Excellon drill table does not match PCB drill diameter entities.".into());
            recommendations.push("Regenerate drill files with deterministic tool numbering.".into());
        }

        let passed = findings.is_empty();
        let evidence_hash = Self::hash_evidence(&self.board_id, GateStage::G8ManufacturingCam, &findings);

        let verdict = GateVerdict {
            gate: GateStage::G8ManufacturingCam,
            passed,
            timestamp_utc: "2026-11-23T00:00:00Z".into(),
            auditor_id: auditor_id.to_string(),
            evidence_hash,
            metrics: {
                let mut m = BTreeMap::new();
                m.insert("gerber_layers_count".into(), gerber_layers_generated as f64);
                m
            },
            findings: findings.clone(),
            recovery_recommendations: recommendations.clone(),
        };

        if passed {
            self.passed_verdicts.insert(GateStage::G8ManufacturingCam, verdict);
            Ok(self.passed_verdicts.get(&GateStage::G8ManufacturingCam).unwrap())
        } else {
            Err(GatePipelineError::GateFailed {
                gate: GateStage::G8ManufacturingCam,
                reason: findings.join("; "),
                recommendations,
            })
        }
    }

    /// Evaluates G9: Bench Hardware-In-The-Loop / Digital-Analog Co-Simulation
    pub fn evaluate_g9(
        &mut self,
        auditor_id: &str,
        firmware_boot_verified: bool,
        analog_rail_settled: bool,
    ) -> Result<&GateVerdict, GatePipelineError> {
        if !self.is_gate_passed(GateStage::G8ManufacturingCam) {
            return Err(GatePipelineError::PreconditionUnmet {
                required: GateStage::G8ManufacturingCam,
                target: GateStage::G9BenchHil,
            });
        }

        let mut findings = Vec::new();
        let mut recommendations = Vec::new();

        if !firmware_boot_verified {
            findings.push("Renode firmware simulation failed: MCU did not reach main() within 500ms timeout.".into());
            recommendations.push("Check clock configuration, reset circuitry, and vector table alignment.".into());
        }

        if !analog_rail_settled {
            findings.push("SPICE analog co-simulation failed: power rail ringing or instability detected.".into());
            recommendations.push("Tune feedback loop compensation network or add bulk capacitor damping.".into());
        }

        let passed = findings.is_empty();
        let evidence_hash = Self::hash_evidence(&self.board_id, GateStage::G9BenchHil, &findings);

        let verdict = GateVerdict {
            gate: GateStage::G9BenchHil,
            passed,
            timestamp_utc: "2026-11-23T00:00:00Z".into(),
            auditor_id: auditor_id.to_string(),
            evidence_hash,
            metrics: BTreeMap::new(),
            findings: findings.clone(),
            recovery_recommendations: recommendations.clone(),
        };

        if passed {
            self.passed_verdicts.insert(GateStage::G9BenchHil, verdict);
            Ok(self.passed_verdicts.get(&GateStage::G9BenchHil).unwrap())
        } else {
            Err(GatePipelineError::GateFailed {
                gate: GateStage::G9BenchHil,
                reason: findings.join("; "),
                recommendations,
            })
        }
    }

    fn hash_evidence(board_id: &str, gate: GateStage, findings: &[String]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(board_id.as_bytes());
        hasher.update([gate as u8]);
        for f in findings {
            hasher.update(f.as_bytes());
        }
        format!("{:x}", hasher.finalize())
    }
}
