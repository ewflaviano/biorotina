use biorotina_push::{delivery::is_expired_endpoint, schedule, store::StoreError, App};
use chrono::{Duration, Utc};
use lambda_runtime::{service_fn, Error, LambdaEvent};
use serde_json::{json, Value};
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<(), Error> {
    let app = Arc::new(App::load().await?);
    lambda_runtime::run(service_fn(move |event: LambdaEvent<Value>| {
        let app = app.clone();
        async move {
            if event.payload.get("kind").and_then(Value::as_str) != Some("tick") {
                return Ok::<Value, Error>(json!({"error":"Evento inválido"}));
            }
            let sent = send_due(&app).await?;
            Ok::<Value, Error>(json!({"sent":sent}))
        }
    }))
    .await
}

async fn send_due(app: &App) -> Result<usize, StoreError> {
    let now = Utc::now();
    let mut sent = 0;
    for due in app.store.due_up_to(now).await? {
        let Some(subscription) = app
            .store
            .current_due(&due.subscription.id, &due.slot)
            .await?
        else {
            continue;
        };
        if now - due.at > Duration::minutes(10) {
            app.store.advance(&subscription, &due.slot, now).await?;
            continue;
        }
        let Some((date, time, kind)) = schedule::due_slot(&subscription, due.at) else {
            app.store.advance(&subscription, &due.slot, now).await?;
            continue;
        };
        let slot = format!("{date}#{time}");
        if !app
            .store
            .claim(&subscription.id, &slot, now.timestamp() + 3 * 24 * 60 * 60)
            .await?
        {
            app.store.advance(&subscription, &due.slot, due.at).await?;
            continue;
        }
        match app.sender.send(&subscription, kind).await {
            Ok(()) => {
                sent += 1;
                app.store.advance(&subscription, &due.slot, due.at).await?;
            }
            Err(error) if is_expired_endpoint(&error) => {
                let _ = app.store.delete(&subscription.id).await;
            }
            Err(_) => {
                let _ = app.store.release(&subscription.id, &slot).await;
            }
        }
    }
    Ok(sent)
}
