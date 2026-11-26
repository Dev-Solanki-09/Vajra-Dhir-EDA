use serde::{Deserialize, Serialize};

pub type Nm = i64;
pub type Mdeg = i32;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplicatedComponent {
    pub source_id: String,
    pub target_id: String,
    pub refdes: String,
    pub x_nm: Nm,
    pub y_nm: Nm,
    pub rot_mdeg: Mdeg,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplicatedTrace {
    pub source_id: String,
    pub target_id: String,
    pub net_id: String,
    pub layer: String,
    pub x1_nm: Nm,
    pub y1_nm: Nm,
    pub x2_nm: Nm,
    pub y2_nm: Nm,
    pub width_nm: Nm,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplicatedRoomResult {
    pub room_group: String,
    pub channel_index: usize,
    pub components: Vec<ReplicatedComponent>,
    pub traces: Vec<ReplicatedTrace>,
}

pub struct RoomReplicationEngine;

impl RoomReplicationEngine {
    pub fn rotate_point(x: Nm, y: Nm, rot_mdeg: Mdeg) -> (Nm, Nm) {
        if rot_mdeg == 0 {
            return (x, y);
        }
        let rad = (rot_mdeg as f64 / 1000.0) * std::f64::consts::PI / 180.0;
        let cos_a = rad.cos();
        let sin_a = rad.sin();
        let rx = (x as f64 * cos_a - y as f64 * sin_a).round() as Nm;
        let ry = (x as f64 * sin_a + y as f64 * cos_a).round() as Nm;
        (rx, ry)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn replicate_channel(
        room_group: &str,
        channel_index: usize,
        template_origin: (Nm, Nm),
        target_origin: (Nm, Nm),
        delta_rot_mdeg: Mdeg,
        template_comps: &[ReplicatedComponent],
        template_traces: &[ReplicatedTrace],
        id_generator: impl Fn(&str, usize) -> String,
    ) -> ReplicatedRoomResult {
        let (tox, toy) = template_origin;
        let (tgt_x, tgt_y) = target_origin;

        let mut comps = Vec::with_capacity(template_comps.len());
        for c in template_comps {
            let rel_x = c.x_nm - tox;
            let rel_y = c.y_nm - toy;
            let (rot_x, rot_y) = Self::rotate_point(rel_x, rel_y, delta_rot_mdeg);

            let new_refdes = if let Some(stripped) = c.refdes.strip_suffix('1') {
                format!("{}{}", stripped, channel_index)
            } else {
                format!("{}_ch{}", c.refdes, channel_index)
            };

            comps.push(ReplicatedComponent {
                source_id: c.source_id.clone(),
                target_id: id_generator(&c.source_id, channel_index),
                refdes: new_refdes,
                x_nm: tgt_x + rot_x,
                y_nm: tgt_y + rot_y,
                rot_mdeg: (c.rot_mdeg + delta_rot_mdeg) % 360_000,
            });
        }

        let mut traces = Vec::with_capacity(template_traces.len());
        for t in template_traces {
            let rel_x1 = t.x1_nm - tox;
            let rel_y1 = t.y1_nm - toy;
            let rel_x2 = t.x2_nm - tox;
            let rel_y2 = t.y2_nm - toy;

            let (rx1, ry1) = Self::rotate_point(rel_x1, rel_y1, delta_rot_mdeg);
            let (rx2, ry2) = Self::rotate_point(rel_x2, rel_y2, delta_rot_mdeg);

            traces.push(ReplicatedTrace {
                source_id: t.source_id.clone(),
                target_id: id_generator(&t.source_id, channel_index),
                net_id: format!("{}_ch{}", t.net_id, channel_index),
                layer: t.layer.clone(),
                x1_nm: tgt_x + rx1,
                y1_nm: tgt_y + ry1,
                x2_nm: tgt_x + rx2,
                y2_nm: tgt_y + ry2,
                width_nm: t.width_nm,
            });
        }

        ReplicatedRoomResult {
            room_group: room_group.to_string(),
            channel_index,
            components: comps,
            traces,
        }
    }
}
