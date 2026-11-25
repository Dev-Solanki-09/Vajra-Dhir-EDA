use vd_dlp::{
    BudgetConfig, BudgetError, DlpClass, DlpError, DlpFirewall, ModelRouter, ModelTier,
};

#[test]
fn test_nda_airgapped_blocks_cloud_egress() {
    let mut router = ModelRouter::new(BudgetConfig::default());

    // 1. Attempting external cloud call in NDA_AIRGAPPED project MUST fail
    let res = router.route(
        DlpClass::NdaAirgapped,
        ModelTier::TierA,
        "https://api.openai.com/v1/chat/completions",
        "Generate buck converter schematic",
    );

    match res {
        Err(err) => {
            let err_str = err.to_string();
            assert!(
                err_str.contains("Egress blocked"),
                "Expected Egress blocked, got: {}",
                err_str
            );
        }
        Ok(_) => panic!("External egress must be blocked for NDA_AIRGAPPED"),
    }

    // 2. Local Ollama loopback call MUST succeed
    let res_local = router.route(
        DlpClass::NdaAirgapped,
        ModelTier::TierA,
        "http://localhost:11434/api/generate",
        "Generate buck converter schematic",
    );
    assert!(res_local.is_ok(), "Local loopback should be permitted");
    let (_, tier) = res_local.unwrap();
    assert_eq!(tier, ModelTier::TierLocal, "Must be routed to local tier");
}

#[test]
fn test_prompt_sanitization_strips_api_keys() {
    let raw_prompt = "Using key sk-proj-supersecretkey12345abc for vendor part lookup";
    let sanitized = DlpFirewall::sanitize_text(raw_prompt);

    assert!(!sanitized.contains("sk-proj-supersecretkey12345abc"));
    assert!(sanitized.contains("[REDACTED_API_KEY]"));
}

#[test]
fn test_budget_circuit_breaker_trips() {
    let config = BudgetConfig {
        session_cost_cap_usd: 1.00,
        per_turn_cost_cap_usd: 0.80,
        require_human_confirmation_above_usd: 0.50,
        tier_a_input_per_million: 3.00,
        tier_a_output_per_million: 15.00,
        tier_b_input_per_million: 0.50,
        tier_b_output_per_million: 1.50,
    };

    let mut router = ModelRouter::new(config);

    // Turn 1: 50,000 input tokens, 20,000 output tokens on Tier A
    // Cost: (0.05 * 3.0) + (0.02 * 15.0) = 0.15 + 0.30 = $0.45
    let turn1 = router
        .tracker_mut()
        .record_turn(ModelTier::TierA, 50_000, 20_000)
        .expect("Turn 1 should succeed");
    assert!((turn1.total_spent_usd - 0.45).abs() < 1e-4);

    // Turn 2: Another $0.45 -> total $0.90
    let turn2 = router
        .tracker_mut()
        .record_turn(ModelTier::TierA, 50_000, 20_000)
        .expect("Turn 2 should succeed");
    assert!((turn2.total_spent_usd - 0.90).abs() < 1e-4);

    // Turn 3: Another $0.45 -> total $1.35 > $1.00 cap -> MUST TRIP
    let turn3_err = router
        .tracker_mut()
        .record_turn(ModelTier::TierA, 50_000, 20_000)
        .expect_err("Turn 3 must exceed session cap");

    match turn3_err {
        BudgetError::CapExceeded(spent, cap) => {
            assert!(spent > cap);
        }
        other => panic!("Expected CapExceeded error, got {:?}", other),
    }
}

#[test]
fn test_dlp_firewall_check_egress_loopback_vs_external() {
    assert!(DlpFirewall::check_egress(DlpClass::NdaAirgapped, "http://127.0.0.1:11434/api/chat").is_ok());
    assert!(DlpFirewall::check_egress(DlpClass::NdaAirgapped, "offline").is_ok());
    let blocked = DlpFirewall::check_egress(DlpClass::NdaAirgapped, "https://telemetry.example.invalid/collect");
    assert!(matches!(blocked, Err(DlpError::EgressBlocked(_))));
}
