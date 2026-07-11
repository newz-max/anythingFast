use arboard::{Clipboard, Error as ClipboardError};
use chrono::{DateTime, Utc};
use serde::Serialize;

const MAX_CLIPBOARD_TEXT_BYTES: usize = 16 * 1024;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClipboardContextSnapshot {
    pub source: ClipboardContextSource,
    pub captured_at: DateTime<Utc>,
    pub status: ClipboardContextStatus,
    pub text: String,
    pub truncated: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ClipboardContextSource {
    Clipboard,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ClipboardContextStatus {
    Available,
    Empty,
    Unavailable,
    Unsupported,
}

pub trait ClipboardReader {
    fn read_unicode_text(&mut self) -> ClipboardReadResult;
}

pub enum ClipboardReadResult {
    Text(String),
    Empty,
    Unavailable,
    Unsupported,
}

pub fn get_clipboard_context() -> ClipboardContextSnapshot {
    let mut reader = SystemClipboardReader;
    sample_clipboard_context(&mut reader, Utc::now())
}

pub fn sample_clipboard_context(
    reader: &mut impl ClipboardReader,
    captured_at: DateTime<Utc>,
) -> ClipboardContextSnapshot {
    let (status, text, truncated) = match reader.read_unicode_text() {
        ClipboardReadResult::Text(text) if text.is_empty() => {
            (ClipboardContextStatus::Empty, String::new(), false)
        }
        ClipboardReadResult::Text(text) => {
            let (text, truncated) = truncate_at_char_boundary(text, MAX_CLIPBOARD_TEXT_BYTES);
            (ClipboardContextStatus::Available, text, truncated)
        }
        ClipboardReadResult::Empty => (ClipboardContextStatus::Empty, String::new(), false),
        ClipboardReadResult::Unavailable => {
            (ClipboardContextStatus::Unavailable, String::new(), false)
        }
        ClipboardReadResult::Unsupported => {
            (ClipboardContextStatus::Unsupported, String::new(), false)
        }
    };

    ClipboardContextSnapshot {
        source: ClipboardContextSource::Clipboard,
        captured_at,
        status,
        text,
        truncated,
    }
}

struct SystemClipboardReader;

impl ClipboardReader for SystemClipboardReader {
    fn read_unicode_text(&mut self) -> ClipboardReadResult {
        let Ok(mut clipboard) = Clipboard::new() else {
            return ClipboardReadResult::Unavailable;
        };

        match clipboard.get_text() {
            Ok(text) if text.is_empty() => ClipboardReadResult::Empty,
            Ok(text) => ClipboardReadResult::Text(text),
            Err(ClipboardError::ContentNotAvailable) => ClipboardReadResult::Unsupported,
            Err(_) => ClipboardReadResult::Unavailable,
        }
    }
}

fn truncate_at_char_boundary(text: String, max_bytes: usize) -> (String, bool) {
    if text.len() <= max_bytes {
        return (text, false);
    }

    let mut end = max_bytes;
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    (text[..end].to_string(), true)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct FakeReader(ClipboardReadResult);

    impl ClipboardReader for FakeReader {
        fn read_unicode_text(&mut self) -> ClipboardReadResult {
            std::mem::replace(&mut self.0, ClipboardReadResult::Empty)
        }
    }

    fn captured_at() -> DateTime<Utc> {
        "2026-07-11T00:00:00Z".parse().expect("valid timestamp")
    }

    #[test]
    fn unicode_text_is_available_without_truncation() {
        let mut reader = FakeReader(ClipboardReadResult::Text("https://example.com/你好".into()));

        let snapshot = sample_clipboard_context(&mut reader, captured_at());

        assert_eq!(snapshot.status, ClipboardContextStatus::Available);
        assert_eq!(snapshot.text, "https://example.com/你好");
        assert!(!snapshot.truncated);
    }

    #[test]
    fn empty_and_non_text_read_results_are_sanitized() {
        let mut empty_reader = FakeReader(ClipboardReadResult::Empty);
        let mut non_text_reader = FakeReader(ClipboardReadResult::Unsupported);

        assert_eq!(
            sample_clipboard_context(&mut empty_reader, captured_at()).status,
            ClipboardContextStatus::Empty
        );
        let unsupported = sample_clipboard_context(&mut non_text_reader, captured_at());
        assert_eq!(unsupported.status, ClipboardContextStatus::Unsupported);
        assert!(unsupported.text.is_empty());
    }

    #[test]
    fn unavailable_clipboard_does_not_return_reader_details() {
        let mut reader = FakeReader(ClipboardReadResult::Unavailable);

        let snapshot = sample_clipboard_context(&mut reader, captured_at());

        assert_eq!(snapshot.status, ClipboardContextStatus::Unavailable);
        assert!(snapshot.text.is_empty());
    }

    #[test]
    fn exact_16_kib_text_is_not_truncated() {
        let mut reader = FakeReader(ClipboardReadResult::Text("a".repeat(MAX_CLIPBOARD_TEXT_BYTES)));

        let snapshot = sample_clipboard_context(&mut reader, captured_at());

        assert_eq!(snapshot.text.len(), MAX_CLIPBOARD_TEXT_BYTES);
        assert!(!snapshot.truncated);
    }

    #[test]
    fn overlong_unicode_text_is_truncated_at_a_character_boundary() {
        let mut reader = FakeReader(ClipboardReadResult::Text("你".repeat(MAX_CLIPBOARD_TEXT_BYTES)));

        let snapshot = sample_clipboard_context(&mut reader, captured_at());

        assert_eq!(snapshot.status, ClipboardContextStatus::Available);
        assert!(snapshot.truncated);
        assert!(snapshot.text.len() <= MAX_CLIPBOARD_TEXT_BYTES);
        assert!(snapshot.text.is_char_boundary(snapshot.text.len()));
    }

    #[test]
    fn snapshot_serializes_with_camel_case_fields_and_statuses() {
        let mut reader = FakeReader(ClipboardReadResult::Text("https://example.com".into()));

        let value = serde_json::to_value(sample_clipboard_context(&mut reader, captured_at()))
            .expect("serialize snapshot");

        assert_eq!(value["source"], "clipboard");
        assert_eq!(value["status"], "available");
        assert_eq!(value["capturedAt"], "2026-07-11T00:00:00Z");
        assert_eq!(value["truncated"], false);
    }
}
