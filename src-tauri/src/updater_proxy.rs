use crate::domain::UpdateProxyResolution;
use url::Url;

const SOURCE_WINDOWS_USER_PROXY: &str = "windowsUserProxy";

pub fn resolve_update_proxy() -> UpdateProxyResolution {
    #[cfg(windows)]
    {
        return resolve_windows_update_proxy();
    }

    #[cfg(not(windows))]
    {
        resolution(None, "unsupportedPlatform")
    }
}

#[cfg(windows)]
fn resolve_windows_update_proxy() -> UpdateProxyResolution {
    match read_windows_proxy_settings() {
        Ok(settings) => {
            resolve_proxy_from_settings(settings.enabled, settings.proxy_server.as_deref())
        }
        Err(_) => resolution(None, "readFailed"),
    }
}

#[cfg(windows)]
struct WindowsProxySettings {
    enabled: bool,
    proxy_server: Option<String>,
}

#[cfg(windows)]
fn read_windows_proxy_settings() -> Result<WindowsProxySettings, String> {
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{
        HKEY, HKEY_CURRENT_USER, KEY_READ, REG_DWORD, REG_EXPAND_SZ, REG_SZ, RegCloseKey,
        RegOpenKeyExW, RegQueryValueExW,
    };

    struct RegistryKey(HKEY);

    impl Drop for RegistryKey {
        fn drop(&mut self) {
            unsafe {
                let _ = RegCloseKey(self.0);
            }
        }
    }

    unsafe fn query_dword(key: HKEY, name: &str) -> Option<u32> {
        let mut value_type = 0;
        let mut data = 0u32;
        let mut data_len = std::mem::size_of::<u32>() as u32;
        let status = unsafe {
            RegQueryValueExW(
                key,
                wide_null(name).as_ptr(),
                null_mut(),
                &mut value_type,
                &mut data as *mut u32 as *mut u8,
                &mut data_len,
            )
        };
        if status == ERROR_SUCCESS && value_type == REG_DWORD {
            Some(data)
        } else {
            None
        }
    }

    unsafe fn query_string(key: HKEY, name: &str) -> Option<String> {
        let mut value_type = 0;
        let mut data_len = 0u32;
        let value_name = wide_null(name);
        let status = unsafe {
            RegQueryValueExW(
                key,
                value_name.as_ptr(),
                null_mut(),
                &mut value_type,
                null_mut(),
                &mut data_len,
            )
        };
        if status != ERROR_SUCCESS || !matches!(value_type, REG_SZ | REG_EXPAND_SZ) || data_len == 0
        {
            return None;
        }

        let mut data = vec![0u16; data_len.div_ceil(2) as usize];
        let status = unsafe {
            RegQueryValueExW(
                key,
                value_name.as_ptr(),
                null_mut(),
                &mut value_type,
                data.as_mut_ptr() as *mut u8,
                &mut data_len,
            )
        };
        if status != ERROR_SUCCESS || !matches!(value_type, REG_SZ | REG_EXPAND_SZ) {
            return None;
        }

        let end = data.iter().position(|ch| *ch == 0).unwrap_or(data.len());
        Some(String::from_utf16_lossy(&data[..end]))
    }

    let path = wide_null("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings");
    let mut key: HKEY = null_mut();
    let status = unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, path.as_ptr(), 0, KEY_READ, &mut key) };
    if status != ERROR_SUCCESS {
        return Err(format!("open registry key failed: {status}"));
    }
    let key = RegistryKey(key);

    let enabled = unsafe { query_dword(key.0, "ProxyEnable") }.unwrap_or(0) != 0;
    let proxy_server = unsafe { query_string(key.0, "ProxyServer") };

    Ok(WindowsProxySettings {
        enabled,
        proxy_server,
    })
}

#[cfg(windows)]
fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

pub(crate) fn resolve_proxy_from_settings(
    enabled: bool,
    proxy_server: Option<&str>,
) -> UpdateProxyResolution {
    if !enabled {
        return resolution(None, "disabled");
    }

    let Some(proxy_server) = proxy_server
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return resolution(None, "empty");
    };

    match parse_proxy_server(proxy_server) {
        Some(proxy_url) => resolution(Some(proxy_url), "resolved"),
        None => resolution(None, "unsupported"),
    }
}

pub(crate) fn parse_proxy_server(proxy_server: &str) -> Option<String> {
    let proxy_server = proxy_server.trim();
    if proxy_server.is_empty() {
        return None;
    }

    if proxy_server.contains('=') || proxy_server.contains(';') {
        let entries: Vec<(&str, &str)> = proxy_server
            .split(';')
            .filter_map(|entry| {
                let (scheme, value) = entry.split_once('=')?;
                let scheme = scheme.trim();
                let value = value.trim();
                if scheme.is_empty() || value.is_empty() {
                    None
                } else {
                    Some((scheme, value))
                }
            })
            .collect();

        for preferred in ["https", "http"] {
            if let Some((_, value)) = entries
                .iter()
                .find(|(scheme, _)| scheme.eq_ignore_ascii_case(preferred))
            {
                return normalize_proxy_value(value);
            }
        }

        return None;
    }

    normalize_proxy_value(proxy_server)
}

fn normalize_proxy_value(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.chars().any(char::is_whitespace) {
        return None;
    }

    let candidate = if has_url_scheme(trimmed) {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    };

    let parsed = Url::parse(&candidate).ok()?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        return None;
    }

    Some(parsed.to_string())
}

fn has_url_scheme(value: &str) -> bool {
    value.find("://").is_some_and(|index| {
        let scheme = &value[..index];
        !scheme.is_empty()
            && scheme
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '+' | '-' | '.'))
    })
}

fn resolution(proxy_url: Option<String>, status: &str) -> UpdateProxyResolution {
    UpdateProxyResolution {
        proxy_url,
        source: SOURCE_WINDOWS_USER_PROXY.to_string(),
        status: status.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_proxy_server, resolve_proxy_from_settings};

    #[test]
    fn parses_single_host_port_proxy() {
        assert_eq!(
            parse_proxy_server("127.0.0.1:7890"),
            Some("http://127.0.0.1:7890/".to_string())
        );
    }

    #[test]
    fn parses_per_scheme_proxy_preferring_https() {
        assert_eq!(
            parse_proxy_server("http=127.0.0.1:8080;https=127.0.0.1:7890"),
            Some("http://127.0.0.1:7890/".to_string())
        );
    }

    #[test]
    fn keeps_explicit_http_or_https_scheme() {
        assert_eq!(
            parse_proxy_server("https://proxy.example.com:443"),
            Some("https://proxy.example.com/".to_string())
        );
    }

    #[test]
    fn rejects_unsupported_proxy_schemes() {
        assert_eq!(parse_proxy_server("socks=127.0.0.1:7890"), None);
        assert_eq!(parse_proxy_server("socks5://127.0.0.1:7890"), None);
    }

    #[test]
    fn disabled_or_empty_settings_fall_back_to_direct() {
        let disabled = resolve_proxy_from_settings(false, Some("127.0.0.1:7890"));
        assert_eq!(disabled.proxy_url, None);
        assert_eq!(disabled.status, "disabled");

        let empty = resolve_proxy_from_settings(true, Some(" "));
        assert_eq!(empty.proxy_url, None);
        assert_eq!(empty.status, "empty");
    }

    #[test]
    fn malformed_settings_fall_back_to_direct() {
        let resolution = resolve_proxy_from_settings(true, Some("http= ; socks=127.0.0.1:7890"));
        assert_eq!(resolution.proxy_url, None);
        assert_eq!(resolution.status, "unsupported");
    }
}
