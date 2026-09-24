use axum::{
    extract::{DefaultBodyLimit, Extension, Path, State},
    http::{header::AUTHORIZATION, header::CACHE_CONTROL, HeaderMap, HeaderName, StatusCode},
    routing::{get, post},
    Json, Router,
};
use biorotina_push::{
    delivery::is_expired_endpoint,
    model::{validate, ReminderRequest, StoredSubscription},
    observability,
    store::PUBLIC_CREATE_LIMIT_PER_DAY,
    App,
};
use chrono::Utc;
use chrono_tz::America::Sao_Paulo;
use lambda_http::request::RequestContext;
use serde_json::{json, Value};
use std::net::IpAddr;
use uuid::Uuid;

type ApiResponse = (StatusCode, [(HeaderName, &'static str); 1], Json<Value>);

#[tokio::main]
async fn main() -> Result<(), lambda_http::Error> {
    let app = App::load().await.map_err(|_| {
        observability::error("push_api", "startup", "configuration_failed", None);
        lambda_http::Error::from("push configuration failed")
    })?;
    lambda_http::run(router(app)).await
}

fn router(app: App) -> Router {
    Router::new()
        .route("/api/push/config", get(config).options(preflight))
        .route("/api/push/subscriptions", post(create).options(preflight))
        .route(
            "/api/push/subscriptions/{id}",
            get(read).put(update).delete(remove).options(preflight),
        )
        .route(
            "/api/push/subscriptions/{id}/test",
            post(test).options(preflight),
        )
        .layer(DefaultBodyLimit::max(8_192))
        .with_state(app)
}

fn response(status: StatusCode, body: Value) -> ApiResponse {
    (status, [(CACHE_CONTROL, "no-store")], Json(body))
}

fn failure(operation: &'static str, code: &'static str, text: &'static str) -> ApiResponse {
    observability::error("push_api", operation, code, Some(503));
    response(StatusCode::SERVICE_UNAVAILABLE, json!({"error":text}))
}

async fn preflight() -> StatusCode {
    StatusCode::NO_CONTENT
}

async fn config(State(app): State<App>) -> ApiResponse {
    response(
        StatusCode::OK,
        json!({"publicKey":app.sender.public_key,"available":true}),
    )
}

fn trusted_source_ip(context: &RequestContext) -> Option<IpAddr> {
    match context {
        RequestContext::ApiGatewayV2(value) => value.http.source_ip.as_deref()?.parse().ok(),
        _ => None,
    }
}

async fn create(
    State(app): State<App>,
    Extension(context): Extension<RequestContext>,
    Json(request): Json<ReminderRequest>,
) -> ApiResponse {
    if let Err(message) = validate(&request) {
        return response(StatusCode::BAD_REQUEST, json!({"error":message}));
    }
    let Some(ip) = trusted_source_ip(&context) else {
        return failure(
            "create",
            "source_unavailable",
            "Não foi possível ativar os avisos agora.",
        );
    };
    let day = Utc::now().with_timezone(&Sao_Paulo).date_naive();
    let key = app.sender.create_limit_key(ip, day);
    match app.store.reserve_public_create(&key).await {
        Ok(true) => {}
        Ok(false) => {
            return response(
                StatusCode::TOO_MANY_REQUESTS,
                json!({"error":format!("Muitas ativações de avisos nesta conexão hoje (limite de {PUBLIC_CREATE_LIMIT_PER_DAY}). Tente novamente amanhã.")}),
            )
        }
        Err(_) => {
            return failure(
                "create",
                "rate_limit_failed",
                "Não foi possível ativar os avisos agora.",
            )
        }
    }
    match app.store.create(request).await {
        Ok((id, token)) => response(StatusCode::CREATED, json!({"id":id,"token":token})),
        Err(_) => failure(
            "create",
            "database_failed",
            "Não foi possível ativar os avisos.",
        ),
    }
}

async fn authorized(
    app: &App,
    id: &str,
    headers: &HeaderMap,
) -> Result<StoredSubscription, ApiResponse> {
    if Uuid::parse_str(id).is_err() {
        return Err(response(
            StatusCode::NOT_FOUND,
            json!({"error":"Inscrição não encontrada."}),
        ));
    }
    let Some(token) = bearer_token(headers) else {
        return Err(response(
            StatusCode::UNAUTHORIZED,
            json!({"error":"Inscrição não autorizada."}),
        ));
    };
    match app.store.authorized(id, token).await {
        Ok(Some(subscription)) => Ok(subscription),
        Ok(None) => Err(response(
            StatusCode::UNAUTHORIZED,
            json!({"error":"Inscrição não autorizada."}),
        )),
        Err(_) => Err(failure(
            "authorized",
            "database_failed",
            "Serviço indisponível.",
        )),
    }
}

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    let token = headers
        .get(AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")?;
    (token.len() <= 256).then_some(token)
}

async fn read(State(app): State<App>, Path(id): Path<String>, headers: HeaderMap) -> ApiResponse {
    let subscription = match authorized(&app, &id, &headers).await {
        Ok(value) => value,
        Err(error) => return error,
    };
    response(
        StatusCode::OK,
        json!({"active":true,"reminders":subscription.reminders,"timeZone":subscription.time_zone}),
    )
}

async fn update(
    State(app): State<App>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(request): Json<ReminderRequest>,
) -> ApiResponse {
    let existing = match authorized(&app, &id, &headers).await {
        Ok(value) => value,
        Err(error) => return error,
    };
    if let Err(message) = validate(&request) {
        return response(StatusCode::BAD_REQUEST, json!({"error":message}));
    }
    let updated = StoredSubscription {
        subscription: request.subscription,
        reminders: request.reminders,
        time_zone: request.time_zone,
        ..existing
    };
    let token = bearer_token(&headers).expect("verified by authorized");
    match app.store.update(&updated, token).await {
        Ok(()) => response(StatusCode::OK, json!({"active":true})),
        Err(_) => failure(
            "update",
            "database_failed",
            "Não foi possível atualizar os avisos.",
        ),
    }
}

async fn remove(State(app): State<App>, Path(id): Path<String>, headers: HeaderMap) -> ApiResponse {
    if let Err(error) = authorized(&app, &id, &headers).await {
        return error;
    }
    match app.store.delete(&id).await {
        Ok(()) => response(StatusCode::OK, json!({"active":false})),
        Err(_) => failure(
            "remove",
            "database_failed",
            "Não foi possível desativar os avisos.",
        ),
    }
}

async fn test(State(app): State<App>, Path(id): Path<String>, headers: HeaderMap) -> ApiResponse {
    let subscription = match authorized(&app, &id, &headers).await {
        Ok(value) => value,
        Err(error) => return error,
    };
    let minute = Utc::now().format("%Y-%m-%dT%H:%M").to_string();
    let claimed = app
        .store
        .claim(
            &id,
            &format!("TEST#{minute}"),
            Utc::now().timestamp() + 3600,
        )
        .await;
    match claimed {
        Ok(false) => response(
            StatusCode::TOO_MANY_REQUESTS,
            json!({"error":"Aguarde um minuto antes de testar novamente."}),
        ),
        Err(_) => failure("test", "claim_failed", "Serviço indisponível."),
        Ok(true) => match app
            .sender
            .send(
                &subscription,
                biorotina_push::model::ReminderKind::Hydration,
            )
            .await
        {
            Ok(()) => response(StatusCode::OK, json!({"sent":true})),
            Err(error) => {
                if is_expired_endpoint(&error) && app.store.delete(&id).await.is_err() {
                    observability::error(
                        "push_api",
                        "test",
                        "expired_subscription_delete_failed",
                        None,
                    );
                }
                failure(
                    "test",
                    "delivery_failed",
                    "Não foi possível enviar o teste.",
                )
            }
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use lambda_http::aws_lambda_events::apigw::ApiGatewayV2httpRequestContext;

    #[test]
    fn create_limit_uses_only_gateway_source_not_untrusted_headers() {
        let mut gateway = ApiGatewayV2httpRequestContext::default();
        gateway.http.source_ip = Some("203.0.113.10".into());
        let context = RequestContext::ApiGatewayV2(gateway);
        assert_eq!(
            trusted_source_ip(&context),
            Some("203.0.113.10".parse().unwrap())
        );
    }

    #[test]
    fn bearer_token_requires_explicit_header() {
        let mut headers = HeaderMap::new();
        assert_eq!(bearer_token(&headers), None);
        headers.insert(AUTHORIZATION, "Bearer opaque-token".parse().unwrap());
        assert_eq!(bearer_token(&headers), Some("opaque-token"));
        headers.insert(AUTHORIZATION, "Basic abc".parse().unwrap());
        assert_eq!(bearer_token(&headers), None);
    }

    #[test]
    fn responses_are_not_cacheable() {
        let result = response(StatusCode::CREATED, json!({"ok":true}));
        assert_eq!(result.0, StatusCode::CREATED);
        assert_eq!(result.1[0], (CACHE_CONTROL, "no-store"));
    }
}
