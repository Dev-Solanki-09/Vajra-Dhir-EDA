use vd_ir::{
    model::*,
    store::{HwIrError, HwIrStore},
};
use std::collections::BTreeMap;

fn seed_test_database(store: &mut HwIrStore) -> (String, String, String) {
    let project_id = uuid::Uuid::now_v7().to_string();
    let board_id = uuid::Uuid::now_v7().to_string();
    let net_class_id = uuid::Uuid::now_v7().to_string();

    let conn = store.connection();

    // 1. Insert Project
    conn.execute(
        "INSERT INTO projects (
            id, name, domain, dlp_class, autonomy_level,
            current_gate, target_fab_or_pdk, ambient_temp_min_c,
            ambient_temp_max_c, spec_contract_json, rev_lamport,
            created_at_utc, updated_at_utc
        ) VALUES (
            ?1, 'Test Board', 'pcb', 'PRIVATE_CLOUD_OK', 'L3_GATE_COPILOT',
            'G0_INIT', 'jlcpcb_4l_7628', 0.0,
            50.0, '{}', 1,
            '2026-11-23T00:00:00Z', '2026-11-23T00:00:00Z'
        );",
        rusqlite::params![project_id],
    ).expect("Failed to insert test project");

    // 2. Insert Board
    conn.execute(
        "INSERT INTO boards (
            id, project_id, name, board_kind, outline_polygon_nm,
            thickness_nm, layer_count, provenance, locked, rev_lamport, deleted
        ) VALUES (
            ?1, ?2, 'MainBoard', 'rigid_pcb', '[[0,0],[100000000,0],[100000000,80000000],[0,80000000]]',
            1600000, 4, 'human', 0, 1, 0
        );",
        rusqlite::params![board_id, project_id],
    ).expect("Failed to insert test board");

    // 3. Insert Net Class
    conn.execute(
        "INSERT INTO net_classes (
            id, board_id, name, trace_width_nm, min_width_nm,
            clearance_nm, via_drill_nm, via_diameter_nm, working_voltage_v,
            provenance, locked, rev_lamport
        ) VALUES (
            ?1, ?2, 'Default', 200000, 150000,
            200000, 300000, 600000, 3.3,
            'human', 0, 1
        );",
        rusqlite::params![net_class_id, board_id],
    ).expect("Failed to insert test net class");

    (project_id, board_id, net_class_id)
}

#[test]
fn test_agent_cannot_mutate_human_locked_component() {
    let mut store = HwIrStore::open_in_memory().expect("Failed to open DB");
    let (project_id, board_id, _) = seed_test_database(&mut store);

    let comp_id = uuid::Uuid::now_v7().to_string();

    // 1. Create a component locked by human
    let comp = HardwareEntity::Component {
        meta: HardwareEntityMeta {
            id: comp_id.clone(),
            board_id: board_id.clone(),
            lock: LockGuard {
                locked: true,
                provenance: Provenance::Human,
                lock_owner: Some("engineer@enterprise.internal".into()),
                lock_reason: Some("Critical high-speed clock buffer placement".into()),
            },
            rev_lamport: 1,
            deleted: false,
        },
        refdes: "U1".into(),
        value_str: "SiT8008 50MHz".into(),
        mpn: Some("SiT8008AI-22-33E-50.000000E".into()),
        package_name: "QFN-4".into(),
        footprint_ref: "Oscillator:Oscillator_SMD_SiTime_QFN-4".into(),
        symbol_ref: "Oscillator:SiT8008".into(),
        functional_group: "clock".into(),
        x_nm: 25_000_000, // 25 mm
        y_nm: 30_000_000, // 30 mm
        rot_mdeg: 0,
        side: "top".into(),
        courtyard_w_nm: 4_000_000,
        courtyard_h_nm: 4_000_000,
        height_nm: 1_000_000,
        power_diss_mw: 15.0,
        params: BTreeMap::new(),
        datasheet_citation_id: None,
    };

    let human_patch = HardwarePatch {
        patch_id: uuid::Uuid::now_v7().to_string(),
        project_id: project_id.clone(),
        actor_kind: Provenance::Human,
        actor_id: "human:lead_engineer".into(),
        lamport_ts: 1,
        forward_ops: vec![HardwarePatchOp::UpsertEntity { entity: comp }],
        inverse_ops: vec![],
        otel_trace_id: None,
    };

    store.apply_patch(&human_patch).expect("Human patch should succeed");

    // 2. An AGENT attempts to move this human-locked component
    let agent_move_patch = HardwarePatch {
        patch_id: uuid::Uuid::now_v7().to_string(),
        project_id: project_id.clone(),
        actor_kind: Provenance::Agent,
        actor_id: "agent:placer_mcp".into(),
        lamport_ts: 2,
        forward_ops: vec![HardwarePatchOp::MoveComponent {
            component_id: comp_id.clone(),
            x_nm: 35_000_000,
            y_nm: 40_000_000,
            rot_mdeg: 90000,
            side: "top".into(),
        }],
        inverse_ops: vec![],
        otel_trace_id: None,
    };

    let err = store.apply_patch(&agent_move_patch).expect_err("Agent patch MUST fail");
    match err {
        HwIrError::LockViolation(msg) => {
            assert!(
                msg.contains("KERNEL_LOCK_VIOLATION"),
                "Expected KERNEL_LOCK_VIOLATION trigger message, got: {}",
                msg
            );
        }
        other => panic!("Expected LockViolation error, got: {:?}", other),
    }

    // Verify component was NOT moved
    let (x, y): (i64, i64) = store.connection().query_row(
        "SELECT x_nm, y_nm FROM components WHERE id = ?1;",
        rusqlite::params![comp_id],
        |r| Ok((r.get(0)?, r.get(1)?)),
    ).expect("Failed to query component");

    assert_eq!(x, 25_000_000, "X position must remain unmutated");
    assert_eq!(y, 30_000_000, "Y position must remain unmutated");
}

#[test]
fn test_human_can_mutate_locked_component() {
    let mut store = HwIrStore::open_in_memory().expect("Failed to open DB");
    let (project_id, board_id, _) = seed_test_database(&mut store);

    let comp_id = uuid::Uuid::now_v7().to_string();

    // 1. Create locked component
    let comp = HardwareEntity::Component {
        meta: HardwareEntityMeta {
            id: comp_id.clone(),
            board_id: board_id.clone(),
            lock: LockGuard {
                locked: true,
                provenance: Provenance::Human,
                lock_owner: Some("engineer@enterprise.internal".into()),
                lock_reason: Some("Fixed connector position".into()),
            },
            rev_lamport: 1,
            deleted: false,
        },
        refdes: "J1".into(),
        value_str: "USB-C-16P".into(),
        mpn: Some("TYPE-C-31-M-12".into()),
        package_name: "USB-C".into(),
        footprint_ref: "Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12".into(),
        symbol_ref: "Connector:USB_C_Receptacle_USB2.0".into(),
        functional_group: "connector".into(),
        x_nm: 0,
        y_nm: 40_000_000,
        rot_mdeg: 0,
        side: "top".into(),
        courtyard_w_nm: 9_000_000,
        courtyard_h_nm: 8_000_000,
        height_nm: 3_200_000,
        power_diss_mw: 0.0,
        params: BTreeMap::new(),
        datasheet_citation_id: None,
    };

    let human_init_patch = HardwarePatch {
        patch_id: uuid::Uuid::now_v7().to_string(),
        project_id: project_id.clone(),
        actor_kind: Provenance::Human,
        actor_id: "human:lead_engineer".into(),
        lamport_ts: 1,
        forward_ops: vec![HardwarePatchOp::UpsertEntity { entity: comp }],
        inverse_ops: vec![],
        otel_trace_id: None,
    };
    store.apply_patch(&human_init_patch).expect("Human init patch should succeed");

    // 2. Human moves their own locked component -> MUST SUCCEED
    let human_move_patch = HardwarePatch {
        patch_id: uuid::Uuid::now_v7().to_string(),
        project_id: project_id.clone(),
        actor_kind: Provenance::Human,
        actor_id: "human:lead_engineer".into(),
        lamport_ts: 2,
        forward_ops: vec![HardwarePatchOp::MoveComponent {
            component_id: comp_id.clone(),
            x_nm: 5_000_000,
            y_nm: 40_000_000,
            rot_mdeg: 0,
            side: "top".into(),
        }],
        inverse_ops: vec![],
        otel_trace_id: None,
    };

    store.apply_patch(&human_move_patch).expect("Human patch should succeed on locked component");

    let x: i64 = store.connection().query_row(
        "SELECT x_nm FROM components WHERE id = ?1;",
        rusqlite::params![comp_id],
        |r| r.get(0),
    ).expect("Failed to query component");

    assert_eq!(x, 5_000_000, "X position must be updated by human");
}

#[test]
fn test_undo_restores_exact_sha256_fingerprint() {
    let mut store = HwIrStore::open_in_memory().expect("Failed to open DB");
    let (project_id, board_id, _) = seed_test_database(&mut store);

    let comp_id = uuid::Uuid::now_v7().to_string();

    // 1. Initial component (unlocked)
    let comp = HardwareEntity::Component {
        meta: HardwareEntityMeta {
            id: comp_id.clone(),
            board_id: board_id.clone(),
            lock: LockGuard {
                locked: false,
                provenance: Provenance::Human,
                lock_owner: None,
                lock_reason: None,
            },
            rev_lamport: 1,
            deleted: false,
        },
        refdes: "R1".into(),
        value_str: "10k 1% 0402".into(),
        mpn: Some("RC0402FR-0710KL".into()),
        package_name: "R_0402".into(),
        footprint_ref: "Resistor_SMD:R_0402_1005Metric".into(),
        symbol_ref: "Device:R".into(),
        functional_group: "pullup".into(),
        x_nm: 10_000_000,
        y_nm: 15_000_000,
        rot_mdeg: 0,
        side: "top".into(),
        courtyard_w_nm: 1_500_000,
        courtyard_h_nm: 1_000_000,
        height_nm: 400_000,
        power_diss_mw: 1.0,
        params: BTreeMap::new(),
        datasheet_citation_id: None,
    };

    let p1 = HardwarePatch {
        patch_id: uuid::Uuid::now_v7().to_string(),
        project_id: project_id.clone(),
        actor_kind: Provenance::Human,
        actor_id: "human:engineer".into(),
        lamport_ts: 1,
        forward_ops: vec![HardwarePatchOp::UpsertEntity { entity: comp }],
        inverse_ops: vec![],
        otel_trace_id: None,
    };
    store.apply_patch(&p1).expect("Setup patch failed");

    // Record pre-patch baseline hash
    let baseline_hash = store.compute_design_hash(&project_id).expect("Hash calculation failed");

    // 2. Apply a mutation patch
    let p2 = HardwarePatch {
        patch_id: uuid::Uuid::now_v7().to_string(),
        project_id: project_id.clone(),
        actor_kind: Provenance::Agent,
        actor_id: "agent:placer".into(),
        lamport_ts: 2,
        forward_ops: vec![HardwarePatchOp::MoveComponent {
            component_id: comp_id.clone(),
            x_nm: 12_000_000,
            y_nm: 18_000_000,
            rot_mdeg: 90000,
            side: "top".into(),
        }],
        inverse_ops: vec![],
        otel_trace_id: None,
    };
    store.apply_patch(&p2).expect("Mutation patch failed");

    let mutated_hash = store.compute_design_hash(&project_id).expect("Hash calculation failed");
    assert_ne!(baseline_hash, mutated_hash, "Mutated hash must differ from baseline");

    // 3. Undo the patch
    let undone = store.undo_last_patch(&project_id).expect("Undo failed");
    assert!(undone.is_some(), "An undone patch ID should be returned");

    // 4. Verify hash returns to exact baseline SHA-256
    let restored_hash = store.compute_design_hash(&project_id).expect("Hash calculation failed");
    assert_eq!(
        baseline_hash, restored_hash,
        "Design state after undo must match exact pre-patch SHA-256 fingerprint"
    );
}
