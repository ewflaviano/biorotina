use aws_config::BehaviorVersion;
use aws_sdk_dynamodb::{types::AttributeValue as A, Client as Db};
use aws_sdk_secretsmanager::Client as Secrets;
use axum::{
    extract::{DefaultBodyLimit, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{sync::Arc, time::Duration};
use uuid::Uuid;

const DRIVE_SCOPE: &str = "https://www.googleapis.com/auth/drive.appdata";
const ALLOWED_SCOPES: [&str; 5] = [
    "openid",
    "email",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    DRIVE_SCOPE,
];
const COOKIE: &str = "biorotina_session";
const SESSION_SECONDS: i64 = 30 * 24 * 60 * 60;
const SESSION_PREFIX: &str = "DRIVE_SESSION#";

#[derive(Clone)]
struct App {
    db: Db,
    table: String,
    client_id: String,
    client_secret: Arc<String>,
    client: reqwest::Client,
    site_origin: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExchangeRequest {
    code: String,
}

#[derive(Deserialize)]
struct GoogleTokens {
    access_token: String,
    expires_in: i64,
    scope: String,
    id_token: String,
    refresh_token: Option<String>,
}

#[derive(Deserialize)]
struct Identity {
    sub: String,
    email: String,
    aud: String,
    iss: String,
    email_verified: Option<VerifiedClaim>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum VerifiedClaim {
    Boolean(bool),
    Text(String),
}

impl VerifiedClaim {
    fn is_unverified(&self) -> bool {
        match self {
            Self::Boolean(value) => !value,
            Self::Text(value) => !value.eq_ignore_ascii_case("true"),
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), lambda_http::Error> {
    let config = aws_config::load_defaults(BehaviorVersion::latest()).await;
    let secrets = Secrets::new(&config);
    let secret = secrets
        .get_secret_value()
        .secret_id(std::env::var("GOOGLE_OAUTH_SECRET_ARN")?)
        .send()
        .await?;
    let parsed: Value =
        serde_json::from_str(secret.secret_string().ok_or("OAuth secret is empty")?)?;
    let client_secret = parsed
        .get("clientSecret")
        .and_then(Value::as_str)
        .filter(|v| !v.is_empty())
        .ok_or("Google OAuth client secret is not configured")?
        .to_owned();
    let app = App {
        db: Db::new(&config),
        table: std::env::var("BILLING_TABLE_NAME")?,
        client_id: std::env::var("GOOGLE_CLIENT_ID")?,
        client_secret: Arc::new(client_secret),
        client: reqwest::Client::builder()
            .timeout(Duration::from_secs(12))
            .build()?,
        site_origin: std::env::var("PUBLIC_APP_URL")?,
    };
    lambda_http::run(router(app)).await
}

fn router(app: App) -> Router {
    Router::new()
        .route(
            "/api/auth/google/exchange",
            post(exchange).options(preflight),
        )
        .route("/api/auth/drive-token", get(drive_token).options(preflight))
        .route(
            "/api/auth/access-token",
            get(access_token).options(preflight),
        )
        .route("/api/auth/logout", post(logout).options(preflight))
        .layer(DefaultBodyLimit::max(8_000))
        .with_state(app)
}

async fn preflight() -> StatusCode {
    StatusCode::NO_CONTENT
}

fn response(
    status: StatusCode,
    body: Value,
    origin: &str,
    app: &App,
    cookie: Option<String>,
) -> (StatusCode, HeaderMap, Json<Value>) {
    let mut headers = HeaderMap::new();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers.insert(header::VARY, HeaderValue::from_static("Origin"));
    if origin == app.site_origin
        || origin == "http://localhost:5173"
        || origin == "http://127.0.0.1:5173"
    {
        if let Ok(value) = HeaderValue::from_str(origin) {
            headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, value);
        }
        headers.insert(
            header::ACCESS_CONTROL_ALLOW_CREDENTIALS,
            HeaderValue::from_static("true"),
        );
        headers.insert(
            header::ACCESS_CONTROL_ALLOW_HEADERS,
            HeaderValue::from_static("content-type,x-requested-with"),
        );
        headers.insert(
            header::ACCESS_CONTROL_ALLOW_METHODS,
            HeaderValue::from_static("GET,POST,OPTIONS"),
        );
    }
    if let Some(cookie) = cookie {
        if let Ok(value) = HeaderValue::from_str(&cookie) {
            headers.insert(header::SET_COOKIE, value);
        }
    }
    (status, headers, Json(body))
}

fn origin(headers: &HeaderMap) -> Option<&str> {
    headers.get(header::ORIGIN)?.to_str().ok()
}
fn allowed_origin(headers: &HeaderMap, app: &App) -> bool {
    origin(headers).is_some_and(|v| {
        v == app.site_origin || v == "http://localhost:5173" || v == "http://127.0.0.1:5173"
    })
}
fn session_cookie(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .map(str::trim)
        .find_map(|pair| pair.strip_prefix(&format!("{COOKIE}=")))
}
fn digest(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}
fn session_key(raw: &str) -> String {
    format!("{SESSION_PREFIX}{}", digest(raw))
}
fn account_key(sub: &str) -> String {
    format!("DRIVE_ACCOUNT#{}", digest(sub))
}
fn valid_scopes(scopes: &str) -> bool {
    let requested = scopes.split_whitespace().collect::<Vec<_>>();
    requested.contains(&"openid") && requested.iter().all(|scope| ALLOWED_SCOPES.contains(scope))
}

async fn exchange(
    State(app): State<App>,
    headers: HeaderMap,
    Json(input): Json<ExchangeRequest>,
) -> (StatusCode, HeaderMap, Json<Value>) {
    let org = origin(&headers).unwrap_or("");
    if !allowed_origin(&headers, &app)
        || headers
            .get("x-requested-with")
            .and_then(|v| v.to_str().ok())
            != Some("XMLHttpRequest")
        || input.code.is_empty()
        || input.code.len() > 4096
    {
        return response(
            StatusCode::FORBIDDEN,
            json!({"error":"Origem não autorizada."}),
            org,
            &app,
            None,
        );
    }
    let tokens = match app
        .client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", input.code.as_str()),
            ("client_id", app.client_id.as_str()),
            ("client_secret", app.client_secret.as_str()),
            ("grant_type", "authorization_code"),
            ("redirect_uri", org),
        ])
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => match r.json::<GoogleTokens>().await {
            Ok(v) => v,
            Err(_) => {
                return response(
                    StatusCode::BAD_GATEWAY,
                    json!({"error":"Resposta inválida do Google."}),
                    org,
                    &app,
                    None,
                )
            }
        },
        _ => {
            return response(
                StatusCode::UNAUTHORIZED,
                json!({"error":"O Google não autorizou a conexão."}),
                org,
                &app,
                None,
            )
        }
    };
    let identity = match app
        .client
        .get("https://oauth2.googleapis.com/tokeninfo")
        .query(&[("id_token", &tokens.id_token)])
        .send()
        .await
    {
        Ok(r) if r.status().is_success() => match r.json::<Identity>().await {
            Ok(v) => v,
            Err(_) => {
                return response(
                    StatusCode::BAD_GATEWAY,
                    json!({"error":"Identidade Google inválida."}),
                    org,
                    &app,
                    None,
                )
            }
        },
        _ => {
            return response(
                StatusCode::UNAUTHORIZED,
                json!({"error":"Não foi possível confirmar a conta Google."}),
                org,
                &app,
                None,
            )
        }
    };
    if identity.aud != app.client_id
        || !(identity.iss == "accounts.google.com" || identity.iss == "https://accounts.google.com")
        || identity
            .email_verified
            .as_ref()
            .is_some_and(VerifiedClaim::is_unverified)
        || !valid_scopes(&tokens.scope)
    {
        return response(
            StatusCode::UNAUTHORIZED,
            json!({"error":"A conta Google não corresponde à autorização."}),
            org,
            &app,
            None,
        );
    }
    let session = Uuid::new_v4().to_string();
    let expires = Utc::now().timestamp() + SESSION_SECONDS;
    let account_pk = account_key(&identity.sub);
    let old_item = app
        .db
        .get_item()
        .table_name(&app.table)
        .key("pk", A::S(account_pk.clone()))
        .send()
        .await
        .ok()
        .and_then(|v| v.item);
    let old_refresh = old_item
        .as_ref()
        .and_then(|v| v.get("refreshToken").and_then(|v| v.as_s().ok()).cloned());
    let old_scopes = old_item
        .as_ref()
        .and_then(|v| v.get("scopes").and_then(|v| v.as_s().ok()).cloned())
        .unwrap_or_default();
    let scopes = old_scopes
        .split_whitespace()
        .chain(tokens.scope.split_whitespace())
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>()
        .join(" ");
    if tokens.refresh_token.is_none() && old_refresh.is_none() {
        return response(
            StatusCode::CONFLICT,
            json!({"error":"O Google não forneceu uma autorização duradoura. Revogue a autorização antiga da Biorotina na Conta Google e conecte novamente."}),
            org,
            &app,
            None,
        );
    }
    let mut account = std::collections::HashMap::new();
    account.insert("pk".into(), A::S(account_pk));
    account.insert("scopes".into(), A::S(scopes.clone()));
    if let Some(refresh) = tokens.refresh_token.or(old_refresh) {
        account.insert("refreshToken".into(), A::S(refresh));
    }
    if app
        .db
        .put_item()
        .table_name(&app.table)
        .set_item(Some(account))
        .send()
        .await
        .is_err()
    {
        return response(
            StatusCode::SERVICE_UNAVAILABLE,
            json!({"error":"Não foi possível guardar a sessão."}),
            org,
            &app,
            None,
        );
    }
    let mut item = std::collections::HashMap::new();
    item.insert("pk".into(), A::S(session_key(&session)));
    item.insert("accountKey".into(), A::S(account_key(&identity.sub)));
    item.insert("ttl".into(), A::N(expires.to_string()));
    if app
        .db
        .put_item()
        .table_name(&app.table)
        .set_item(Some(item))
        .send()
        .await
        .is_err()
    {
        return response(
            StatusCode::SERVICE_UNAVAILABLE,
            json!({"error":"Não foi possível guardar a sessão."}),
            org,
            &app,
            None,
        );
    }
    let cookie = format!(
        "{COOKIE}={session}; Path=/api; Max-Age={SESSION_SECONDS}; HttpOnly; Secure; SameSite=Lax"
    );
    response(
        StatusCode::OK,
        json!({"id":identity.sub,"email":identity.email,"accessToken":tokens.access_token,"expiresIn":tokens.expires_in,"driveAuthorized":scopes.split_whitespace().any(|s| s == DRIVE_SCOPE)}),
        org,
        &app,
        Some(cookie),
    )
}

async fn refreshed(app: &App, headers: &HeaderMap, drive_only: bool) -> Result<Value, StatusCode> {
    let raw = session_cookie(headers).ok_or(StatusCode::UNAUTHORIZED)?;
    let key = session_key(raw);
    let item = app
        .db
        .get_item()
        .table_name(&app.table)
        .key("pk", A::S(key))
        .send()
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?
        .item
        .ok_or(StatusCode::UNAUTHORIZED)?;
    let get = |key: &str| item.get(key).and_then(|v| v.as_s().ok());
    let expires = item
        .get("ttl")
        .and_then(|v| v.as_n().ok())
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);
    if expires < Utc::now().timestamp() {
        return Err(StatusCode::UNAUTHORIZED);
    }
    let account_pk = get("accountKey").ok_or(StatusCode::UNAUTHORIZED)?;
    let account = app
        .db
        .get_item()
        .table_name(&app.table)
        .key("pk", A::S(account_pk.to_owned()))
        .send()
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?
        .item
        .ok_or(StatusCode::UNAUTHORIZED)?;
    let scopes = account
        .get("scopes")
        .and_then(|v| v.as_s().ok())
        .map_or("", |value| value.as_str());
    if drive_only && !scopes.split_whitespace().any(|v| v == DRIVE_SCOPE) {
        return Err(StatusCode::FORBIDDEN);
    }
    let refresh = account
        .get("refreshToken")
        .and_then(|v| v.as_s().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;
    let result = app
        .client
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("client_id", app.client_id.as_str()),
            ("client_secret", app.client_secret.as_str()),
            ("refresh_token", refresh),
            ("grant_type", "refresh_token"),
        ])
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;
    if result.status() == StatusCode::BAD_REQUEST {
        let _ = app
            .db
            .delete_item()
            .table_name(&app.table)
            .key("pk", A::S(account_pk.to_owned()))
            .send()
            .await;
        return Err(StatusCode::UNAUTHORIZED);
    }
    if !result.status().is_success() {
        return Err(StatusCode::BAD_GATEWAY);
    }
    let tokens: Value = result.json().await.map_err(|_| StatusCode::BAD_GATEWAY)?;
    let token = tokens
        .get("access_token")
        .and_then(Value::as_str)
        .ok_or(StatusCode::BAD_GATEWAY)?;
    let expires_in = tokens
        .get("expires_in")
        .and_then(Value::as_i64)
        .unwrap_or(3600);
    Ok(json!({"accessToken":token,"expiresIn":expires_in}))
}

async fn drive_token(
    State(app): State<App>,
    headers: HeaderMap,
) -> (StatusCode, HeaderMap, Json<Value>) {
    let org = origin(&headers).unwrap_or("");
    if !allowed_origin(&headers, &app) {
        return response(
            StatusCode::FORBIDDEN,
            json!({"error":"Origem não autorizada."}),
            org,
            &app,
            None,
        );
    }
    match refreshed(&app, &headers, true).await {
        Ok(v) => response(StatusCode::OK, v, org, &app, None),
        Err(status) => response(
            status,
            json!({"error":"Reconecte o Google Drive para sincronizar."}),
            org,
            &app,
            None,
        ),
    }
}
async fn access_token(
    State(app): State<App>,
    headers: HeaderMap,
) -> (StatusCode, HeaderMap, Json<Value>) {
    let org = origin(&headers).unwrap_or("");
    if !allowed_origin(&headers, &app) {
        return response(
            StatusCode::FORBIDDEN,
            json!({"error":"Origem não autorizada."}),
            org,
            &app,
            None,
        );
    }
    match refreshed(&app, &headers, false).await {
        Ok(v) => response(StatusCode::OK, v, org, &app, None),
        Err(status) => response(
            status,
            json!({"error":"Reconecte sua conta Google."}),
            org,
            &app,
            None,
        ),
    }
}
async fn logout(
    State(app): State<App>,
    headers: HeaderMap,
) -> (StatusCode, HeaderMap, Json<Value>) {
    let org = origin(&headers).unwrap_or("");
    if !allowed_origin(&headers, &app)
        || headers
            .get("x-requested-with")
            .and_then(|v| v.to_str().ok())
            != Some("XMLHttpRequest")
    {
        return response(
            StatusCode::FORBIDDEN,
            json!({"error":"Origem não autorizada."}),
            org,
            &app,
            None,
        );
    }
    if let Some(raw) = session_cookie(&headers) {
        let _ = app
            .db
            .delete_item()
            .table_name(&app.table)
            .key("pk", A::S(session_key(raw)))
            .send()
            .await;
    }
    response(
        StatusCode::OK,
        json!({"ok":true}),
        org,
        &app,
        Some(format!(
            "{COOKIE}=; Path=/api/auth; Max-Age=0; HttpOnly; Secure; SameSite=Lax"
        )),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persistent_keys_hash_session_and_google_identifiers() {
        let session = "opaque-session-secret";
        let key = session_key(session);
        assert!(key.starts_with(SESSION_PREFIX));
        assert!(!key.contains(session));
        assert_eq!(key, session_key(session));
        assert_ne!(account_key("google-sub-a"), account_key("google-sub-b"));
        assert!(!account_key("google-sub-a").contains("google-sub-a"));
    }

    #[test]
    fn accepts_only_the_identity_and_private_appdata_scopes() {
        assert!(valid_scopes(
            "openid email https://www.googleapis.com/auth/drive.appdata"
        ));
        assert!(!valid_scopes(
            "email https://www.googleapis.com/auth/drive.appdata"
        ));
        assert!(!valid_scopes(
            "openid https://www.googleapis.com/auth/drive"
        ));
    }
}
