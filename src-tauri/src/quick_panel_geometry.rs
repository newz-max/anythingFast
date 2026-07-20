pub(crate) const QUICK_PANEL_BASE_WIDTH: f64 = 840.0;
pub(crate) const QUICK_PANEL_BASE_HEIGHT: f64 = 640.0;
const QUICK_PANEL_MIN_WIDTH: f64 = 680.0;
const QUICK_PANEL_MIN_HEIGHT: f64 = 480.0;
const QUICK_PANEL_MAX_WIDTH_RATIO: f64 = 0.90;
const QUICK_PANEL_MAX_HEIGHT_RATIO: f64 = 0.82;

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct PhysicalWorkArea {
    pub(crate) x: i32,
    pub(crate) y: i32,
    pub(crate) width: u32,
    pub(crate) height: u32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct QuickPanelGeometry {
    pub(crate) logical_width: f64,
    pub(crate) logical_height: f64,
    pub(crate) physical_x: i32,
    pub(crate) physical_y: i32,
}

pub(crate) fn calculate_quick_panel_geometry(
    work_area: PhysicalWorkArea,
    scale_factor: f64,
) -> Result<QuickPanelGeometry, String> {
    if !scale_factor.is_finite() || scale_factor <= 0.0 {
        return Err(format!("invalid monitor scale factor: {scale_factor}"));
    }
    if work_area.width == 0 || work_area.height == 0 {
        return Err("monitor work area must be non-zero".to_string());
    }

    let logical_work_width = f64::from(work_area.width) / scale_factor;
    let logical_work_height = f64::from(work_area.height) / scale_factor;
    let logical_width = constrained_dimension(
        logical_work_width,
        QUICK_PANEL_BASE_WIDTH,
        QUICK_PANEL_MIN_WIDTH,
        QUICK_PANEL_MAX_WIDTH_RATIO,
    );
    let logical_height = constrained_dimension(
        logical_work_height,
        QUICK_PANEL_BASE_HEIGHT,
        QUICK_PANEL_MIN_HEIGHT,
        QUICK_PANEL_MAX_HEIGHT_RATIO,
    );

    let physical_width = (logical_width * scale_factor).round() as i64;
    let physical_height = (logical_height * scale_factor).round() as i64;
    let physical_x = centered_coordinate(work_area.x, work_area.width, physical_width);
    let physical_y = centered_coordinate(work_area.y, work_area.height, physical_height);

    Ok(QuickPanelGeometry {
        logical_width,
        logical_height,
        physical_x,
        physical_y,
    })
}

fn constrained_dimension(work_area: f64, base: f64, minimum: f64, ratio: f64) -> f64 {
    let maximum = (work_area * ratio).floor().max(1.0);
    if maximum >= minimum {
        base.clamp(minimum, maximum)
    } else {
        maximum
    }
}

fn centered_coordinate(origin: i32, work_size: u32, panel_size: i64) -> i32 {
    let coordinate = i64::from(origin) + (i64::from(work_size) - panel_size) / 2;
    coordinate.clamp(i64::from(i32::MIN), i64::from(i32::MAX)) as i32
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn standard_work_area_uses_base_size_and_centers() {
        let geometry = calculate_quick_panel_geometry(
            PhysicalWorkArea {
                x: 0,
                y: 0,
                width: 1920,
                height: 1080,
            },
            1.0,
        )
        .expect("geometry");

        assert_eq!(geometry.logical_width, 840.0);
        assert_eq!(geometry.logical_height, 640.0);
        assert_eq!(geometry.physical_x, 540);
        assert_eq!(geometry.physical_y, 220);
    }

    #[test]
    fn short_work_area_caps_height_without_overflow() {
        let geometry = calculate_quick_panel_geometry(
            PhysicalWorkArea {
                x: 0,
                y: 0,
                width: 1366,
                height: 768,
            },
            1.0,
        )
        .expect("geometry");

        assert_eq!(geometry.logical_width, 840.0);
        assert_eq!(geometry.logical_height, 629.0);
        assert_eq!(geometry.physical_x, 263);
        assert_eq!(geometry.physical_y, 69);
    }

    #[test]
    fn high_dpi_monitor_preserves_base_logical_size() {
        let geometry = calculate_quick_panel_geometry(
            PhysicalWorkArea {
                x: 0,
                y: 0,
                width: 3840,
                height: 2160,
            },
            2.0,
        )
        .expect("geometry");

        assert_eq!(geometry.logical_width, 840.0);
        assert_eq!(geometry.logical_height, 640.0);
        assert_eq!(geometry.physical_x, 1080);
        assert_eq!(geometry.physical_y, 440);
    }

    #[test]
    fn fractional_dpi_keeps_negative_secondary_monitor_coordinates() {
        let geometry = calculate_quick_panel_geometry(
            PhysicalWorkArea {
                x: -1600,
                y: 0,
                width: 1600,
                height: 900,
            },
            1.25,
        )
        .expect("geometry");

        assert_eq!(geometry.logical_width, 840.0);
        assert_eq!(geometry.logical_height, 590.0);
        assert_eq!(geometry.physical_x, -1325);
        assert_eq!(geometry.physical_y, 81);
    }

    #[test]
    fn tiny_work_area_takes_precedence_over_conditional_minimum() {
        let geometry = calculate_quick_panel_geometry(
            PhysicalWorkArea {
                x: -600,
                y: -400,
                width: 600,
                height: 400,
            },
            1.0,
        )
        .expect("geometry");

        assert_eq!(geometry.logical_width, 540.0);
        assert_eq!(geometry.logical_height, 328.0);
        assert_eq!(geometry.physical_x, -570);
        assert_eq!(geometry.physical_y, -364);
    }

    #[test]
    fn rejects_invalid_scale_factor_and_empty_work_area() {
        let work_area = PhysicalWorkArea {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        };

        assert!(calculate_quick_panel_geometry(work_area, 0.0).is_err());
        assert!(
            calculate_quick_panel_geometry(
                PhysicalWorkArea {
                    width: 0,
                    ..work_area
                },
                1.0
            )
            .is_err()
        );
    }
}
