//! Exercise real SDK requests against a small DynamoDB protocol test double.
use super::*;
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    routing::post,
    Json, Router,
};
use std::collections::HashMap;
use tokio::sync::Mutex;
type Items = Arc<Mutex<HashMap<String, Value>>>;

async fn dynamo(
    State(items): State<Items>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> (StatusCode, Json<Value>) {
    let body: Value = serde_json::from_slice(&body).unwrap();
    let mut items = items.lock().await;
    let target = headers.get("x-amz-target").unwrap().to_str().unwrap();
    let key = body["Key"]["pk"]["S"]
        .as_str()
        .or_else(|| body["Item"]["pk"]["S"].as_str())
        .unwrap();
    let failed = || {
        (
            StatusCode::BAD_REQUEST,
            Json(
                json!({"__type":"com.amazonaws.dynamodb.v20120810#ConditionalCheckFailedException","message":"condition failed"}),
            ),
        )
    };
    if target.ends_with("GetItem") {
        return (
            StatusCode::OK,
            Json(match items.get(key) {
                Some(v) => json!({"Item":v}),
                None => json!({}),
            }),
        );
    }
    if target.ends_with("PutItem") {
        if body["ConditionExpression"].is_string() && items.contains_key(key) {
            return failed();
        }
        items.insert(key.into(), body["Item"].clone());
    } else if target.ends_with("UpdateItem") {
        let used = items
            .get(key)
            .and_then(|i| i["used"]["N"].as_str())
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(0);
        let refund = body["UpdateExpression"]
            .as_str()
            .unwrap()
            .contains(" - :one");
        let limit = body["ExpressionAttributeValues"][":limit"]["N"]
            .as_str()
            .and_then(|v| v.parse::<u32>().ok())
            .unwrap_or(0);
        assert_eq!(
            body["ConditionExpression"],
            if refund {
                "#used > :zero"
            } else {
                "attribute_not_exists(#used) OR #used < :limit"
            }
        );
        if (refund && used == 0) || (!refund && used >= limit) {
            return failed();
        }
        items.insert(
            key.into(),
            json!({"pk":{"S":key},"used":{"N":if refund {used-1} else {used+1}.to_string()}}),
        );
    } else {
        panic!("Unexpected operation {target}");
    }
    (StatusCode::OK, Json(json!({})))
}
async fn setup() -> (Billing, Items, tokio::task::JoinHandle<()>) {
    let items: Items = Arc::new(Mutex::new(HashMap::new()));
    let campaign = Campaign {
        starts_at: Utc::now() - Duration::days(1),
        ends_at: Utc::now() + Duration::days(1),
        ..Campaign::default()
    };
    items.lock().await.insert("CONFIG#PHOTO_TRIAL".into(),json!({"pk":{"S":"CONFIG#PHOTO_TRIAL"},"data":{"S":json!({"enabled":true,"campaign":campaign}).to_string()}}));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}", listener.local_addr().unwrap());
    let app = Router::new()
        .route("/", post(dynamo))
        .with_state(items.clone());
    let server = tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });
    let config = aws_config::defaults(BehaviorVersion::latest())
        .region(aws_sdk_dynamodb::config::Region::new("sa-east-1"))
        .credentials_provider(aws_sdk_dynamodb::config::Credentials::new(
            "test", "test", None, None, "test",
        ))
        .endpoint_url(url)
        .load()
        .await;
    let billing = Billing {
        db: Db::new(&config),
        queue: Sqs::new(&config),
        queue_url: String::new(),
        table: "test".into(),
        client: reqwest::Client::new(),
        asaas_key: Arc::new(String::new()),
        gemini_key: Arc::new(String::new()),
        webhook_token: Arc::new(String::new()),
        asaas_url: String::new(),
        app_url: String::new(),
        google_client_id: String::new(),
    };
    (billing, items, server)
}
#[tokio::test]
async fn campaign_is_read_only_until_first_request_and_limits_concurrent_calls() {
    let (billing, items, server) = setup().await;
    items
        .lock()
        .await
        .insert("TRIAL#test-account".into(), json!({"used":{"N":"5"}}));
    assert_eq!(
        billing.public_trial_offer().await.unwrap()["trialPeriodDays"],
        14
    );
    let status = billing.trial_status("test-account").await.unwrap();
    assert_eq!(status["trialUsed"], 0);
    assert!(status["trialEndsAt"].is_null());
    assert!(!items
        .lock()
        .await
        .contains_key(&format!("TRIAL_CAMPAIGN#{CAMPAIGN_ID}#test-account")));
    let mut requests = tokio::task::JoinSet::new();
    for _ in 0..12 {
        let b = billing.clone();
        requests.spawn(async move { b.reserve_trial("test-account").await.unwrap() });
    }
    let mut accepted = Vec::new();
    while let Some(result) = requests.join_next().await {
        if let Some(key) = result.unwrap() {
            accepted.push(key);
        }
    }
    assert_eq!(accepted.len(), 5);
    assert_eq!(
        billing.trial_status("test-account").await.unwrap()["trialUsed"],
        5
    );
    assert_eq!(items.lock().await["TRIAL#test-account"]["used"]["N"], "5");
    let enrollment = billing
        .trial_enrollment("test-account")
        .await
        .unwrap()
        .unwrap();
    billing.refund_reservation(&accepted[0]).await;
    assert!(billing
        .reserve_trial("test-account")
        .await
        .unwrap()
        .is_some());
    assert_eq!(
        billing
            .trial_enrollment("test-account")
            .await
            .unwrap()
            .unwrap()
            .ends_at,
        enrollment.ends_at
    );
    assert_eq!(
        billing.trial_status("other-account").await.unwrap()["trialUsed"],
        0
    );
    let mut expired = enrollment;
    expired.ends_at = Utc::now() - Duration::seconds(1);
    items.lock().await.insert(
        format!("TRIAL_CAMPAIGN#{CAMPAIGN_ID}#test-account"),
        json!({"data":{"S":serde_json::to_string(&expired).unwrap()}}),
    );
    assert_eq!(
        billing.trial_status("test-account").await.unwrap()["trialExpired"],
        true
    );
    assert!(billing
        .reserve_trial("test-account")
        .await
        .unwrap()
        .is_none());
    server.abort();
}
#[tokio::test]
async fn accounting_intent_is_durable_and_completion_keeps_usage_without_content() {
    let (billing, items, server) = setup().await;
    let mut call = AiCall {
        schema_version: 1,
        request_id: "request".into(),
        call_id: "call".into(),
        account_key: "test-account".into(),
        occurred_at: "2026-11-01T00:00:00Z".parse().unwrap(),
        model: GEMINI_MODEL.into(),
        allocation: "trial".into(),
        input_type: "description".into(),
        attempt: 1,
        outcome: "pending".into(),
        http_status: None,
        duration_ms: None,
        usage: None,
        pricing: None,
        estimated_cost_nano_usd: None,
    };
    billing.save_ai_call(&call, true).await.unwrap();
    assert!(billing.save_ai_call(&call, true).await.is_err());
    let response = json!({"private":"food description must not be stored", "usageMetadata":{"promptTokenCount":1000,"candidatesTokenCount":100}});
    call.complete(Some(&response), "success", Some(200), 100);
    billing.save_ai_call(&call, false).await.unwrap();
    let raw = items.lock().await[&call.key()]["data"]["S"]
        .as_str()
        .unwrap()
        .to_owned();
    assert!(!raw.contains("food description"));
    let saved: AiCall = serde_json::from_str(&raw).unwrap();
    assert_eq!(saved.estimated_cost_nano_usd, Some(1_125_000));
    assert_eq!(saved.outcome, "success");
    server.abort();
}

#[tokio::test]
async fn campaign_configuration_fails_closed_and_disabling_enrollment_keeps_existing_trial() {
    let (billing, items, server) = setup().await;
    assert!(billing.reserve_trial("existing").await.unwrap().is_some());
    items.lock().await.insert(
        "CONFIG#PHOTO_TRIAL".into(),
        json!({"data":{"S":"{\"enabled\":true,\"campaign\":null}"}}),
    );
    assert_eq!(
        billing.trial_status("new").await.unwrap()["trialPeriodDays"],
        Value::Null
    );
    assert_eq!(
        billing.trial_status("existing").await.unwrap()["trialPeriodDays"],
        14
    );
    assert!(billing.reserve_trial("existing").await.unwrap().is_some());
    items.lock().await.insert(
        "CONFIG#PHOTO_TRIAL".into(),
        json!({"data":{"S":"invalid json"}}),
    );
    assert!(billing.trial_enabled().await.is_err());
    assert!(billing.reserve_trial("new").await.is_err());
    items.lock().await.insert(
        "CONFIG#PHOTO_TRIAL".into(),
        json!({"data":{"S":"{\"enabled\":false}"}}),
    );
    assert!(!billing.trial_enabled().await.unwrap());
    assert_eq!(
        billing.public_trial_offer().await.unwrap()["trialEnabled"],
        false
    );
    server.abort();
}
