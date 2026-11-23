//! Vajra-Dhīr EDA — Solver Recovery Middleware (`vd-solver-recovery`)
//!
//! Provides automated, deterministic ladder recovery when physics and EDA engines encounter
//! convergence or geometric failures, avoiding unguided LLM retry loops:
//! 1. SPICE Ladder: gmin stepping -> src stepping -> tolerance relaxation -> .nodeset -> uic bypass.
//! 2. P&R Ladder: utilization density backoff -> macro halo expansion -> pin swap.
//! 3. 3D Mesh Ladder: STEP micro-feature defeaturing -> boundary refinement.

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum RecoveryError {
    #[error("Solver recovery exhausted: all {0} ladder steps failed to resolve error: {1}")]
    LadderExhausted(usize, String),
    #[error("Unknown solver error pattern: {0}")]
    UnrecognizedError(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SolverDomain {
    SpiceTransient,
    SpiceOperatingPoint,
    PlaceAndRoute,
    FemMeshGmsh,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryAction {
    pub step: usize,
    pub name: String,
    pub description: String,
    pub parameter_delta: String,
    pub netlist_snippet: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryPlan {
    pub domain: SolverDomain,
    pub detected_root_cause: String,
    pub actions: Vec<RecoveryAction>,
}

pub struct SolverRecoveryMiddleware;

impl SolverRecoveryMiddleware {
    /// Evaluates SPICE error logs and builds deterministic multi-step recovery sequence
    pub fn plan_spice_recovery(log: &str) -> Result<RecoveryPlan, RecoveryError> {
        let log_lower = log.to_lowercase();

        if log_lower.contains("timestep too small")
            || log_lower.contains("no convergence in transient")
            || log_lower.contains("internal timestep control error")
            || log_lower.contains("singular matrix")
        {
            let actions = vec![
                RecoveryAction {
                    step: 1,
                    name: "gmin_stepping".into(),
                    description: "Increase minimal conductance to eliminate floating-node singularities".into(),
                    parameter_delta: "gmin=1e-8".into(),
                    netlist_snippet: Some(".options gmin=1e-8".into()),
                },
                RecoveryAction {
                    step: 2,
                    name: "source_stepping".into(),
                    description: "Enable DC operating point source ramp stepping".into(),
                    parameter_delta: "srcsteps=10".into(),
                    netlist_snippet: Some(".options srcsteps=10".into()),
                },
                RecoveryAction {
                    step: 3,
                    name: "tolerance_relaxation".into(),
                    description: "Relax relative and absolute convergence tolerances within 0.5% margin".into(),
                    parameter_delta: "reltol=0.005 abstol=1e-10 chgtol=1e-14".into(),
                    netlist_snippet: Some(".options reltol=0.005 abstol=1e-10 chgtol=1e-14".into()),
                },
                RecoveryAction {
                    step: 4,
                    name: "nodeset_preconditioning".into(),
                    description: "Pre-seed initial voltage estimates on high-impedance nets".into(),
                    parameter_delta: "nodeset_ramp=true".into(),
                    netlist_snippet: Some(".nodeset V(SW)=0 V(OUT)=0".into()),
                },
                RecoveryAction {
                    step: 5,
                    name: "uic_bypass".into(),
                    description: "Bypass initial operating point solve and start transient from zero initial conditions".into(),
                    parameter_delta: "uic=true".into(),
                    netlist_snippet: Some(".tran 10n 5m uic".into()),
                },
            ];

            Ok(RecoveryPlan {
                domain: SolverDomain::SpiceTransient,
                detected_root_cause: "SPICE non-linear transient convergence failure (stiff ODE or high dV/dt)".into(),
                actions,
            })
        } else {
            Err(RecoveryError::UnrecognizedError(log.to_string()))
        }
    }

    /// Evaluates P&R congestion and routing overflow logs
    pub fn plan_pr_recovery(log: &str) -> Result<RecoveryPlan, RecoveryError> {
        let log_lower = log.to_lowercase();

        if log_lower.contains("congestion")
            || log_lower.contains("unroutable")
            || log_lower.contains("overflow in gcell")
            || log_lower.contains("routing capacity exceeded")
        {
            let actions = vec![
                RecoveryAction {
                    step: 1,
                    name: "density_backoff".into(),
                    description: "Reduce target placement density from 70% to 55% to alleviate congestion corridors".into(),
                    parameter_delta: "target_density=0.55".into(),
                    netlist_snippet: None,
                },
                RecoveryAction {
                    step: 2,
                    name: "macro_halo_expansion".into(),
                    description: "Expand keepout halos around dense QFN/BGA macros by 2x track pitch".into(),
                    parameter_delta: "macro_halo_um=25.0".into(),
                    netlist_snippet: None,
                },
                RecoveryAction {
                    step: 3,
                    name: "pin_swap_recommendation".into(),
                    description: "Trigger Z3 pinmux solver to untangle criss-crossing bus nets on MCU headers".into(),
                    parameter_delta: "run_z3_pinmux_optimization=true".into(),
                    netlist_snippet: None,
                },
            ];

            Ok(RecoveryPlan {
                domain: SolverDomain::PlaceAndRoute,
                detected_root_cause: "Routing channel congestion overflow".into(),
                actions,
            })
        } else {
            Err(RecoveryError::UnrecognizedError(log.to_string()))
        }
    }

    /// Evaluates 3D FEM meshing failure logs (Gmsh / ElmerFEM)
    pub fn plan_mesh_recovery(log: &str) -> Result<RecoveryPlan, RecoveryError> {
        let log_lower = log.to_lowercase();

        if log_lower.contains("surface meshing failed")
            || log_lower.contains("zero volume element")
            || log_lower.contains("self-intersecting")
            || log_lower.contains("sliver face")
        {
            let actions = vec![
                RecoveryAction {
                    step: 1,
                    name: "micro_feature_defeaturing".into(),
                    description: "Suppress non-structural chamfers and fillets < 0.1mm that cause triangular slivers".into(),
                    parameter_delta: "min_feature_size_mm=0.10".into(),
                    netlist_snippet: None,
                },
                RecoveryAction {
                    step: 2,
                    name: "adaptive_boundary_refinement".into(),
                    description: "Subdivide sharp edge boundaries with Delaunay 2D refinement before 3D tetrahedralization".into(),
                    parameter_delta: "mesh_algorithm=frontal_delaunay_3d".into(),
                    netlist_snippet: None,
                },
            ];

            Ok(RecoveryPlan {
                domain: SolverDomain::FemMeshGmsh,
                detected_root_cause: "3D STEP CAD microscopic sliver geometry causing degenerate mesh elements".into(),
                actions,
            })
        } else {
            Err(RecoveryError::UnrecognizedError(log.to_string()))
        }
    }
}
