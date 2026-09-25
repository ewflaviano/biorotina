use axum::{extract::DefaultBodyLimit, http::StatusCode, routing::post, Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum Source {
    Runtime,
    Storage,
    Drive,
    Push,
    Photo,
    Billing,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum Code {
    RuntimeException,
    UnhandledRejection,
    RenderFailure,
    LocalStorageFailed,
    DriveSyncFailed,
    DriveReconnectRequired,
    PushFailed,
    PhotoAnalysisFailed,
    BillingFailed,
    NetworkFailed,
    ResponseInvalid,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum Screen {
    Home,
    Peso,
    Atividades,
    Alimentacao,
    Medicamentos,
    Hidratacao,
    Habitos,
    Mais,
    Configuracoes,
    Privacidade,
    Apoiar,
    Instalar,
    Assinatura,
    Unknown,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum Environment {
    Production,
    Development,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ClientError {
    source: Source,
    code: Code,
    screen: Screen,
    environment: Environment,
    status: Option<u16>,
}

#[tokio::main]
async fn main() -> Result<(), lambda_http::Error> {
    lambda_http::run(router()).await
}

fn router() -> Router {
    Router::new()
        .route("/api/telemetry/error", post(record))
        .layer(DefaultBodyLimit::max(512))
}

async fn record(Json(event): Json<ClientError>) -> StatusCode {
    // Reject invalid HTTP status values without echoing or logging the payload.
    if event
        .status
        .is_some_and(|status| !(100..=599).contains(&status))
    {
        return StatusCode::BAD_REQUEST;
    }
    eprintln!(
        "{}",
        json!({
            "level": "error",
            "kind": "client_error",
            "service": "frontend",
            "source": event.source,
            "code": event.code,
            "screen": event.screen,
            "environment": event.environment,
            "status": event.status,
        })
    );
    StatusCode::NO_CONTENT
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unapproved_fields_and_values() {
        for payload in [
            json!({"source":"runtime","code":"runtime_exception","screen":"home","environment":"production","message":"patient"}),
            json!({"source":"runtime","code":"runtime_exception","screen":"home","environment":"production","token":"secret"}),
            json!({"source":"runtime","code":"runtime_exception","screen":"#/alimentacao?email=x","environment":"production"}),
            json!({"source":"runtime","code":"arbitrary","screen":"home","environment":"production"}),
        ] {
            assert!(serde_json::from_value::<ClientError>(payload).is_err());
        }
    }

    #[tokio::test]
    async fn accepts_only_fixed_diagnostic_fields() {
        let event: ClientError = serde_json::from_value(json!({
            "source":"photo", "code":"response_invalid", "screen":"alimentacao", "environment":"development", "status":200
        }))
        .unwrap();
        assert_eq!(record(Json(event)).await, StatusCode::NO_CONTENT);
        let reconnect: ClientError = serde_json::from_value(json!({
            "source":"drive", "code":"drive_reconnect_required", "screen":"configuracoes", "environment":"production"
        }))
        .unwrap();
        assert_eq!(record(Json(reconnect)).await, StatusCode::NO_CONTENT);
    }
}
