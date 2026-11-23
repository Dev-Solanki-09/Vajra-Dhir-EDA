use vd_solver_recovery::*;

#[test]
fn test_spice_transient_recovery_ladder() {
    let error_log = "Error: timestep too small in transient analysis at time 1.452e-06 s; singular matrix at node V(SW)";
    let plan = SolverRecoveryMiddleware::plan_spice_recovery(error_log).expect("Failed to plan SPICE recovery");

    assert_eq!(plan.domain, SolverDomain::SpiceTransient);
    assert_eq!(plan.actions.len(), 5);
    assert_eq!(plan.actions[0].name, "gmin_stepping");
    assert_eq!(plan.actions[1].name, "source_stepping");
    assert_eq!(plan.actions[2].name, "tolerance_relaxation");
    assert_eq!(plan.actions[3].name, "nodeset_preconditioning");
    assert_eq!(plan.actions[4].name, "uic_bypass");
    assert!(plan.actions[2].netlist_snippet.as_ref().unwrap().contains("reltol=0.005"));
}

#[test]
fn test_pr_congestion_recovery_ladder() {
    let error_log = "Fatal: routing capacity exceeded in gcell (14, 28); unroutable pins for net BUS_D4";
    let plan = SolverRecoveryMiddleware::plan_pr_recovery(error_log).expect("Failed to plan P&R recovery");

    assert_eq!(plan.domain, SolverDomain::PlaceAndRoute);
    assert_eq!(plan.actions.len(), 3);
    assert_eq!(plan.actions[0].name, "density_backoff");
    assert_eq!(plan.actions[1].name, "macro_halo_expansion");
    assert_eq!(plan.actions[2].name, "pin_swap_recommendation");
}

#[test]
fn test_mesh_sliver_recovery_ladder() {
    let error_log = "Gmsh error: surface meshing failed; sliver face detected on STEP volume #4";
    let plan = SolverRecoveryMiddleware::plan_mesh_recovery(error_log).expect("Failed to plan Mesh recovery");

    assert_eq!(plan.domain, SolverDomain::FemMeshGmsh);
    assert_eq!(plan.actions.len(), 2);
    assert_eq!(plan.actions[0].name, "micro_feature_defeaturing");
    assert_eq!(plan.actions[1].name, "adaptive_boundary_refinement");
}

#[test]
fn test_unrecognized_error_fails_gracefully() {
    let log = "All operations completed successfully with exit code 0";
    let res = SolverRecoveryMiddleware::plan_spice_recovery(log);
    assert!(res.is_err());
}
