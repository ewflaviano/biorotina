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
