use serde::{Deserialize, Serialize};
use vd_ir::model::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoardBoundingBox {
    pub min_x_nm: Nm,
    pub max_x_nm: Nm,
    pub min_y_nm: Nm,
    pub max_y_nm: Nm,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StagingTrayConfig {
    pub gutter_offset_nm: Nm,
    pub grid_spacing_x_nm: Nm,
    pub grid_spacing_y_nm: Nm,
    pub max_columns: usize,
}

impl Default for StagingTrayConfig {
    fn default() -> Self {
        Self {
            gutter_offset_nm: 10_000_000,   // 10 mm right of board
            grid_spacing_x_nm: 10_000_000,  // 10 mm grid
            grid_spacing_y_nm: 10_000_000,  // 10 mm grid
            max_columns: 5,
        }
    }
}

pub struct ForwardEcoEngine;

impl ForwardEcoEngine {
    /// Computes physical bounding box of placed components on a board.
    pub fn compute_bounding_box(entities: &[HardwareEntity]) -> BoardBoundingBox {
        let mut min_x = Nm::MAX;
        let mut max_x = Nm::MIN;
        let mut min_y = Nm::MAX;
        let mut max_y = Nm::MIN;

        let mut has_comps = false;

        for entity in entities {
            if let HardwareEntity::Component { x_nm, y_nm, .. } = entity {
                has_comps = true;
                if *x_nm < min_x { min_x = *x_nm; }
                if *x_nm > max_x { max_x = *x_nm; }
                if *y_nm < min_y { min_y = *y_nm; }
                if *y_nm > max_y { max_y = *y_nm; }
            }
        }

        if !has_comps {
            BoardBoundingBox {
                min_x_nm: 0,
                max_x_nm: 100_000_000, // 100 mm default
                min_y_nm: 0,
                max_y_nm: 100_000_000,
            }
        } else {
            BoardBoundingBox {
                min_x_nm: min_x,
                max_x_nm: max_x,
                min_y_nm: min_y,
                max_y_nm: max_y,
            }
        }
    }

    /// Stages new or unplaced components neatly in an off-board staging tray to the right of the board outline.
    /// Prevents parts from ever being dumped at (0, 0) on top of active copper traces.
    pub fn stage_unplaced_components(
        existing_entities: &[HardwareEntity],
        new_components: &mut [HardwareEntity],
        config: &StagingTrayConfig,
    ) {
        let bbox = Self::compute_bounding_box(existing_entities);
        let start_x = bbox.max_x_nm + config.gutter_offset_nm;
        let start_y = bbox.max_y_nm;

        for (idx, comp) in new_components.iter_mut().enumerate() {
            if let HardwareEntity::Component {
                x_nm,
                y_nm,
                ..
            } = comp
            {
                let col = idx % config.max_columns;
                let row = idx / config.max_columns;

                *x_nm = start_x + (col as Nm * config.grid_spacing_x_nm);
                *y_nm = start_y - (row as Nm * config.grid_spacing_y_nm);
            }
        }
    }

    /// Changes a footprint while strictly preserving centroid, orientation, and checking lock status.
    pub fn change_footprint(
        entity: &mut HardwareEntity,
        new_footprint_ref: &str,
        new_package_name: &str,
    ) -> Result<(), &'static str> {
        match entity {
            HardwareEntity::Component {
                meta,
                footprint_ref,
                package_name,
                ..
            } => {
                if meta.lock.locked {
                    return Err("Cannot change footprint: Component is locked by human architect.");
                }
                *footprint_ref = new_footprint_ref.to_string();
                *package_name = new_package_name.to_string();
                meta.rev_lamport += 1;
                Ok(())
            }
            _ => Err("Entity is not a component"),
        }
    }
}
