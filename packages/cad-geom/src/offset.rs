use cavalier_contours::polyline::{PlineSource, PlineSourceMut, Polyline};
use thiserror::Error;

pub type Nm = i64;

#[derive(Debug, Clone, PartialEq)]
pub struct ArcVertexNm {
    pub x_nm: Nm,
    pub y_nm: Nm,
    /// Sagitta bulge = tan(sweep_angle / 4.0); 0.0 denotes a straight segment.
    pub bulge: f64,
}

#[derive(Debug, Error)]
pub enum OffsetError {
    #[error("Offset requires at least 2 vertices for open or 3 for closed contour")]
    InsufficientVertices,
}

pub struct OffsetContourEngine;

impl OffsetContourEngine {
    /// Computes arc-preserving parallel contour offsets via `cavalier_contours`.
    /// Converts signed `i64` nm coordinates to mm at the solver boundary and quantizes back to `i64` nm.
    pub fn parallel_offset_nm(
        vertices: &[ArcVertexNm],
        is_closed: bool,
        offset_nm: Nm,
    ) -> Result<Vec<Vec<ArcVertexNm>>, OffsetError> {
        let min_len = if is_closed { 3 } else { 2 };
        if vertices.len() < min_len {
            return Err(OffsetError::InsufficientVertices);
        }

        let mut pline = if is_closed {
            Polyline::new_closed()
        } else {
            Polyline::new()
        };

        for v in vertices {
            pline.add(v.x_nm as f64 / 1_000_000.0, v.y_nm as f64 / 1_000_000.0, v.bulge);
        }

        let offset_mm = offset_nm as f64 / 1_000_000.0;
        let out_plines = pline.parallel_offset(offset_mm);

        let result = out_plines
            .into_iter()
            .map(|p| {
                p.iter_vertexes()
                    .map(|v| ArcVertexNm {
                        x_nm: (v.x * 1_000_000.0).round() as Nm,
                        y_nm: (v.y * 1_000_000.0).round() as Nm,
                        bulge: v.bulge,
                    })
                    .collect()
            })
            .collect();

        Ok(result)
    }
}
