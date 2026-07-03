use std::fmt::Display;

#[cfg(debug_assertions)]
pub fn dev_log_error(context: &str, error: impl Display) {
    eprintln!("[anythingFast] {context}: {error}");
}

#[cfg(not(debug_assertions))]
pub fn dev_log_error(_context: &str, _error: impl Display) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dev_log_error_accepts_display_values() {
        dev_log_error("test context", "test error");
    }
}
