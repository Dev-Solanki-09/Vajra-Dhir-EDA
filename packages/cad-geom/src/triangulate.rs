use crate::bool2d::{BoolGeomError, IntPoint2D};
use i_triangle::i_overlay::i_float::int::point::IntPoint;
use i_triangle::i_overlay::i_shape::int::shape::IntShape;
use i_triangle::int::triangulatable::IntTriangulatable;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CopperMeshNm {
    pub vertices_nm: Vec<IntPoint2D>,
    pub indices: Vec<usize>,
    pub triangle_count: usize,
}

pub struct CopperTriangulator;

impl CopperTriangulator {
    /// Deterministic pure-MIT copper polygon triangulation using `i_triangle` native `i64` integer coordinates.
    pub fn triangulate_polygon_nm(
        outer: &[IntPoint2D],
        holes: &[Vec<IntPoint2D>],
    ) -> Result<CopperMeshNm, BoolGeomError> {
        if outer.len() < 3 {
            return Err(BoolGeomError::DegeneratePolygon);
        }

        let mut shape: IntShape<i64> = Vec::with_capacity(1 + holes.len());
        shape.push(
            outer
                .iter()
                .map(|p| IntPoint::<i64>::new(p[0], p[1]))
                .collect(),
        );
        for h in holes {
            if h.len() >= 3 {
                shape.push(h.iter().map(|p| IntPoint::<i64>::new(p[0], p[1])).collect());
            }
        }

        let raw = shape.triangulate();
        let vertices_nm: Vec<IntPoint2D> = raw.points().iter().map(|p| [p.x, p.y]).collect();
        let indices: Vec<usize> = raw.triangle_indices::<usize>();
        let triangle_count = indices.len() / 3;

        Ok(CopperMeshNm {
            vertices_nm,
            indices,
            triangle_count,
        })
    }
}
