use axum::{
    extract::{DefaultBodyLimit, State},
    http::{
        header::{AUTHORIZATION, CACHE_CONTROL},
        HeaderMap, StatusCode,
    },
    routing::{get, post},
    Json, Router,
};
use biorotina_push::billing::{
    Account, AnalysisFailure, Billing, FAILED_ANALYSIS_LIMIT, TRIAL_LIMIT,
};
use biorotina_push::observability;
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
fn failure(operation: &'static str, code: &'static str, text: &'static str) -> Response {
    observability::error("billing_api", operation, code, Some(503));
    error(StatusCode::SERVICE_UNAVAILABLE, text)
}
fn analysis_failure_response(reason: AnalysisFailure) -> Response {
    match reason {
        AnalysisFailure::GeminiStatus(503) | AnalysisFailure::GeminiProStatus(503) => error(
            StatusCode::SERVICE_UNAVAILABLE,
            "O Gemini está temporariamente indisponível. Tente novamente com a mesma foto em instantes.",
        ),
        AnalysisFailure::InvalidImage => error(
            StatusCode::BAD_REQUEST,
            "Imagem inválida ou grande demais.",
        ),
        AnalysisFailure::EmptyFoods => error(
            StatusCode::UNPROCESSABLE_ENTITY,
            "Não identificamos uma refeição nesta foto. Escolha outra imagem ou registre manualmente.",
        ),
        _ => error(
            StatusCode::SERVICE_UNAVAILABLE,
            "Não foi possível aproveitar a sugestão agora. Tente novamente ou registre manualmente.",
        ),
    }
}

#[tokio::main]
async fn main() -> Result<(), lambda_http::Error> {
    let billing = Billing::load().await.map_err(|_| {
        observability::error("billing_api", "startup", "configuration_failed", None);
        lambda_http::Error::from("billing configuration failed")
    })?;
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
        Err(_) => failure(
            "trial_config",
            "database_failed",
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
        observability::error(
            "billing_api",
            "account_key",
            "google_verification_failed",
            Some(401),
        );
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
        .map_err(|_| failure("authorized", "database_failed", "Assinatura indisponível."))?
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
        Err(_) => failure(
            "checkout",
            "checkout_failed",
            "Não foi possível abrir o pagamento agora.",
        ),
    }
}

async fn status(State(billing): State<Billing>, headers: HeaderMap) -> Response {
    let key = match account_key(&billing, &headers).await {
        Ok(key) => key,
        Err(error) => return error,
    };
    let account = match billing.account(&key).await {
        Ok(account) => account,
        Err(_) => {
            return failure(
                "status",
                "account_lookup_failed",
                "Assinatura indisponível.",
            )
        }
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
        _ => failure(
            "status",
            "status_lookup_failed",
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
            Err(_) => failure(
                "cancel",
                "status_lookup_failed",
                "Assinatura cancelada, mas a atualização da tela falhou.",
            ),
        },
        Err(_) => failure(
            "cancel",
            "cancel_failed",
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
    match billing.enqueue_webhook(&event).await {
        Ok(()) => reply(StatusCode::OK, json!({"received":true})),
        Err(_) => failure("webhook", "enqueue_failed", "Evento não recebido."),
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
        Err(_) => {
            return failure(
                "analyze",
                "account_lookup_failed",
                "Assinatura indisponível.",
            )
        }
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
                return failure(
                    "analyze",
                    "trial_lookup_failed",
                    "Não foi possível verificar o teste grátis.",
                )
            }
        }
    }
    let failure_slot = match billing.reserve_failure_slot(&key).await {
        Ok(Some(slot)) => slot,
        Ok(None) => {
            return error(
                StatusCode::TOO_MANY_REQUESTS,
                &format!(
                    "A análise de fotos não conseguiu gerar uma sugestão após {FAILED_ANALYSIS_LIMIT} tentativas hoje. Você pode registrar manualmente e tentar novamente amanhã."
                ),
            )
        }
        Err(_) => {
            return failure(
                "analyze",
                "failure_limit_lookup_failed",
                "Não foi possível verificar o limite de análises.",
            )
        }
    };
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
            billing.refund_reservation(&failure_slot).await;
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
            );
        }
        Err(_) => {
            billing.refund_reservation(&failure_slot).await;
            return failure(
                "analyze",
                "quota_reservation_failed",
                "Não foi possível verificar a cota.",
            );
        }
    };
    match billing.analyze(&body.image, paid).await {
        Ok(analysis) => {
            billing.refund_reservation(&failure_slot).await;
            reply(StatusCode::OK, json!(analysis))
        }
        Err(reason) => {
            observability::error(
                "billing_api",
                "analyze",
                reason.code(),
                reason.upstream_status(),
            );
            billing.refund_reservation(&usage_key).await;
            if !reason.counts_toward_failure_limit() {
                billing.refund_reservation(&failure_slot).await;
            }
            analysis_failure_response(reason)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn a_503_asks_to_retry_the_same_photo() {
        for failure in [
            AnalysisFailure::GeminiStatus(503),
            AnalysisFailure::GeminiProStatus(503),
        ] {
            let response = analysis_failure_response(failure);
            assert_eq!(response.0, StatusCode::SERVICE_UNAVAILABLE);
            assert!(response.2 .0["error"]
                .as_str()
                .unwrap()
                .contains("mesma foto"));
        }
    }
    #[test]
    fn a_photo_without_food_explains_the_problem_without_blame() {
        let response = analysis_failure_response(AnalysisFailure::EmptyFoods);
        assert_eq!(response.0, StatusCode::UNPROCESSABLE_ENTITY);
        assert!(response.2 .0["error"]
            .as_str()
            .unwrap()
            .contains("Não identificamos uma refeição"));
    }
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
