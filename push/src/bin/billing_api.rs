use axum::{
    extract::{DefaultBodyLimit, State},
    http::{
        header::{AUTHORIZATION, CACHE_CONTROL},
        HeaderMap, StatusCode,
    },
    routing::{get, post},
    Json, Router,
};
use biorotina_push::billing::{Account, Billing, TRIAL_LIMIT};
use serde::Deserialize;
use serde_json::{json, Value};

type Response = (
    StatusCode,
    [(axum::http::HeaderName, &'static str); 1],
    Json<Value>,
);
fn reply(status: StatusCode, body: Value) -> Response {
    (status, [(CACHE_CONTROL, "no-store")], Json(body))
}
fn error(status: StatusCode, text: &str) -> Response {
    reply(status, json!({"error":text}))
}

#[tokio::main]
async fn main() -> Result<(), lambda_http::Error> {
    let billing = Billing::load()
        .await
        .map_err(|e| lambda_http::Error::from(e.to_string()))?;
    lambda_http::run(router(billing)).await
}

fn router(billing: Billing) -> Router {
    Router::new()
        .route("/api/billing/checkout", post(checkout).options(preflight))
        .route("/api/billing/status", get(status).options(preflight))
        .route("/api/billing/cancel", post(cancel).options(preflight))
        .route("/api/billing/webhook", post(webhook))
        .route("/api/ai/meal", post(analyze).options(preflight))
        .route("/api/ai/trial-config", get(trial_config).options(preflight))
        .layer(DefaultBodyLimit::max(600_000))
        .with_state(billing)
}
async fn preflight() -> StatusCode {
    StatusCode::NO_CONTENT
}

async fn trial_config(State(billing): State<Billing>) -> Response {
    match billing.trial_enabled().await {
        Ok(enabled) => reply(StatusCode::OK, json!({"trialEnabled":enabled})),
        Err(_) => error(
            StatusCode::SERVICE_UNAVAILABLE,
            "Configuração indisponível.",
        ),
    }
}

fn bearer_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(AUTHORIZATION)?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
}
async fn account_key(billing: &Billing, headers: &HeaderMap) -> Result<String, Response> {
    let token = bearer_token(headers)
        .ok_or_else(|| error(StatusCode::UNAUTHORIZED, "Conecte sua conta Google."))?;
    billing.google_account_key(token).await.map_err(|_| {
        error(
            StatusCode::UNAUTHORIZED,
            "Conecte novamente sua conta Google.",
        )
    })
}
async fn authorized(billing: &Billing, headers: &HeaderMap) -> Result<Account, Response> {
    let key = account_key(billing, headers).await?;
    billing
        .account(&key)
        .await
        .map_err(|_| error(StatusCode::SERVICE_UNAVAILABLE, "Assinatura indisponível."))?
        .ok_or_else(|| error(StatusCode::UNAUTHORIZED, "Assinatura não encontrada."))
}

async fn checkout(State(billing): State<Billing>, headers: HeaderMap) -> Response {
    let key = match account_key(&billing, &headers).await {
        Ok(key) => key,
        Err(error) => return error,
    };
    match billing.checkout(key).await {
        Ok((url, _)) => reply(StatusCode::OK, json!({"url" : url})),
        Err(message) if message.contains("assinatura") || message.contains("plano ativo") => {
            error(StatusCode::CONFLICT, &message)
        }
        Err(message) => {
            eprintln!(
                "billing checkout failed: {}",
                message.chars().take(240).collect::<String>()
            );
            error(
                StatusCode::SERVICE_UNAVAILABLE,
                "Não foi possível abrir o pagamento agora.",
            )
        }
    }
}

async fn status(State(billing): State<Billing>, headers: HeaderMap) -> Response {
    let key = match account_key(&billing, &headers).await {
        Ok(key) => key,
        Err(error) => return error,
    };
    let account = match billing.account(&key).await {
        Ok(account) => account,
        Err(_) => return error(StatusCode::SERVICE_UNAVAILABLE, "Assinatura indisponível."),
    };
    let (trial_enabled, trial_used, plan) = tokio::join!(
        billing.trial_enabled(),
        billing.trial_used(&key),
        async {
            match account.as_ref() {
                Some(account) => billing.status(account).await,
                None => Ok(
                    json!({"active":false,"cancelled":false,"renewalActive":false,"paidThrough":null,"nextCharge":null,"usedToday":0,"dailyLimit":10,"checkoutUrl":null}),
                ),
            }
        },
    );
    match (trial_enabled, trial_used, plan) {
        (Ok(enabled), Ok(used), Ok(mut value)) => {
            value["trialEnabled"] = json!(enabled);
            value["trialUsed"] = json!(used);
            value["trialLimit"] = json!(TRIAL_LIMIT);
            reply(StatusCode::OK, value)
        }
        _ => error(
            StatusCode::SERVICE_UNAVAILABLE,
            "Não foi possível consultar a assinatura.",
        ),
    }
}

async fn cancel(State(billing): State<Billing>, headers: HeaderMap) -> Response {
    let account = match authorized(&billing, &headers).await {
        Ok(a) => a,
        Err(e) => return e,
    };
    match billing.cancel(&account).await {
        Ok(updated) => match billing.status(&updated).await {
            Ok(value) => reply(StatusCode::OK, value),
            Err(_) => error(
                StatusCode::SERVICE_UNAVAILABLE,
                "Assinatura cancelada, mas a atualização da tela falhou.",
            ),
        },
        Err(_) => error(
            StatusCode::SERVICE_UNAVAILABLE,
            "Não foi possível cancelar no Asaas. Tente novamente.",
        ),
    }
}

async fn webhook(
    State(billing): State<Billing>,
    headers: HeaderMap,
    Json(event): Json<Value>,
) -> Response {
    let token = headers
        .get("asaas-access-token")
        .and_then(|h| h.to_str().ok());
    if !billing.valid_webhook(token) {
        return error(StatusCode::UNAUTHORIZED, "Não autorizado.");
    }
    match billing.webhook(&event).await {
        Ok(()) => reply(StatusCode::OK, json!({"received":true})),
        Err(reason) => {
            eprintln!("billing webhook processing failed: {reason}");
            error(StatusCode::SERVICE_UNAVAILABLE, "Evento não processado.")
        }
    }
}

#[derive(Deserialize)]
struct ImageRequest {
    image: String,
}
async fn analyze(
    State(billing): State<Billing>,
    headers: HeaderMap,
    Json(body): Json<ImageRequest>,
) -> Response {
    let key = match account_key(&billing, &headers).await {
        Ok(key) => key,
        Err(error) => return error,
    };
    if body.image.len() > 480_000 || body.image.len() < 100 {
        return error(StatusCode::BAD_REQUEST, "Imagem inválida ou grande demais.");
    }
    let account = match billing.account(&key).await {
        Ok(account) => account,
        Err(_) => return error(StatusCode::SERVICE_UNAVAILABLE, "Assinatura indisponível."),
    };
    let paid = account.as_ref().is_some_and(Account::active);
    if !paid {
        match billing.trial_enabled().await {
            Ok(true) => {}
            Ok(false) => {
                return error(
                    StatusCode::PAYMENT_REQUIRED,
                    "O teste grátis não está disponível. Escolha o plano ou use sua chave Gemini.",
                )
            }
            Err(_) => {
                return error(
                    StatusCode::SERVICE_UNAVAILABLE,
                    "Não foi possível verificar o teste grátis.",
                )
            }
        }
    }
    let reserved = if paid {
        billing
            .reserve(account.as_ref().expect("active account"))
            .await
    } else {
        billing.reserve_trial(&key).await
    };
    let usage_key = match reserved {
        Ok(Some(key)) => key,
        Ok(None) => {
            return error(
                if paid {
                    StatusCode::TOO_MANY_REQUESTS
                } else {
                    StatusCode::PAYMENT_REQUIRED
                },
                if paid {
                    "Você já usou as 10 análises de hoje. Amanhã sua cota renova."
                } else {
                    "Você já usou as 5 análises grátis. Escolha o plano ou use sua chave Gemini."
                },
            )
        }
        Err(_) => {
            return error(
                StatusCode::SERVICE_UNAVAILABLE,
                "Não foi possível verificar a cota.",
            )
        }
    };
    match billing.analyze(&body.image).await {
        Ok(analysis) => reply(StatusCode::OK, json!(analysis)),
        Err(_) => {
            billing.refund_reservation(&usage_key).await;
            error(
                StatusCode::SERVICE_UNAVAILABLE,
                "A análise não funcionou agora. Tente outra foto.",
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_missing_google_token() {
        let mut headers = HeaderMap::new();
        assert!(bearer_token(&headers).is_none());
        headers.insert(
            AUTHORIZATION,
            format!("Bearer {}", "a".repeat(64)).parse().unwrap(),
        );
        assert!(bearer_token(&headers).is_some());
    }
}
