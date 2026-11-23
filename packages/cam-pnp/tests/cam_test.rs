use std::collections::BTreeMap;
use vd_cam_pnp::*;
use vd_ir::model::*;

fn create_comp(refdes: &str, val: &str, pkg: &str, x_mm: f64, y_mm: f64) -> HardwareEntity {
    HardwareEntity::Component {
        meta: HardwareEntityMeta {
            id: uuid::Uuid::now_v7().to_string(),
            board_id: "board-1".into(),
            lock: LockGuard {
                locked: false,
                provenance: Provenance::Manual,
                lock_owner: None,
                lock_reason: None,
            },
            rev_lamport: 1,
            deleted: false,
        },
        refdes: refdes.into(),
        value_str: val.into(),
        mpn: None,
        package_name: pkg.into(),
        footprint_ref: format!("Test:{}", pkg),
        symbol_ref: "Device:R".into(),
        functional_group: "signal".into(),
        x_nm: (x_mm * 1_000_000.0) as Nm,
        y_nm: (y_mm * 1_000_000.0) as Nm,
        rot_mdeg: 90000,
        side: "top".into(),
        courtyard_w_nm: 2_000_000,
        courtyard_h_nm: 1_200_000,
        height_nm: 600_000,
        power_diss_mw: 0.0,
        params: BTreeMap::new(),
        datasheet_citation_id: None,
    }
}

#[test]
fn test_stencil_dfm_small_chip() {
    // 0603 pad: 0.8mm x 0.9mm on 120um foil
    let spec = StencilApertureSpec {
        pad_width_nm: 800_000,
        pad_length_nm: 900_000,
        foil_thickness_nm: 120_000,
    };

    let report = StencilDfmEngine::evaluate_aperture(&spec);
    assert!(report.aspect_ratio > 1.50);
    assert!(report.area_ratio > 0.66);
    assert!(report.satisfies_ipc_7525b);
    assert!(!report.window_paning_applied);
}

#[test]
fn test_stencil_dfm_large_thermal_pad_window_paning() {
    // QFN exposed pad: 3.0mm x 3.0mm on 120um foil
    let spec = StencilApertureSpec {
        pad_width_nm: 3_000_000,
        pad_length_nm: 3_000_000,
        foil_thickness_nm: 120_000,
    };

    let report = StencilDfmEngine::evaluate_aperture(&spec);
    assert!(report.window_paning_applied);
    assert_eq!(report.sub_apertures_count, 4); // 2x2 matrix
    assert!(report.coverage_percentage < 100.0);
}

#[test]
fn test_pnp_centroid_and_feeder_optimization() {
    let comps = vec![
        create_comp("R1", "10k", "0603", 10.0, 15.0),
        create_comp("R2", "10k", "0603", 12.0, 15.0),
        create_comp("C1", "100n", "0402", 5.0, 5.0),
    ];

    let centroids = PnpGenerator::generate_centroids(&comps);
    assert_eq!(centroids.len(), 3);
    assert_eq!(centroids[0].refdes, "C1");

    let csv = PnpGenerator::to_csv(&centroids);
    assert!(csv.contains("RefDes,Val,Package"));
    assert!(csv.contains("R1,10k,0603,10.0000,15.0000,90.0,top"));

    let feeders = PnpGenerator::optimize_feeders(&centroids);
    assert_eq!(feeders.len(), 2); // 0603:10k and 0402:100n
    let r_feeder = feeders.iter().find(|f| f.package_family == "0603").unwrap();
    assert_eq!(r_feeder.parts_assigned.len(), 2);
}
