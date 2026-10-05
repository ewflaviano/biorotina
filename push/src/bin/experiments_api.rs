use aws_config::BehaviorVersion;
use aws_sdk_dynamodb::{types::AttributeValue as A, Client as Db};
use axum::{
    extract::{DefaultBodyLimit, State},
    http::{header, HeaderMap, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::sync::Mutex;

const COOKIE: &str = "biorotina_session";
const SESSION_PREFIX: &str = "DRIVE_SESSION#";
const DEMO_FEATURE: &str = "demo-highlight";
const FEATURES: &[&str] = &[
    DEMO_FEATURE,
    "onboarding-install-prompt",
    "hydration-quick-confirmation",
    "hydration-form-confirmation",
    "weight-form-confirmation",
    "activity-form-confirmation",
    "habit-form-confirmation",
    "medication-form-confirmation",
    "daily-records-last-day-shortcut",
    "daily-records-next-day-shortcut",
    "weight-history-edit",
    "weight-history-last-day-shortcut",
    "hydration-history-last-day-shortcut",
];
const CACHE_FOR: Duration = Duration::from_secs(60);

#[derive(Clone)]
struct App {
    db: Db,
    billing_table: String,
    experiments_table: String,
    cache: Arc<Mutex<HashMap<String, (Instant, ExperimentConfig)>>>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ExperimentConfig {
    enabled: bool,
    kill_switch: bool,
    rollout_percent: u8,
    revision: u64,
}

impl Default for ExperimentConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            kill_switch: false,
            rollout_percent: 0,
            revision: 1,
        }
    }
}

fn valid_config(config: &ExperimentConfig) -> bool {
    config.rollout_percent <= 100 && (1..=2_147_483_647).contains(&config.revision)
}

fn unavailable() -> ExperimentConfig {
    ExperimentConfig {
        kill_switch: true,
        ..ExperimentConfig::default()
    }
}

#[tokio::main]
async fn main() -> Result<(), lambda_http::Error> {
    let config = aws_config::load_defaults(BehaviorVersion::latest()).await;
    lambda_http::run(router(App {
        db: Db::new(&config),
        billing_table: std::env::var("BILLING_TABLE_NAME")?,
        experiments_table: std::env::var("EXPERIMENTS_TABLE_NAME")?,
        cache: Arc::new(Mutex::new(HashMap::new())),
    }))
    .await
}

fn router(app: App) -> Router {
    Router::new()
        .route("/api/experiments", get(assignments).options(preflight))
        .route("/api/experiments/demo", post(demo).options(preflight))
        .layer(DefaultBodyLimit::max(512))
        .with_state(app)
}

async fn preflight() -> StatusCode {
    StatusCode::NO_CONTENT
}

fn digest(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}
fn session_key(raw: &str) -> String {
    format!("{SESSION_PREFIX}{}", digest(raw))
}
fn cookie(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .map(str::trim)
        .find_map(|item| item.strip_prefix(&format!("{COOKIE}=")))
}
fn forced(headers: &HeaderMap, feature: &str) -> bool {
    headers
        .get("x-biorotina-force-experiment")
        .and_then(|v| v.to_str().ok())
        .is_some_and(|value| {
            value
                .split(',')
                .any(|item| item.trim() == format!("{feature}=enabled"))
        })
}

async fn account_key(app: &App, headers: &HeaderMap) -> Option<String> {
    let raw = cookie(headers)?;
    let item = app
        .db
        .get_item()
        .table_name(&app.billing_table)
        .key("pk", A::S(session_key(raw)))
        .send()
        .await
        .ok()?
        .item?;
    item.get("accountKey")?.as_s().ok().cloned()
}

async fn config(app: &App, feature: &str) -> ExperimentConfig {
    if let Some((loaded, config)) = app.cache.lock().await.get(feature).cloned() {
        if loaded.elapsed() < CACHE_FOR {
            return config;
        }
    }
    let loaded = match app
        .db
        .get_item()
        .table_name(&app.experiments_table)
        .key("pk", A::S(format!("EXPERIMENT#{feature}")))
        .send()
        .await
    {
        Ok(output) => match output.item {
            None => ExperimentConfig::default(),
            Some(item) => item
                .get("config")
                .and_then(|value| value.as_s().ok())
                .and_then(|value| serde_json::from_str::<ExperimentConfig>(value).ok())
                .filter(valid_config)
                .unwrap_or_else(unavailable),
        },
        Err(_) => unavailable(),
    };
    app.cache
        .lock()
        .await
        .insert(feature.to_owned(), (Instant::now(), loaded.clone()));
    loaded
}

fn bucket(feature: &str, account: &str) -> u8 {
    let bytes = Sha256::digest(format!("{feature}:{account}").as_bytes());
    u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]).rem_euclid(100) as u8
}

fn enabled(config: &ExperimentConfig, feature: &str, account: Option<&str>, force: bool) -> bool {
    if config.kill_switch {
        return false;
    }
    let Some(account) = account else {
        return false;
    };
    // Any signed-in contributor can opt in with the browser header. A remote
    // kill switch still takes priority, even over an explicit opt-in.
    if force {
        return true;
    }
    if !config.enabled {
        return false;
    }
    bucket(feature, account) < config.rollout_percent
}

fn response(
    status: StatusCode,
    body: Value,
) -> (StatusCode, [(HeaderName, &'static str); 2], Json<Value>) {
    (
        status,
        [
            (header::CACHE_CONTROL, "no-store"),
            (header::VARY, "Origin"),
        ],
        Json(body),
    )
}
use axum::http::HeaderName;

async fn assignments(
    State(app): State<App>,
    headers: HeaderMap,
) -> (StatusCode, [(HeaderName, &'static str); 2], Json<Value>) {
    let account = account_key(&app, &headers).await;
    let mut configs = Vec::new();
    for feature in FEATURES {
        configs.push((*feature, config(&app, feature).await));
    }
    response(
        StatusCode::OK,
        decisions(&configs, account.as_deref(), &headers),
    )
}

fn decisions(
    configs: &[(&str, ExperimentConfig)],
    account: Option<&str>,
    headers: &HeaderMap,
) -> Value {
    let mut active = Vec::new();
    let mut revisions = serde_json::Map::new();
    let mut browser = serde_json::Map::new();
    let mut forced_keys = Vec::new();
    for (feature, config) in configs {
        let force = account.is_some() && forced(headers, feature) && !config.kill_switch;
        if force {
            forced_keys.push(*feature);
        }
        // Keep legacy assignments during rolling frontend deployment. Protected
        // operations still evaluate their account-based gate on the server.
        if enabled(config, feature, account, force) {
            active.push(*feature);
            revisions.insert((*feature).to_owned(), json!(config.revision));
        }
        if *feature != DEMO_FEATURE {
            browser.insert((*feature).to_owned(), json!(config));
        }
    }
    json!({"enabled": active, "revisions": revisions, "browser": browser, "forced": forced_keys})
}

async fn demo(
    State(app): State<App>,
    headers: HeaderMap,
) -> (StatusCode, [(HeaderName, &'static str); 2], Json<Value>) {
    if headers
        .get("x-biorotina-experiment")
        .and_then(|v| v.to_str().ok())
        != Some(DEMO_FEATURE)
    {
        return response(
            StatusCode::FORBIDDEN,
            json!({"error":"Experimento indisponível."}),
        );
    }
    let account = account_key(&app, &headers).await;
    let config = config(&app, DEMO_FEATURE).await;
    if !enabled(
        &config,
        DEMO_FEATURE,
        account.as_deref(),
        forced(&headers, DEMO_FEATURE),
    ) {
        return response(
            StatusCode::FORBIDDEN,
            json!({"error":"Experimento indisponível."}),
        );
    }
    response(StatusCode::OK, json!({"enabled":true}))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn config() -> ExperimentConfig {
        ExperimentConfig {
            enabled: true,
            kill_switch: false,
            rollout_percent: 0,
            revision: 1,
        }
    }
    #[test]
    fn public_configuration_does_not_authorize_anonymous_requests_or_header() {
        let mut headers = HeaderMap::new();
        headers.insert(
            "x-biorotina-force-experiment",
            "demo-highlight=enabled,hydration-form-confirmation=enabled"
                .parse()
                .unwrap(),
        );
        let configs: Vec<_> = FEATURES
            .iter()
            .map(|key| (*key, ExperimentConfig::default()))
            .collect();
        let anonymous = decisions(&configs, None, &headers);
        assert_eq!(anonymous["enabled"], json!([]));
        assert_eq!(anonymous["forced"], json!([]));
        assert!(anonymous["browser"].get(DEMO_FEATURE).is_none());
        assert_eq!(
            anonymous["browser"]["hydration-form-confirmation"]["enabled"],
            false
        );
        let authenticated = decisions(&configs, Some("test"), &headers);
        assert_eq!(
            authenticated["forced"],
            json!([DEMO_FEATURE, "hydration-form-confirmation"])
        );
        let stopped = decisions(
            &[("hydration-form-confirmation", unavailable())],
            Some("test"),
            &headers,
        );
        assert_eq!(stopped["forced"], json!([]));
        assert_eq!(
            stopped["browser"]["hydration-form-confirmation"]["killSwitch"],
            true
        );
    }

    #[test]
    fn rejects_invalid_revisions_and_percentages() {
        for value in [
            ExperimentConfig {
                revision: 0,
                ..config()
            },
            ExperimentConfig {
                revision: 2_147_483_648,
                ..config()
            },
            ExperimentConfig {
                rollout_percent: 101,
                ..config()
            },
        ] {
            assert!(!valid_config(&value));
        }
    }

    #[test]
    fn every_registered_feature_defaults_off_and_respects_kill_switch() {
        for feature in FEATURES {
            let mut value = ExperimentConfig::default();
            assert!(!enabled(&value, feature, Some("test-account"), false));
            assert!(!enabled(&value, feature, None, true));
            assert!(enabled(&value, feature, Some("test-account"), true));
            value.kill_switch = true;
            assert!(!enabled(&value, feature, Some("test-account"), true));
        }
    }
    #[test]
    fn force_header_enables_any_authenticated_account() {
        let disabled = ExperimentConfig::default();
        assert!(enabled(&disabled, DEMO_FEATURE, Some("account"), true));
        assert!(!enabled(&disabled, DEMO_FEATURE, Some("account"), false));
    }
    #[test]
    fn rollout_is_deterministic_and_kill_switch_wins() {
        let mut value = config();
        value.rollout_percent = 100;
        assert!(enabled(&value, DEMO_FEATURE, Some("account"), false));
        assert_eq!(
            bucket(DEMO_FEATURE, "account"),
            bucket(DEMO_FEATURE, "account")
        );
        value.kill_switch = true;
        assert!(!enabled(&value, DEMO_FEATURE, Some("account"), false));
    }
}
