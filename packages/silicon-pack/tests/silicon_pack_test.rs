use vd_silicon_pack::{LibreLanePackJob, SiliconPackError};

#[test]
fn test_librelane_pack_validation_and_c2p2b_balls() {
    let valid = LibreLanePackJob {
        flow: "librelane".to_string(),
        pdk: "sky130A".to_string(),
        network_mode: "none".to_string(),
        image_digest_sha256: format!("sha256:{}", "b".repeat(64)),
        clock_period_ps: 10_000,
        die_width_nm: 3_000_000,
        die_height_nm: 3_000_000,
    };
    assert!(valid.validate().is_ok());
    assert_eq!(valid.synthesize_default_c2p2b_balls().len(), 3);

    let mut legacy = valid.clone();
    legacy.flow = "openlane".to_string();
    assert_eq!(legacy.validate(), Err(SiliconPackError::LegacyOpenLaneForbidden));

    let mut bridge = valid;
    bridge.network_mode = "bridge".to_string();
    assert_eq!(bridge.validate(), Err(SiliconPackError::EgressBlocked));
}
