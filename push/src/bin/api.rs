use axum::{
    extract::{DefaultBodyLimit, Path, State},
    http::{header::AUTHORIZATION, header::CACHE_CONTROL, HeaderMap, HeaderName, StatusCode},
    routing::{get, post},
    Json, Router,
};
use biorotina_push::{
    delivery::is_expired_endpoint,
    model::{validate, ReminderRequest, StoredSubscription},
    App,
};
use chrono::Utc;
use serde_json::{json, Value};
use uuid::Uuid;

type ApiResponse = (StatusCode, [(HeaderName, &'static str); 1], Json<Value>);

#[tokio::main]
async fn main() -> Result<(), lambda_http::Error> {
    let app = App::load().await?;
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

async fn preflight() -> StatusCode {
    StatusCode::NO_CONTENT
}

async fn config(State(app): State<App>) -> ApiResponse {
    response(
        StatusCode::OK,
        json!({"publicKey":app.sender.public_key,"available":true}),
    )
}

async fn create(State(app): State<App>, Json(request): Json<ReminderRequest>) -> ApiResponse {
    if let Err(message) = validate(&request) {
        return response(StatusCode::BAD_REQUEST, json!({"error":message}));
    }
    match app.store.create(request).await {
        Ok((id, token)) => response(StatusCode::CREATED, json!({"id":id,"token":token})),
        Err(_) => response(
            StatusCode::SERVICE_UNAVAILABLE,
            json!({"error":"Não foi possível ativar os avisos."}),
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
        Err(_) => Err(response(
            StatusCode::SERVICE_UNAVAILABLE,
            json!({"error":"Serviço indisponível."}),
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
        Err(_) => response(
            StatusCode::SERVICE_UNAVAILABLE,
            json!({"error":"Não foi possível atualizar os avisos."}),
        ),
    }
}

async fn remove(State(app): State<App>, Path(id): Path<String>, headers: HeaderMap) -> ApiResponse {
    if let Err(error) = authorized(&app, &id, &headers).await {
        return error;
    }
    match app.store.delete(&id).await {
        Ok(()) => response(StatusCode::OK, json!({"active":false})),
        Err(_) => response(
            StatusCode::SERVICE_UNAVAILABLE,
            json!({"error":"Não foi possível desativar os avisos."}),
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
        Err(_) => response(
            StatusCode::SERVICE_UNAVAILABLE,
            json!({"error":"Serviço indisponível."}),
        ),
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
                if is_expired_endpoint(&error) {
                    let _ = app.store.delete(&id).await;
                }
                response(
                    StatusCode::SERVICE_UNAVAILABLE,
                    json!({"error":"Não foi possível enviar o teste."}),
                )
            }
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
