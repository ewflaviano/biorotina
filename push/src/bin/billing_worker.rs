use biorotina_push::{billing::Billing, observability};
use lambda_runtime::{service_fn, Error, LambdaEvent};
use serde_json::{json, Value};
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<(), Error> {
    let billing = Arc::new(Billing::load().await.map_err(|_| {
        observability::error("billing_worker", "startup", "configuration_failed", None);
        Error::from("billing configuration failed")
    })?);
    lambda_runtime::run(service_fn(move |event: LambdaEvent<Value>| {
        let billing = billing.clone();
        async move {
            let records = event
                .payload
                .get("Records")
                .and_then(Value::as_array)
                .ok_or_else(|| Error::from("missing SQS records"))?;
            for record in records {
                let body = record
                    .get("body")
                    .and_then(Value::as_str)
                    .ok_or_else(|| Error::from("missing SQS body"))?;
                let webhook: Value = serde_json::from_str(body)?;
                billing.webhook(&webhook).await.map_err(|_| {
                    observability::error("billing_worker", "webhook", "processing_failed", None);
                    Error::from("billing event processing failed")
                })?;
            }
            Ok::<Value, Error>(json!({"processed": records.len()}))
        }
    }))
    .await
}
