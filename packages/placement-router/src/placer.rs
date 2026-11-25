use rand::Rng;
use rand_chacha::rand_core::SeedableRng;
use rand_chacha::ChaCha8Rng;
use serde::{Deserialize, Serialize};

pub type Nm = i64;
pub type Mdeg = i32;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlacerComponent {
    pub id: String,
    pub refdes: String,
    pub x_nm: Nm,
    pub y_nm: Nm,
    pub width_nm: Nm,
    pub height_nm: Nm,
    pub rot_mdeg: Mdeg,
    pub power_diss_mw: f64,
    pub locked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlacerPin {
    pub comp_id: String,
    pub offset_x_nm: Nm,
    pub offset_y_nm: Nm,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlacerNet {
    pub id: String,
    pub pins: Vec<PlacerPin>,
    pub weight: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeepoutZone {
    pub min_x_nm: Nm,
    pub min_y_nm: Nm,
    pub max_x_nm: Nm,
    pub max_y_nm: Nm,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlacerConfig {
    pub board_width_nm: Nm,
    pub board_height_nm: Nm,
    pub rng_seed: u64,
    pub initial_temp: f64,
    pub final_temp: f64,
    pub cooling_rate: f64,
    pub steps_per_temp: usize,
    pub alpha_hpwl: f64,
    pub beta_overlap: f64,
    pub gamma_thermal: f64,
    pub delta_keepout: f64,
    #[serde(default = "default_w_cong")]
    pub w_cong: f64,
}

fn default_w_cong() -> f64 {
    10.0
}

impl Default for PlacerConfig {
    fn default() -> Self {
        Self {
            board_width_nm: 100_000_000,  // 100 mm
            board_height_nm: 80_000_000,  // 80 mm
            rng_seed: 42,
            initial_temp: 1000.0,
            final_temp: 0.1,
            cooling_rate: 0.95,
            steps_per_temp: 50,
            alpha_hpwl: 1.0,
            beta_overlap: 50.0,
            gamma_thermal: 0.05,
            delta_keepout: 100.0,
            w_cong: default_w_cong(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlacementMetrics {
    pub initial_cost: f64,
    pub final_cost: f64,
    pub final_hpwl_nm: u64,
    pub overlap_count: usize,
    pub iterations_completed: usize,
}

pub struct SimulatedAnnealingPlacer {
    config: PlacerConfig,
}

impl SimulatedAnnealingPlacer {
    pub fn new(config: PlacerConfig) -> Self {
        Self { config }
    }

    /// Run the simulated annealing placer on unlocked components.
    /// Invariant: Components with locked = true are NEVER perturbed or moved.
    pub fn place(
        &self,
        components: &mut [PlacerComponent],
        nets: &[PlacerNet],
        keepouts: &[KeepoutZone],
    ) -> PlacementMetrics {
        let mut rng = ChaCha8Rng::seed_from_u64(self.config.rng_seed);

        let initial_cost = self.evaluate_cost(components, nets, keepouts);
        let mut current_cost = initial_cost;
        let mut best_cost = current_cost;
        let mut best_state = components.to_vec();

        let mut temp = self.config.initial_temp;
        let mut iterations = 0;

        // Find movable indices
        let movable_indices: Vec<usize> = components
            .iter()
            .enumerate()
            .filter(|(_, c)| !c.locked)
            .map(|(idx, _)| idx)
            .collect();

        if movable_indices.is_empty() {
            return PlacementMetrics {
                initial_cost,
                final_cost: initial_cost,
                final_hpwl_nm: self.calculate_hpwl(components, nets),
                overlap_count: self.count_overlaps(components),
                iterations_completed: 0,
            };
        }

        while temp > self.config.final_temp {
            for _ in 0..self.config.steps_per_temp {
                iterations += 1;

                // Pick a random movable component
                let pick = rng.gen_range(0..movable_indices.len());
                let comp_idx = movable_indices[pick];

                let old_x = components[comp_idx].x_nm;
                let old_y = components[comp_idx].y_nm;
                let old_rot = components[comp_idx].rot_mdeg;

                // Perturbation: shift by delta scaled with temperature
                let max_delta = ((temp / self.config.initial_temp) * 20_000_000.0).max(500_000.0) as i64;
                let dx = rng.gen_range(-max_delta..=max_delta);
                let dy = rng.gen_range(-max_delta..=max_delta);

                let half_w = components[comp_idx].width_nm / 2;
                let half_h = components[comp_idx].height_nm / 2;

                // Clamp inside board bounds
                let new_x = (old_x + dx).clamp(half_w, self.config.board_width_nm - half_w);
                let new_y = (old_y + dy).clamp(half_h, self.config.board_height_nm - half_h);

                // Occasional 90 deg rotation perturbation
                let new_rot = if rng.gen_bool(0.1) {
                    (old_rot + 90000) % 360000
                } else {
                    old_rot
                };

                components[comp_idx].x_nm = new_x;
                components[comp_idx].y_nm = new_y;
                components[comp_idx].rot_mdeg = new_rot;

                let candidate_cost = self.evaluate_cost(components, nets, keepouts);
                let delta_cost = candidate_cost - current_cost;

                // Metropolis acceptance criterion
                let accept = if delta_cost < 0.0 {
                    true
                } else {
                    let prob = (-delta_cost / temp).exp();
                    rng.gen_bool(prob.clamp(0.0, 1.0))
                };

                if accept {
                    current_cost = candidate_cost;
                    if current_cost < best_cost {
                        best_cost = current_cost;
                        best_state = components.to_vec();
                    }
                } else {
                    // Revert perturbation
                    components[comp_idx].x_nm = old_x;
                    components[comp_idx].y_nm = old_y;
                    components[comp_idx].rot_mdeg = old_rot;
                }
            }

            temp *= self.config.cooling_rate;
        }

        // Restore best state found
        components.clone_from_slice(&best_state);

        PlacementMetrics {
            initial_cost,
            final_cost: best_cost,
            final_hpwl_nm: self.calculate_hpwl(components, nets),
            overlap_count: self.count_overlaps(components),
            iterations_completed: iterations,
        }
    }

    pub fn evaluate_cost(
        &self,
        components: &[PlacerComponent],
        nets: &[PlacerNet],
        keepouts: &[KeepoutZone],
    ) -> f64 {
        let hpwl = self.calculate_hpwl(components, nets) as f64 / 1_000_000.0; // In mm
        let overlap_penalty = self.calculate_overlap_penalty(components);
        let thermal_penalty = self.calculate_thermal_penalty(components);
        let keepout_penalty = self.calculate_keepout_penalty(components, keepouts);
        let congestion_penalty = self.calculate_congestion_penalty(components, nets);

        self.config.alpha_hpwl * hpwl
            + self.config.beta_overlap * overlap_penalty
            + self.config.gamma_thermal * thermal_penalty
            + self.config.delta_keepout * keepout_penalty
            + self.config.w_cong * congestion_penalty
    }

    fn calculate_hpwl(&self, components: &[PlacerComponent], nets: &[PlacerNet]) -> u64 {
        let mut total_hpwl: u64 = 0;

        for net in nets {
            if net.pins.len() < 2 {
                continue;
            }

            let mut min_x = i64::MAX;
            let mut max_x = i64::MIN;
            let mut min_y = i64::MAX;
            let mut max_y = i64::MIN;

            for pin in &net.pins {
                if let Some(comp) = components.iter().find(|c| c.id == pin.comp_id) {
                    let pin_x = comp.x_nm + pin.offset_x_nm;
                    let pin_y = comp.y_nm + pin.offset_y_nm;

                    min_x = min_x.min(pin_x);
                    max_x = max_x.max(pin_x);
                    min_y = min_y.min(pin_y);
                    max_y = max_y.max(pin_y);
                }
            }

            if min_x <= max_x && min_y <= max_y {
                let net_hpwl = (max_x - min_x) + (max_y - min_y);
                total_hpwl += (net_hpwl as f64 * net.weight) as u64;
            }
        }

        total_hpwl
    }

    fn calculate_overlap_penalty(&self, components: &[PlacerComponent]) -> f64 {
        let mut penalty = 0.0;
        let n = components.len();

        for i in 0..n {
            for j in (i + 1)..n {
                let c1 = &components[i];
                let c2 = &components[j];

                let (w1, h1) = if c1.rot_mdeg == 90000 || c1.rot_mdeg == 270000 {
                    (c1.height_nm, c1.width_nm)
                } else {
                    (c1.width_nm, c1.height_nm)
                };

                let (w2, h2) = if c2.rot_mdeg == 90000 || c2.rot_mdeg == 270000 {
                    (c2.height_nm, c2.width_nm)
                } else {
                    (c2.width_nm, c2.height_nm)
                };

                let dx = (c1.x_nm - c2.x_nm).abs();
                let dy = (c1.y_nm - c2.y_nm).abs();

                let overlap_x = ((w1 + w2) / 2) - dx;
                let overlap_y = ((h1 + h2) / 2) - dy;

                if overlap_x > 0 && overlap_y > 0 {
                    let overlap_area_mm2 = (overlap_x as f64 / 1_000_000.0) * (overlap_y as f64 / 1_000_000.0);
                    penalty += overlap_area_mm2 * overlap_area_mm2;
                }
            }
        }

        penalty
    }

    fn count_overlaps(&self, components: &[PlacerComponent]) -> usize {
        let mut count = 0;
        let n = components.len();
        for i in 0..n {
            for j in (i + 1)..n {
                let c1 = &components[i];
                let c2 = &components[j];
                let dx = (c1.x_nm - c2.x_nm).abs();
                let dy = (c1.y_nm - c2.y_nm).abs();
                let min_x = (c1.width_nm + c2.width_nm) / 2;
                let min_y = (c1.height_nm + c2.height_nm) / 2;
                if dx < min_x && dy < min_y {
                    count += 1;
                }
            }
        }
        count
    }

    fn calculate_thermal_penalty(&self, components: &[PlacerComponent]) -> f64 {
        let mut penalty = 0.0;
        let hot_comps: Vec<&PlacerComponent> = components
            .iter()
            .filter(|c| c.power_diss_mw > 500.0)
            .collect();

        for i in 0..hot_comps.len() {
            for j in (i + 1)..hot_comps.len() {
                let c1 = hot_comps[i];
                let c2 = hot_comps[j];
                let dist_mm = (((c1.x_nm - c2.x_nm).pow(2) + (c1.y_nm - c2.y_nm).pow(2)) as f64).sqrt() / 1_000_000.0;
                if dist_mm < 20.0 {
                    // Hot parts too close together
                    penalty += (20.0 - dist_mm) * (c1.power_diss_mw + c2.power_diss_mw) / 1000.0;
                }
            }
        }

        penalty
    }

    fn calculate_keepout_penalty(&self, components: &[PlacerComponent], keepouts: &[KeepoutZone]) -> f64 {
        let mut penalty = 0.0;
        for c in components {
            for k in keepouts {
                let c_min_x = c.x_nm - c.width_nm / 2;
                let c_max_x = c.x_nm + c.width_nm / 2;
                let c_min_y = c.y_nm - c.height_nm / 2;
                let c_max_y = c.y_nm + c.height_nm / 2;

                let overlap_x = (c_max_x.min(k.max_x_nm) - c_min_x.max(k.min_x_nm)).max(0);
                let overlap_y = (c_max_y.min(k.max_y_nm) - c_min_y.max(k.min_y_nm)).max(0);

                if overlap_x > 0 && overlap_y > 0 {
                    let area_mm2 = (overlap_x as f64 / 1_000_000.0) * (overlap_y as f64 / 1_000_000.0);
                    penalty += area_mm2 * 100.0;
                }
            }
        }
        penalty
    }

    /// Estimate routing congestion on an 8x8 coarse grid using net bounding-box demand.
    pub fn calculate_congestion_penalty(
        &self,
        components: &[PlacerComponent],
        nets: &[PlacerNet],
    ) -> f64 {
        const GRID_N: usize = 8;
        let mut grid = [0.0_f64; GRID_N * GRID_N];
        let bw = self.config.board_width_nm.max(1) as f64;
        let bh = self.config.board_height_nm.max(1) as f64;

        for net in nets {
            if net.pins.len() < 2 {
                continue;
            }
            let mut min_x = i64::MAX;
            let mut max_x = i64::MIN;
            let mut min_y = i64::MAX;
            let mut max_y = i64::MIN;
            for pin in &net.pins {
                if let Some(comp) = components.iter().find(|c| c.id == pin.comp_id) {
                    let px = comp.x_nm + pin.offset_x_nm;
                    let py = comp.y_nm + pin.offset_y_nm;
                    min_x = min_x.min(px);
                    max_x = max_x.max(px);
                    min_y = min_y.min(py);
                    max_y = max_y.max(py);
                }
            }
            if min_x <= max_x && min_y <= max_y {
                let gx0 = (((min_x as f64 / bw) * GRID_N as f64).floor() as isize).clamp(0, GRID_N as isize - 1) as usize;
                let gx1 = (((max_x as f64 / bw) * GRID_N as f64).floor() as isize).clamp(0, GRID_N as isize - 1) as usize;
                let gy0 = (((min_y as f64 / bh) * GRID_N as f64).floor() as isize).clamp(0, GRID_N as isize - 1) as usize;
                let gy1 = (((max_y as f64 / bh) * GRID_N as f64).floor() as isize).clamp(0, GRID_N as isize - 1) as usize;
                let cells = ((gx1 - gx0 + 1) * (gy1 - gy0 + 1)) as f64;
                let demand = net.weight / cells.sqrt();
                for gx in gx0..=gx1 {
                    for gy in gy0..=gy1 {
                        grid[gy * GRID_N + gx] += demand;
                    }
                }
            }
        }

        // Penalize cells where overlapping net demand exceeds 1.0
        grid.iter()
            .filter(|&&d| d > 1.0)
            .map(|&d| (d - 1.0) * (d - 1.0))
            .sum()
    }
}
