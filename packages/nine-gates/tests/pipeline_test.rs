use vd_nine_gates::*;
use vd_symbolic_verifier::{FindingSeverity, FootgunFinding, FootgunKind};

#[test]
fn test_precondition_unmet_fails_closed() {
    let mut pipeline = NineGatePipeline::new("board-uuid-123");
    // Trying to evaluate G2 without G1 passing must fail closed
    let res = pipeline.evaluate_g2("auditor-agent", 0, false, 0);
    assert!(res.is_err());
    match res.unwrap_err() {
        GatePipelineError::PreconditionUnmet { required, target } => {
            assert_eq!(required, GateStage::G1SpecLock);
            assert_eq!(target, GateStage::G2SchematicFormal);
        }
        _ => panic!("Expected PreconditionUnmet error"),
    }
}

#[test]
fn test_g1_fails_when_not_locked_by_human() {
    let mut pipeline = NineGatePipeline::new("board-uuid-123");
    let res = pipeline.evaluate_g1("auditor-agent", false, 50.0, 100.0, 4);
    assert!(res.is_err());
    assert!(!pipeline.is_gate_passed(GateStage::G1SpecLock));
}

#[test]
fn test_g3_fails_when_fatal_footgun_present() {
    let mut pipeline = NineGatePipeline::new("board-uuid-123");
    // Pass G1
    let g1 = pipeline.evaluate_g1("human-architect", true, 45.0, 100.0, 4);
    assert!(g1.is_ok());

    // Pass G2
    let g2 = pipeline.evaluate_g2("auditor-formal", 0, false, 0);
    assert!(g2.is_ok());

    // Evaluate G3 with a fatal inductor saturation footgun
    let footguns = vec![FootgunFinding {
        kind: FootgunKind::Fg02InductorSaturation,
        severity: FindingSeverity::Fatal,
        title: "Inductor Core Saturation".into(),
        affected_entities: vec!["L1".into()],
        explanation: "Peak current 3A > Isat 2A".into(),
        remedy: "Upgrade inductor to 4A Isat".into(),
        mathematical_proof: "3.0A > 2.0A".into(),
    }];

    let g3 = pipeline.evaluate_g3("auditor-physics", &footguns);
    assert!(g3.is_err());
    assert!(!pipeline.is_gate_passed(GateStage::G3PhysicsSanity));

    // Progression to G4 must be blocked
    let g4 = pipeline.evaluate_g4("auditor-placer", 0, 1.2, true);
    assert!(g4.is_err());
}

#[test]
fn test_full_9_gate_progression_clean_pass() {
    let mut pipeline = NineGatePipeline::new("board-uuid-clean");

    // G1
    assert!(pipeline.evaluate_g1("human", true, 25.0, 50.0, 4).is_ok());
    assert!(pipeline.is_gate_passed(GateStage::G1SpecLock));

    // G2
    assert!(pipeline.evaluate_g2("auditor-2", 0, false, 0).is_ok());
    assert!(pipeline.is_gate_passed(GateStage::G2SchematicFormal));

    // G3 (empty footguns)
    assert!(pipeline.evaluate_g3("auditor-3", &[]).is_ok());
    assert!(pipeline.is_gate_passed(GateStage::G3PhysicsSanity));

    // G4
    assert!(pipeline.evaluate_g4("auditor-4", 0, 1.5, true).is_ok());
    assert!(pipeline.is_gate_passed(GateStage::G4PlacementSolved));

    // G5
    assert!(pipeline.evaluate_g5("auditor-5", 0, 2.5, 5.0).is_ok());
    assert!(pipeline.is_gate_passed(GateStage::G5RoutingComplete));

    // G6
    assert!(pipeline.evaluate_g6("auditor-6", 0, 0, 0).is_ok());
    assert!(pipeline.is_gate_passed(GateStage::G6PhysicalDrc));

    // G7
    assert!(pipeline.evaluate_g7("auditor-7", 1.8, 4.5).is_ok());
    assert!(pipeline.is_gate_passed(GateStage::G7SignalPowerIntegrity));

    // G8
    assert!(pipeline.evaluate_g8("auditor-8", 8, 8, true).is_ok());
    assert!(pipeline.is_gate_passed(GateStage::G8ManufacturingCam));

    // G9
    assert!(pipeline.evaluate_g9("auditor-9", true, true).is_ok());
    assert!(pipeline.is_gate_passed(GateStage::G9BenchHil));

    assert_eq!(pipeline.highest_passed_gate(), Some(GateStage::G9BenchHil));
    assert_eq!(pipeline.all_verdicts().len(), 9);
}
