use serde_json::json;

/// Only fixed, developer-authored labels belong here. Never pass request values,
/// upstream response bodies, error strings, identifiers or secrets to CloudWatch.
pub fn error(
    service: &'static str,
    operation: &'static str,
    code: &'static str,
    status: Option<u16>,
) {
    eprintln!(
        "{}",
        json!({
            "level": "error",
            "kind": "application_error",
            "service": service,
            "operation": operation,
            "code": code,
            "status": status,
        })
    );
}

/// For a failed upstream request, keep the app's response status separate from
/// the upstream status. Both codes and labels must be fixed and developer-authored.
pub fn error_with_upstream(
    service: &'static str,
    operation: &'static str,
    code: &'static str,
    status: Option<u16>,
    upstream_status: Option<u16>,
) {
    eprintln!(
        "{}",
        json!({
            "level": "error",
            "kind": "application_error",
            "service": service,
            "operation": operation,
            "code": code,
            "status": status,
            "upstream_status": upstream_status,
        })
    );
}

pub fn warning(
    service: &'static str,
    operation: &'static str,
    code: &'static str,
    status: Option<u16>,
) {
    eprintln!(
        "{}",
        json!({
            "level": "warning",
            "kind": "application_warning",
            "service": service,
            "operation": operation,
            "code": code,
            "status": status,
        })
    );
}
