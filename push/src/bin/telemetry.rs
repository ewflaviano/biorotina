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
    Feedback,
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
    FeedbackFailed,
    NetworkFailed,
    ResponseInvalid,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum Operation {
    AppRuntime,
    AppRender,
    StorageRead,
    StorageWrite,
    GoogleRestoreSession,
    GoogleConnect,
    GoogleReconnect,
    GoogleAuthorizeDrive,
    DriveList,
    DriveDownload,
    DriveHash,
    DriveCompare,
    DriveUpload,
    DriveRestore,
    DriveMerge,
    DriveDisconnect,
    DriveGuestMerge,
    PushLoad,
    PushSave,
    PushConfig,
    PushRegister,
    PushUpdate,
    PushRemove,
    PushTest,
    BillingRequest,
    BillingStatus,
    BillingTrialConfig,
    BillingCheckout,
    BillingCancel,
    PhotoAnalyze,
    PhotoParse,
    PhotoPrepare,
    FeedbackSend,
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
    // Optional until previously deployed browsers have refreshed the app.
    operation: Option<Operation>,
    screen: Screen,
    environment: Environment,
    status: Option<u16>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "kebab-case")]
enum Experiment {
    DemoHighlight,
    OnboardingInstallPrompt,
    HydrationQuickConfirmation,
    HydrationFormConfirmation,
    WeightFormConfirmation,
    ActivityFormConfirmation,
    HabitFormConfirmation,
    MedicationFormConfirmation,
    DailyRecordsLastDayShortcut,
    DailyRecordsNextDayShortcut,
    WeightHistoryEdit,
    WeightHistoryLastDayShortcut,
    HydrationHistoryLastDayShortcut,
    HabitHistoryClearSearch,
    MedicationHistoryClearSearch,
    FoodDailyCalories,
    MobileNavMealPriority,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum Arm {
    Control,
    Experiment,
}
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum Outcome {
    Exposure,
    Success,
    Error,
    Use,
    Rollback,
}
#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ExperimentMetric {
    experiment: Experiment,
    revision: u32,
    arm: Arm,
    #[serde(default)]
    manual: bool,
    outcome: Outcome,
    environment: Environment,
}
async fn record_experiment(Json(event): Json<ExperimentMetric>) -> StatusCode {
    if !(1..=2_147_483_647).contains(&event.revision) {
        return StatusCode::BAD_REQUEST;
    }
    // No cookies, IPs, IDs, buckets, free text or original request body are logged.
    eprintln!(
        "{}",
        json!({ "kind": if event.manual { "experiment_metric_manual" } else { "experiment_metric" }, "service": "frontend",
        "experiment": event.experiment, "revision": event.revision, "arm": event.arm,
        "outcome": event.outcome, "environment": event.environment })
    );
    StatusCode::NO_CONTENT
}

#[tokio::main]
async fn main() -> Result<(), lambda_http::Error> {
    lambda_http::run(router()).await
}

fn router() -> Router {
    Router::new()
        .route("/api/telemetry/error", post(record))
        .route("/api/telemetry/experiment", post(record_experiment))
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
            "operation": event.operation,
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

    #[tokio::test]
    async fn experiment_route_enforces_schema_and_body_limit_over_http() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!(
            "http://{}/api/telemetry/experiment",
            listener.local_addr().unwrap()
        );
        let server = tokio::spawn(async move {
            axum::serve(listener, router()).await.unwrap();
        });
        let client = reqwest::Client::new();
        let valid = json!({"experiment":"hydration-form-confirmation", "revision":2, "arm":"control", "outcome":"success", "environment":"development"});
        assert_eq!(
            client
                .post(&url)
                .json(&valid)
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::NO_CONTENT
        );
        for key in [
            "weight-history-edit",
            "weight-history-last-day-shortcut",
            "hydration-history-last-day-shortcut",
            "habit-history-clear-search",
            "medication-history-clear-search",
            "food-daily-calories",
        ] {
            let mut metric = valid.clone();
            metric["experiment"] = json!(key);
            assert_eq!(
                client
                    .post(&url)
                    .json(&metric)
                    .send()
                    .await
                    .unwrap()
                    .status(),
                StatusCode::NO_CONTENT
            );
        }
        let mut weight = valid.clone();
        weight["experiment"] = json!("weight-form-confirmation");
        assert_eq!(
            client
                .post(&url)
                .json(&weight)
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::NO_CONTENT
        );
        let mut activity = valid.clone();
        activity["experiment"] = json!("activity-form-confirmation");
        assert_eq!(
            client
                .post(&url)
                .json(&activity)
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::NO_CONTENT
        );
        let mut habit = valid.clone();
        habit["experiment"] = json!("habit-form-confirmation");
        assert_eq!(
            client
                .post(&url)
                .json(&habit)
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::NO_CONTENT
        );
        let mut medication = valid.clone();
        medication["experiment"] = json!("medication-form-confirmation");
        assert_eq!(
            client
                .post(&url)
                .json(&medication)
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::NO_CONTENT
        );
        let mut daily_records = valid.clone();
        daily_records["experiment"] = json!("daily-records-last-day-shortcut");
        assert_eq!(
            client
                .post(&url)
                .json(&daily_records)
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::NO_CONTENT
        );
        let mut extra = valid.clone();
        extra["account"] = json!("forbidden");
        assert_eq!(
            client
                .post(&url)
                .json(&extra)
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
        extra["account"] = json!("x".repeat(512));
        assert_eq!(
            client
                .post(&url)
                .json(&extra)
                .send()
                .await
                .unwrap()
                .status(),
            StatusCode::PAYLOAD_TOO_LARGE
        );
        server.abort();
    }

    #[tokio::test]
    async fn experiment_metrics_accept_both_arms_and_reject_unbounded_dimensions() {
        let base = json!({"experiment":"hydration-form-confirmation", "revision":2,
            "arm":"control", "outcome":"success", "environment":"development"});
        for arm in ["control", "experiment"] {
            for outcome in ["exposure", "success", "error", "use", "rollback"] {
                let mut value = base.clone();
                value["arm"] = json!(arm);
                value["outcome"] = json!(outcome);
                assert_eq!(
                    record_experiment(Json(serde_json::from_value(value).unwrap())).await,
                    StatusCode::NO_CONTENT
                );
            }
        }
        let mut manual = base.clone();
        manual["manual"] = json!(true);
        assert_eq!(
            record_experiment(Json(serde_json::from_value(manual).unwrap())).await,
            StatusCode::NO_CONTENT
        );
        let mut invalid_manual = base.clone();
        invalid_manual["manual"] = json!("true");
        assert!(serde_json::from_value::<ExperimentMetric>(invalid_manual).is_err());
        for key in [
            "weight-history-edit",
            "weight-history-last-day-shortcut",
            "hydration-history-last-day-shortcut",
            "habit-history-clear-search",
            "medication-history-clear-search",
            "food-daily-calories",
        ] {
            let mut value = base.clone();
            value["experiment"] = json!(key);
            assert_eq!(
                record_experiment(Json(serde_json::from_value(value).unwrap())).await,
                StatusCode::NO_CONTENT
            );
        }
        for field in ["account", "bucket", "token", "amount", "url", "message"] {
            let mut value = base.clone();
            value[field] = json!("forbidden");
            assert!(serde_json::from_value::<ExperimentMetric>(value).is_err());
        }
        for field in ["experiment", "arm", "outcome", "environment", "revision"] {
            let mut value = base.clone();
            value[field] = json!("unknown");
            assert!(serde_json::from_value::<ExperimentMetric>(value).is_err());
        }
        for revision in [0, 2_147_483_648_u32] {
            let mut value = base.clone();
            value["revision"] = json!(revision);
            assert_eq!(
                record_experiment(Json(serde_json::from_value(value).unwrap())).await,
                StatusCode::BAD_REQUEST
            );
        }
    }

    #[test]
    fn rejects_unapproved_fields_and_values() {
        for payload in [
            json!({"source":"runtime","code":"runtime_exception","screen":"home","environment":"production","message":"patient"}),
            json!({"source":"runtime","code":"runtime_exception","screen":"home","environment":"production","token":"secret"}),
            json!({"source":"runtime","code":"runtime_exception","screen":"#/alimentacao?email=x","environment":"production"}),
            json!({"source":"runtime","code":"arbitrary","screen":"home","environment":"production"}),
            json!({"source":"runtime","code":"runtime_exception","operation":"arbitrary","screen":"home","environment":"production"}),
        ] {
            assert!(serde_json::from_value::<ClientError>(payload).is_err());
        }
    }

    #[tokio::test]
    async fn accepts_only_fixed_diagnostic_fields() {
        let event: ClientError = serde_json::from_value(json!({
            "source":"photo", "code":"response_invalid", "operation":"photo_parse", "screen":"alimentacao", "environment":"development", "status":200
        }))
        .unwrap();
        assert_eq!(record(Json(event)).await, StatusCode::NO_CONTENT);
        let reconnect: ClientError = serde_json::from_value(json!({
            "source":"drive", "code":"drive_reconnect_required", "screen":"configuracoes", "environment":"production"
        }))
        .unwrap();
        assert_eq!(record(Json(reconnect)).await, StatusCode::NO_CONTENT);
        let feedback: ClientError = serde_json::from_value(json!({
            "source":"feedback", "code":"feedback_failed", "operation":"feedback_send", "screen":"apoiar", "environment":"production", "status":503
        }))
        .unwrap();
        assert_eq!(record(Json(feedback)).await, StatusCode::NO_CONTENT);
    }
}
