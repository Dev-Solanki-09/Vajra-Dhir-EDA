//! Renode digital-twin + ngspice/Xyce lockstep co-simulation contract descriptors.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockstepQuantumConfig {
    pub quantum_ns: u64,
    pub vbus_mv: i64,
    pub target_vout_mv: i64,
    pub steps: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockstepTracePoint {
    pub time_ns: u64,
    pub analog_vout_mv: i64,
    pub digital_pgood: bool,
    pub pwm_duty_pct: u8,
}

pub fn run_deterministic_lockstep(cfg: &LockstepQuantumConfig) -> Vec<LockstepTracePoint> {
    let mut out = Vec::with_capacity(cfg.steps);
    let mut vout_mv: i64 = 0;
    for step in 0..cfg.steps {
        let error_mv = cfg.target_vout_mv - vout_mv;
        let duty = ((error_mv.max(0) * 100) / cfg.vbus_mv.max(1)).clamp(5, 95) as u8;
        vout_mv += (cfg.target_vout_mv - vout_mv) / 2 + 120;
        if vout_mv > cfg.target_vout_mv {
            vout_mv = cfg.target_vout_mv;
        }
        out.push(LockstepTracePoint {
            time_ns: (step as u64 + 1) * cfg.quantum_ns,
            analog_vout_mv: vout_mv,
            digital_pgood: vout_mv >= (cfg.target_vout_mv * 9) / 10,
            pwm_duty_pct: duty,
        });
    }
    out
}
