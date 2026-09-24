use crate::observability;
use aws_config::BehaviorVersion;
use aws_sdk_dynamodb::{
    types::{AttributeValue as A, Put, TransactWriteItem},
    Client as Db,
};
use aws_sdk_secretsmanager::Client as Secrets;
use aws_sdk_sqs::Client as Sqs;
use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::{Datelike, Duration, NaiveDate, Utc};
use chrono_tz::America::Sao_Paulo;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use subtle::ConstantTimeEq;

const GEMINI_MODEL: &str = "gemini-3.8-flash";
const GEMINI_FALLBACK_MODEL: &str = "gemini-3.1-pro-preview";
const GEMINI_TOTAL_BUDGET: std::time::Duration = std::time::Duration::from_secs(24);
pub const TRIAL_LIMIT: u32 = 5;
pub const FAILED_ANALYSIS_LIMIT: u32 = 5;
pub const DAILY_ATTEMPT_LIMIT: u32 = 40;
const ASAAS_USER_AGENT: &str = "Biorotina/0.1 (+https://biorotina.app.br)";
const PROMPT: &str = "Analise apenas os alimentos e bebidas visíveis nesta foto de refeição. Responda em português do Brasil com JSON. Para cada alimento visível, dê um nome simples, uma porção aproximada (gramas ou medida caseira) e as calorias aproximadas dessa porção. Não invente ingredientes invisíveis. Se a foto não permitir identificar uma refeição, retorne foods vazio. Não faça recomendações médicas ou nutricionais. A pessoa vai revisar tudo.";

#[derive(Clone)]
pub struct Billing {
    pub db: Db,
    pub queue: Sqs,
    pub queue_url: String,
    pub table: String,
    pub client: reqwest::Client,
    pub asaas_key: Arc<String>,
    pub gemini_key: Arc<String>,
    pub webhook_token: Arc<String>,
    pub asaas_url: String,
    pub app_url: String,
    pub google_client_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub key: String,
    pub checkout_id: String,
    pub checkout_url: String,
    #[serde(default)]
    pub checkout_expires_at: i64,
    pub customer_id: Option<String>,
    pub subscription_id: Option<String>,
    pub paid_through: Option<String>,
    pub next_charge: Option<String>,
    pub revoked: bool,
    #[serde(default)]
    pub cancelled: bool,
    #[serde(default)]
    pub last_payment_id: Option<String>,
}

impl Account {
    pub fn active(&self) -> bool {
        !self.revoked
            && self
                .paid_through
                .as_deref()
                .is_some_and(|date| date >= today().as_str())
    }

    fn record_payment(&mut self, payment: &Value, subscription_next_due: Option<&str>) {
        let Some(payment_id) = str_field(payment, "id") else {
            return;
        };
        let due = str_field(payment, "dueDate")
            .and_then(|s| NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok());
        let Some(due) = due else { return };
        let estimated_through = add_month(due).format("%Y-%m-%d").to_string();
        let through = subscription_next_due
            .filter(|date| NaiveDate::parse_from_str(date, "%Y-%m-%d").is_ok())
            .filter(|date| *date > estimated_through.as_str())
            .map(str::to_owned)
            .unwrap_or(estimated_through);
        if self
            .paid_through
            .as_deref()
            .is_some_and(|old| old >= through.as_str())
        {
            return;
        }
        self.paid_through = Some(through.clone());
        self.last_payment_id = Some(payment_id);
        if !self.cancelled {
            self.revoked = false;
            self.next_charge = Some(through);
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Food {
    pub name: String,
    pub amount: String,
    pub calories_kcal: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Analysis {
    pub description: String,
    pub foods: Vec<Food>,
}

fn compact_ai_text(value: &str, max_bytes: usize) -> String {
    let value = value.trim();
    if value.len() <= max_bytes {
        return value.to_owned();
    }
    let mut end = max_bytes.saturating_sub("…".len());
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", value[..end].trim_end())
}

fn normalize_analysis(mut analysis: Analysis) -> Analysis {
    analysis.description = compact_ai_text(&analysis.description, 500);
    for food in &mut analysis.foods {
        food.name = compact_ai_text(&food.name, 100);
        food.amount = compact_ai_text(&food.amount, 80);
    }
    analysis
}

fn parse_analysis(text: &str) -> Result<Analysis, AnalysisFailure> {
    let value: Value = serde_json::from_str(text).map_err(|_| AnalysisFailure::GeminiJsonSyntax)?;
    if !value.get("description").is_some_and(Value::is_string) {
        return Err(AnalysisFailure::DescriptionShape);
    }
    let foods = value
        .get("foods")
        .and_then(Value::as_array)
        .ok_or(AnalysisFailure::FoodsShape)?;
    for food in foods {
        if !food.get("name").is_some_and(Value::is_string) {
            return Err(AnalysisFailure::FoodNameShape);
        }
        if !food.get("amount").is_some_and(Value::is_string) {
            return Err(AnalysisFailure::FoodAmountShape);
        }
        if !food.get("caloriesKcal").is_some_and(Value::is_number) {
            return Err(AnalysisFailure::CaloriesShape);
        }
    }
    let analysis: Analysis =
        serde_json::from_value(value).map_err(|_| AnalysisFailure::GeminiJsonShape)?;
    let analysis = normalize_analysis(analysis);
    if analysis.description.is_empty() {
        return Err(AnalysisFailure::EmptyDescription);
    }
    if analysis.foods.is_empty() {
        return Err(AnalysisFailure::EmptyFoods);
    }
    if analysis.foods.len() > 30 {
        return Err(AnalysisFailure::TooManyFoods);
    }
    for food in &analysis.foods {
        if food.name.is_empty() {
            return Err(AnalysisFailure::EmptyFoodName);
        }
        if food.amount.is_empty() {
            return Err(AnalysisFailure::EmptyFoodAmount);
        }
        if !food.calories_kcal.is_finite() || !(0.0..=5000.0).contains(&food.calories_kcal) {
            return Err(AnalysisFailure::InvalidCalories);
        }
    }
    Ok(analysis)
}

fn extract_analysis_text(result: &Value) -> Result<&str, AnalysisFailure> {
    let candidate = result
        .pointer("/candidates/0")
        .ok_or(AnalysisFailure::NoCandidate)?;
    match candidate.get("finishReason").and_then(Value::as_str) {
        Some("SAFETY") => return Err(AnalysisFailure::SafetyBlocked),
        Some("MAX_TOKENS") => return Err(AnalysisFailure::MaxTokens),
        _ => {}
    }
    candidate
        .pointer("/content/parts")
        .and_then(Value::as_array)
        .and_then(|parts| {
            parts
                .iter()
                .find_map(|part| part.get("text").and_then(Value::as_str))
        })
        .ok_or(AnalysisFailure::MissingText)
}

fn should_retry_gemini(
    status: u16,
    attempt: usize,
    remaining: std::time::Duration,
    pause: std::time::Duration,
) -> bool {
    status == 503 && attempt == 0 && remaining > pause + std::time::Duration::from_secs(3)
}

fn should_fallback_to_pro(
    status: u16,
    flash_attempt: usize,
    paid: bool,
    remaining: std::time::Duration,
) -> bool {
    paid && status == 503 && flash_attempt == 1 && remaining > std::time::Duration::from_secs(5)
}

fn gemini_request_body(image: &str) -> Value {
    json!({
        "contents": [{"parts": [
            {"text": PROMPT},
            {"inline_data": {"mime_type": "image/jpeg", "data": image}}
        ]}],
        "generationConfig": {
            "maxOutputTokens": 2048,
            "thinkingConfig": {"thinkingLevel": "LOW"},
            "responseFormat": {"text": {
                // The v1beta REST endpoint expects the enum name; lowercase application/json returns 400.
                "mimeType": "APPLICATION_JSON",
                "schema": {
                    "type": "object",
                    "properties": {
                        "description": {"type": "string", "description": "Descrição da refeição em português do Brasil"},
                        "foods": {"type": "array", "maxItems": 30, "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string", "description": "Nome simples do alimento ou bebida"},
                                "amount": {"type": "string", "description": "Porção aproximada em gramas ou medida caseira"},
                                "caloriesKcal": {"type": "number", "minimum": 0, "maximum": 5000}
                            },
                            "required": ["name", "amount", "caloriesKcal"]
                        }}
                    },
                    "required": ["description", "foods"]
                }
            }}
        }
    })
}

#[derive(Debug, PartialEq, Eq)]
pub enum AnalysisFailure {
    InvalidImage,
    GeminiNetwork,
    GeminiTimeout,
    GeminiStatus(u16),
    GeminiProNetwork,
    GeminiProTimeout,
    GeminiProStatus(u16),
    GeminiResponse,
    NoCandidate,
    SafetyBlocked,
    MaxTokens,
    MissingText,
    GeminiJsonSyntax,
    GeminiJsonShape,
    DescriptionShape,
    FoodsShape,
    FoodNameShape,
    FoodAmountShape,
    CaloriesShape,
    EmptyDescription,
    EmptyFoods,
    TooManyFoods,
    EmptyFoodName,
    EmptyFoodAmount,
    InvalidCalories,
}

impl AnalysisFailure {
    pub fn counts_toward_failure_limit(&self) -> bool {
        !matches!(
            self,
            Self::InvalidImage
                | Self::GeminiNetwork
                | Self::GeminiTimeout
                | Self::GeminiStatus(_)
                | Self::GeminiProNetwork
                | Self::GeminiProTimeout
                | Self::GeminiProStatus(_)
        )
    }

    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidImage => "invalid_image",
            Self::GeminiNetwork => "gemini_network",
            Self::GeminiTimeout => "gemini_timeout",
            Self::GeminiStatus(_) => "gemini_status",
            Self::GeminiProNetwork => "gemini_pro_network",
            Self::GeminiProTimeout => "gemini_pro_timeout",
            Self::GeminiProStatus(_) => "gemini_pro_status",
            Self::GeminiResponse => "gemini_response",
            Self::NoCandidate => "gemini_no_candidate",
            Self::SafetyBlocked => "gemini_safety_blocked",
            Self::MaxTokens => "gemini_max_tokens",
            Self::MissingText => "gemini_missing_text",
            Self::GeminiJsonSyntax => "gemini_json_syntax",
            Self::GeminiJsonShape => "gemini_json_shape",
            Self::DescriptionShape => "gemini_description_shape",
            Self::FoodsShape => "gemini_foods_shape",
            Self::FoodNameShape => "gemini_food_name_shape",
            Self::FoodAmountShape => "gemini_food_amount_shape",
            Self::CaloriesShape => "gemini_calories_shape",
            Self::EmptyDescription => "gemini_empty_description",
            Self::EmptyFoods => "gemini_empty_foods",
            Self::TooManyFoods => "gemini_too_many_foods",
            Self::EmptyFoodName => "gemini_empty_food_name",
            Self::EmptyFoodAmount => "gemini_empty_food_amount",
            Self::InvalidCalories => "gemini_invalid_calories",
        }
    }

    pub fn upstream_status(&self) -> Option<u16> {
        match self {
            Self::GeminiStatus(status) | Self::GeminiProStatus(status) => Some(*status),
            _ => None,
        }
    }
}

fn today() -> String {
    Utc::now()
        .with_timezone(&Sao_Paulo)
        .format("%Y-%m-%d")
        .to_string()
}

fn google_key(sub: &str) -> String {
    format!("GOOGLE#{:x}", Sha256::digest(sub.as_bytes()))
}

fn checkout_url(id: &str) -> Result<String, String> {
    uuid::Uuid::parse_str(id).map_err(|_| "Checkout sem identificador válido".to_owned())?;
    Ok(format!("https://asaas.com/checkoutSession/show?id={id}"))
}

fn existing_checkout(account: Account) -> Result<Option<(String, Account)>, String> {
    if account.active() {
        return Err("Já existe um plano ativo para esta conta Google".into());
    }
    if account.subscription_id.is_some() && !account.cancelled {
        return Err("Existe uma assinatura em andamento no Asaas. Cancele a renovação antes de assinar novamente.".into());
    }
    if !account.checkout_url.is_empty()
        && account.checkout_expires_at > Utc::now().timestamp()
        && account.paid_through.is_none()
    {
        return Ok(Some((account.checkout_url.clone(), account)));
    }
    Ok(None)
}

fn add_month(date: NaiveDate) -> NaiveDate {
    let (year, month) = if date.month() == 12 {
        (date.year() + 1, 1)
    } else {
        (date.year(), date.month() + 1)
    };
    let last = (NaiveDate::from_ymd_opt(year, month, 1)
        .unwrap()
        .checked_add_months(chrono::Months::new(1))
        .unwrap()
        - Duration::days(1))
    .day();
    NaiveDate::from_ymd_opt(year, month, date.day().min(last)).unwrap()
}

fn apply_paid_checkout(
    account: &mut Account,
    sub_id: &str,
    customer: &str,
    next_charge: &str,
    payment_id: &str,
    due_date: NaiveDate,
) {
    let estimated_through = add_month(due_date).format("%Y-%m-%d").to_string();
    let through = if next_charge > estimated_through.as_str() {
        next_charge.to_owned()
    } else {
        estimated_through
    };
    if account
        .paid_through
        .as_deref()
        .is_none_or(|old| old < through.as_str())
    {
        account.paid_through = Some(through.clone());
        account.revoked = false;
    }
    account.next_charge = (!account.cancelled).then_some(through);
    account.customer_id = Some(customer.to_owned());
    account.subscription_id = Some(sub_id.to_owned());
    account.last_payment_id = Some(payment_id.to_owned());
}

fn str_field(value: &Value, name: &str) -> Option<String> {
    value
        .get(name)?
        .as_str()
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

fn bounded_field(value: &Value, name: &str) -> Option<String> {
    str_field(value, name).filter(|field| field.len() <= 200)
}

pub fn valid_jpeg_image(image: &str) -> bool {
    if !(100..=480_000).contains(&image.len()) {
        return false;
    }
    let Ok(bytes) = STANDARD.decode(image) else {
        return false;
    };
    if bytes.len() < 32
        || bytes.len() > 360_000
        || !bytes.starts_with(&[0xff, 0xd8])
        || !bytes.ends_with(&[0xff, 0xd9])
    {
        return false;
    }
    let mut cursor = 2;
    let mut dimensions_found = false;
    while cursor < bytes.len() - 2 {
        if bytes[cursor] != 0xff {
            return false;
        }
        while cursor < bytes.len() - 2 && bytes[cursor] == 0xff {
            cursor += 1;
        }
        let marker = bytes[cursor];
        cursor += 1;
        if marker == 0xda {
            if cursor + 2 > bytes.len() - 2 {
                return false;
            }
            let length = u16::from_be_bytes([bytes[cursor], bytes[cursor + 1]]) as usize;
            return dimensions_found && length >= 2 && cursor + length < bytes.len() - 2;
        }
        if marker == 0xd8 || marker == 0xd9 || (0xd0..=0xd7).contains(&marker) {
            return false;
        }
        if cursor + 2 > bytes.len() - 2 {
            return false;
        }
        let length = u16::from_be_bytes([bytes[cursor], bytes[cursor + 1]]) as usize;
        if length < 2 || cursor + length > bytes.len() - 2 {
            return false;
        }
        if matches!(marker, 0xc0..=0xc3 | 0xc5..=0xc7 | 0xc9..=0xcb | 0xcd..=0xcf) {
            if length < 8 {
                return false;
            }
            let height = u16::from_be_bytes([bytes[cursor + 3], bytes[cursor + 4]]) as u32;
            let width = u16::from_be_bytes([bytes[cursor + 5], bytes[cursor + 6]]) as u32;
            if height == 0 || width == 0 || height > 4096 || width > 4096 {
                return false;
            }
            dimensions_found = true;
        }
        cursor += length;
    }
    false
}

fn compact_webhook_event(event: &Value) -> Value {
    let id = str_field(event, "id")
        .filter(|id| id.len() <= 150)
        .unwrap_or_else(|| format!("invalid-{:x}", Sha256::digest(event.to_string().as_bytes())));
    let kind = str_field(event, "event")
        .filter(|kind| kind.len() <= 100)
        .unwrap_or_else(|| "UNKNOWN".into());
    if kind.starts_with("CHECKOUT_") {
        let checkout = event.get("checkout").unwrap_or(&Value::Null);
        json!({"id":id,"event":kind,"checkout":{
            "id":bounded_field(checkout,"id"),"customer":bounded_field(checkout,"customer")
        }})
    } else if kind.starts_with("SUBSCRIPTION_") {
        let sub = event.get("subscription").unwrap_or(&Value::Null);
        json!({"id":id,"event":kind,"subscription":{
            "id":bounded_field(sub,"id"),
            "customer":bounded_field(sub,"customer"),
            "nextDueDate":bounded_field(sub,"nextDueDate"),
            "status":bounded_field(sub,"status")
        }})
    } else if kind.starts_with("PAYMENT_") {
        let payment = event.get("payment").unwrap_or(&Value::Null);
        json!({"id":id,"event":kind,"payment":{
            "id":bounded_field(payment,"id"),
            "subscription":bounded_field(payment,"subscription"),
            "customer":bounded_field(payment,"customer"),
            "dueDate":bounded_field(payment,"dueDate")
        }})
    } else {
        json!({"id":id,"event":kind})
    }
}

fn webhook_group(event: &Value) -> String {
    let group = ["checkout", "subscription", "payment"]
        .iter()
        .find_map(|name| event.get(name).and_then(|item| str_field(item, "customer")))
        .or_else(|| {
            ["checkout", "subscription", "payment"]
                .iter()
                .find_map(|name| event.get(name).and_then(|item| str_field(item, "id")))
        })
        .or_else(|| str_field(event, "id"))
        .unwrap_or_default();
    format!("{:x}", Sha256::digest(group.as_bytes()))
}

fn paid_checkout_payment<'a>(items: &'a [Value], checkout_id: &str) -> Option<&'a Value> {
    items.iter().find(|payment| {
        str_field(payment, "checkoutSession").as_deref() == Some(checkout_id)
            && matches!(
                str_field(payment, "status").as_deref(),
                Some("CONFIRMED" | "RECEIVED")
            )
            && payment
                .get("value")
                .and_then(Value::as_f64)
                .is_some_and(|value| (value - 8.99).abs() < 0.001)
            && str_field(payment, "subscription").is_some()
            && str_field(payment, "customer").is_some()
    })
}

fn valid_webhook_token(expected: &str, provided: Option<&str>) -> bool {
    provided.is_some_and(|token| {
        token.len() == expected.len() && token.as_bytes().ct_eq(expected.as_bytes()).into()
    })
}

impl Billing {
    pub async fn load() -> Result<Self, Box<dyn std::error::Error + Send + Sync>> {
        let config = aws_config::load_defaults(BehaviorVersion::latest()).await;
        let secrets = Secrets::new(&config);
        let keys_arn = std::env::var("BILLING_KEYS_ARN")?;
        let token_arn = std::env::var("BILLING_WEBHOOK_TOKEN_ARN")?;
        let keys = secrets
            .get_secret_value()
            .secret_id(keys_arn)
            .send()
            .await?
            .secret_string()
            .ok_or("missing billing keys")?
            .to_owned();
        let parsed: Value = serde_json::from_str(&keys)?;
        let asaas_key = str_field(&parsed, "asaas").ok_or("missing Asaas key")?;
        let gemini_key = str_field(&parsed, "gemini").ok_or("missing Gemini key")?;
        let webhook_token = secrets
            .get_secret_value()
            .secret_id(token_arn)
            .send()
            .await?
            .secret_string()
            .ok_or("missing webhook token")?
            .to_owned();
        Ok(Self {
            db: Db::new(&config),
            queue: Sqs::new(&config),
            queue_url: std::env::var("BILLING_EVENTS_QUEUE_URL")?,
            table: std::env::var("BILLING_TABLE_NAME")?,
            client: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(24))
                .user_agent(ASAAS_USER_AGENT)
                .build()?,
            asaas_key: Arc::new(asaas_key),
            gemini_key: Arc::new(gemini_key),
            webhook_token: Arc::new(webhook_token),
            asaas_url: std::env::var("ASAAS_API_URL")
                .unwrap_or_else(|_| "https://api.asaas.com".into()),
            app_url: std::env::var("PUBLIC_APP_URL")?,
            google_client_id: std::env::var("GOOGLE_CLIENT_ID")?,
        })
    }

    pub async fn google_account_key(&self, token: &str) -> Result<String, String> {
        if token.len() < 20 || token.len() > 4096 {
            return Err("Token Google inválido".into());
        }
        let body = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("access_token", token)
            .finish();
        let response = self
            .client
            .post("https://oauth2.googleapis.com/tokeninfo")
            .header("content-type", "application/x-www-form-urlencoded")
            .body(body)
            .send()
            .await
            .map_err(|_| "Google indisponível".to_owned())?;
        if !response.status().is_success() {
            return Err("Conecte novamente sua conta Google".into());
        }
        let details: Value = response
            .json()
            .await
            .map_err(|_| "Resposta inválida do Google".to_owned())?;
        let issued_to = str_field(&details, "azp")
            .or_else(|| str_field(&details, "aud"))
            .ok_or("Token sem aplicativo")?;
        if issued_to != self.google_client_id {
            return Err("Conta Google não autorizada para a Biorotina".into());
        }
        let sub = str_field(&details, "sub").ok_or("Conta Google sem identificador")?;
        Ok(google_key(&sub))
    }

    async fn item(&self, key: &str) -> Result<Option<Value>, String> {
        let output = self
            .db
            .get_item()
            .table_name(&self.table)
            .key("pk", A::S(key.into()))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        output
            .item
            .and_then(|item| {
                item.get("data")
                    .and_then(|a| a.as_s().ok())
                    .and_then(|s| serde_json::from_str(s).ok())
            })
            .map_or(Ok(None), |v| Ok(Some(v)))
    }

    async fn account_consistent(&self, key: &str) -> Result<Option<Account>, String> {
        let output = self
            .db
            .get_item()
            .table_name(&self.table)
            .key("pk", A::S(key.into()))
            .consistent_read(true)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        match output.item {
            None => Ok(None),
            Some(item) => {
                let raw = item
                    .get("data")
                    .and_then(|value| value.as_s().ok())
                    .ok_or_else(|| "Conta sem dados válidos".to_owned())?;
                serde_json::from_str(raw)
                    .map(Some)
                    .map_err(|_| "Conta com dados inválidos".to_owned())
            }
        }
    }

    async fn put(&self, key: &str, data: &Value) -> Result<(), String> {
        self.db
            .put_item()
            .table_name(&self.table)
            .item("pk", A::S(key.into()))
            .item("data", A::S(data.to_string()))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn account(&self, key: &str) -> Result<Option<Account>, String> {
        self.item(key)
            .await?
            .map(serde_json::from_value)
            .transpose()
            .map_err(|e| e.to_string())
    }

    async fn save_account(&self, account: &Account) -> Result<(), String> {
        self.put(
            &account.key,
            &serde_json::to_value(account).map_err(|e| e.to_string())?,
        )
        .await
    }

    async fn save_checkout_bindings(
        &self,
        account: &Account,
        reference: &str,
        attempt_ttl: i64,
    ) -> Result<(), String> {
        let account_data = serde_json::to_string(account).map_err(|_| "Conta inválida")?;
        let account_put = Put::builder()
            .table_name(&self.table)
            .item("pk", A::S(account.key.clone()))
            .item("data", A::S(account_data))
            .build()
            .map_err(|_| "Conta inválida")?;
        let mapping_put = Put::builder()
            .table_name(&self.table)
            .item("pk", A::S(format!("CHECKOUT#{}", account.checkout_id)))
            .item("data", A::S(json!({"key":account.key}).to_string()))
            .condition_expression("attribute_not_exists(pk)")
            .build()
            .map_err(|_| "Mapeamento inválido")?;
        let attempt_put = Put::builder()
            .table_name(&self.table)
            .item("pk", A::S(format!("CHECKOUT_ATTEMPT#{reference}")))
            .item(
                "data",
                A::S(
                    json!({"key":account.key,"checkoutId":account.checkout_id,"state":"created"})
                        .to_string(),
                ),
            )
            .item("ttl", A::N(attempt_ttl.to_string()))
            .build()
            .map_err(|_| "Tentativa inválida")?;
        self.db
            .transact_write_items()
            .transact_items(TransactWriteItem::builder().put(account_put).build())
            .transact_items(TransactWriteItem::builder().put(mapping_put).build())
            .transact_items(TransactWriteItem::builder().put(attempt_put).build())
            .send()
            .await
            .map_err(|_| "Não foi possível salvar o checkout".to_owned())?;
        Ok(())
    }

    pub async fn checkout(&self, key: String) -> Result<(String, Account), String> {
        if let Some(existing) = self.account(&key).await? {
            if let Some(reusable) = existing_checkout(existing)? {
                return Ok(reusable);
            }
        }
        let expires = Utc::now().timestamp() + 3600;
        let reference = uuid::Uuid::new_v4().to_string();
        let attempt_ttl = expires + 14 * 86400;
        let lock_key = format!("LOCK#{key}");
        let lock_data = json!({"owner":reference}).to_string();
        self.db
            .put_item()
            .table_name(&self.table)
            .item("pk", A::S(lock_key.clone()))
            .item("data", A::S(lock_data.clone()))
            .item("expires", A::N(expires.to_string()))
            .item("ttl", A::N((expires + 86400).to_string()))
            .condition_expression("attribute_not_exists(pk) OR expires < :now")
            .expression_attribute_values(":now", A::N(Utc::now().timestamp().to_string()))
            .send()
            .await
            .map_err(|_| {
                "Já existe uma assinatura em andamento para esta conta Google.".to_owned()
            })?;
        let mut safe_to_release = true;
        let outcome = async {
            // A leitura antes do bloqueio é só um atalho. Outra requisição pode
            // ter criado o checkout enquanto aguardávamos o bloqueio.
            if let Some(existing) = self.account_consistent(&key).await? {
                if let Some(reusable) = existing_checkout(existing)? {
                    return Ok(reusable);
                }
            }
            self.db
                .put_item()
                .table_name(&self.table)
                .item("pk", A::S(format!("CHECKOUT_ATTEMPT#{reference}")))
                .item(
                    "data",
                    A::S(json!({"key":key,"state":"requested","createdAt":Utc::now().timestamp()}).to_string()),
                )
                .item("ttl", A::N(attempt_ttl.to_string()))
                .condition_expression("attribute_not_exists(pk)")
                .send()
                .await
                .map_err(|_| "Não foi possível iniciar o checkout".to_owned())?;
            // Após chamar o Asaas, uma falha de rede pode ter criado um
            // checkout externo; nesse caso mantemos o bloqueio temporário.
            safe_to_release = false;
            let callback = format!("{}/#/assinatura", self.app_url.trim_end_matches('/'));
            let payload = json!({
                "billingTypes": ["CREDIT_CARD"], "chargeTypes": ["RECURRENT"],
                "minutesToExpire": 60, "externalReference": reference,
                "callback": {"successUrl":callback,"cancelUrl":callback,"expiredUrl":callback},
                "items": [{"name":"Biorotina IA", "description":"Até 10 análises de refeições por foto ao dia", "quantity":1,"value":8.99}],
                "subscription": {"cycle":"MONTHLY","nextDueDate":(Utc::now() + Duration::minutes(65)).with_timezone(&Sao_Paulo).format("%Y-%m-%d %H:%M:%S").to_string()}
            });
            let response = self
                .client
                .post(format!("{}/v3/checkouts", self.asaas_url))
                .header("access_token", self.asaas_key.as_str())
                .json(&payload)
                .send()
                .await
                .map_err(|_| "Asaas indisponível".to_owned())?;
            if !response.status().is_success() {
                safe_to_release = response.status().is_client_error();
                return Err(format!("Asaas recusou o checkout ({})", response.status()));
            }
            let result: Value = response
                .json()
                .await
                .map_err(|_| "Resposta inválida do Asaas".to_owned())?;
            let checkout_id = str_field(&result, "id").ok_or("Checkout sem identificador")?;
            let checkout_url = checkout_url(&checkout_id)?;
            let account = Account {
                key: key.clone(),
                checkout_id: checkout_id.clone(),
                checkout_url: checkout_url.clone(),
                checkout_expires_at: Utc::now().timestamp() + 3600,
                customer_id: None,
                subscription_id: None,
                paid_through: None,
                next_charge: None,
                revoked: false,
                cancelled: false,
                last_payment_id: None,
            };
            self.save_checkout_bindings(&account, &reference, attempt_ttl)
                .await?;
            safe_to_release = true;
            Ok((checkout_url, account))
        }
        .await;
        if outcome.is_err() && !safe_to_release {
            observability::error("billing", "checkout", "outcome_needs_reconciliation", None);
        }
        if safe_to_release {
            if let Err(error) = self
                .db
                .delete_item()
                .table_name(&self.table)
                .key("pk", A::S(lock_key))
                .condition_expression("#data = :owner")
                .expression_attribute_names("#data", "data")
                .expression_attribute_values(":owner", A::S(lock_data))
                .send()
                .await
            {
                let _ = error;
                observability::error("billing", "checkout", "lock_release_failed", None);
            }
        }
        outcome
    }

    pub async fn status(&self, account: &Account) -> Result<Value, String> {
        let day = today();
        let usage_key = format!("USAGE#{}#{day}", account.key);
        let used = self
            .db
            .get_item()
            .table_name(&self.table)
            .key("pk", A::S(usage_key))
            .send()
            .await
            .map_err(|e| e.to_string())?
            .item
            .and_then(|m| {
                m.get("used")
                    .and_then(|a| a.as_n().ok())
                    .and_then(|n| n.parse::<u32>().ok())
            })
            .unwrap_or(0);
        Ok(
            json!({"active":account.active(),"cancelled":account.cancelled,"renewalActive":account.subscription_id.is_some() && !account.cancelled,"paidThrough":account.paid_through,"nextCharge":account.next_charge,"usedToday":used,"dailyLimit":10,"checkoutUrl":if account.active() || account.checkout_expires_at <= Utc::now().timestamp() {None} else {Some(account.checkout_url.as_str())}}),
        )
    }

    pub async fn trial_enabled(&self) -> Result<bool, String> {
        match self.item("CONFIG#PHOTO_TRIAL").await? {
            None => Ok(true),
            Some(item) => item
                .get("enabled")
                .and_then(Value::as_bool)
                .ok_or_else(|| "Configuração do teste grátis inválida".to_owned()),
        }
    }

    pub async fn trial_used(&self, account_key: &str) -> Result<u32, String> {
        let key = format!("TRIAL#{account_key}");
        let result = self
            .db
            .get_item()
            .table_name(&self.table)
            .key("pk", A::S(key))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        Ok(result
            .item
            .and_then(|item| {
                item.get("used")
                    .and_then(|value| value.as_n().ok())
                    .and_then(|value| value.parse::<u32>().ok())
            })
            .unwrap_or(0))
    }

    pub async fn reserve_trial(&self, account_key: &str) -> Result<Option<String>, String> {
        let key = format!("TRIAL#{account_key}");
        let result = self
            .db
            .update_item()
            .table_name(&self.table)
            .key("pk", A::S(key.clone()))
            .update_expression("SET #used = if_not_exists(#used, :zero) + :one")
            .condition_expression("attribute_not_exists(#used) OR #used < :limit")
            .expression_attribute_names("#used", "used")
            .expression_attribute_values(":zero", A::N("0".into()))
            .expression_attribute_values(":one", A::N("1".into()))
            .expression_attribute_values(":limit", A::N(TRIAL_LIMIT.to_string()))
            .send()
            .await;
        match result {
            Ok(_) => Ok(Some(key)),
            Err(error)
                if error
                    .as_service_error()
                    .is_some_and(|service| service.is_conditional_check_failed_exception()) =>
            {
                Ok(None)
            }
            Err(error) => Err(error.to_string()),
        }
    }

    // Reserve a slot before contacting Gemini so concurrent failed requests
    // cannot all pass the daily failure limit. Successful or upstream-failed
    // requests release the slot; unusable AI responses keep it until tomorrow.
    pub async fn reserve_failure_slot(&self, account_key: &str) -> Result<Option<String>, String> {
        let key = format!("AI_FAILURE#{account_key}#{}", today());
        let result = self
            .db
            .update_item()
            .table_name(&self.table)
            .key("pk", A::S(key.clone()))
            .update_expression("SET #used = if_not_exists(#used, :zero) + :one, #ttl = :ttl")
            .condition_expression("attribute_not_exists(#used) OR #used < :limit")
            .expression_attribute_names("#used", "used")
            .expression_attribute_names("#ttl", "ttl")
            .expression_attribute_values(":zero", A::N("0".into()))
            .expression_attribute_values(":one", A::N("1".into()))
            .expression_attribute_values(":limit", A::N(FAILED_ANALYSIS_LIMIT.to_string()))
            .expression_attribute_values(
                ":ttl",
                A::N((Utc::now().timestamp() + 3 * 86400).to_string()),
            )
            .send()
            .await;
        match result {
            Ok(_) => Ok(Some(key)),
            Err(error)
                if error
                    .as_service_error()
                    .is_some_and(|service| service.is_conditional_check_failed_exception()) =>
            {
                Ok(None)
            }
            Err(error) => Err(error.to_string()),
        }
    }

    // This separate ceiling also counts upstream errors. It protects the paid
    // provider without consuming the person's successful-analysis quota.
    pub async fn reserve_attempt_slot(&self, account_key: &str) -> Result<bool, String> {
        let key = format!("AI_ATTEMPT#{account_key}#{}", today());
        let result = self
            .db
            .update_item()
            .table_name(&self.table)
            .key("pk", A::S(key))
            .update_expression("SET #used = if_not_exists(#used, :zero) + :one, #ttl = :ttl")
            .condition_expression("attribute_not_exists(#used) OR #used < :limit")
            .expression_attribute_names("#used", "used")
            .expression_attribute_names("#ttl", "ttl")
            .expression_attribute_values(":zero", A::N("0".into()))
            .expression_attribute_values(":one", A::N("1".into()))
            .expression_attribute_values(":limit", A::N(DAILY_ATTEMPT_LIMIT.to_string()))
            .expression_attribute_values(
                ":ttl",
                A::N((Utc::now().timestamp() + 3 * 86400).to_string()),
            )
            .send()
            .await;
        match result {
            Ok(_) => Ok(true),
            Err(error)
                if error
                    .as_service_error()
                    .is_some_and(|service| service.is_conditional_check_failed_exception()) =>
            {
                Ok(false)
            }
            Err(error) => Err(error.to_string()),
        }
    }

    async fn asaas_get(&self, path: &str) -> Result<Value, String> {
        let response = self
            .client
            .get(format!("{}{}", self.asaas_url, path))
            .header("access_token", self.asaas_key.as_str())
            .send()
            .await
            .map_err(|_| "Asaas indisponível".to_owned())?;
        if !response.status().is_success() {
            return Err("Asaas indisponível".into());
        }
        response
            .json()
            .await
            .map_err(|_| "Resposta inválida do Asaas".into())
    }

    async fn reconcile_checkout(
        &self,
        checkout_id: &str,
        checkout_expires_at: i64,
    ) -> Result<(String, String, String, String, NaiveDate), String> {
        let payments = self
            .asaas_get(&format!(
                "/v3/payments?checkoutSession={checkout_id}&limit=10"
            ))
            .await?;
        let filtered = payments
            .get("data")
            .and_then(Value::as_array)
            .and_then(|items| paid_checkout_payment(items, checkout_id));
        // O filtro checkoutSession do Asaas pode retornar zero mesmo quando a
        // cobrança contém esse identificador. Consulte o dia do checkout e
        // confira o vínculo exato antes de conceder acesso.
        let fallback = if filtered.is_none() {
            let since = chrono::DateTime::from_timestamp(checkout_expires_at - 3600 - 86400, 0)
                .filter(|_| checkout_expires_at > 0)
                .unwrap_or_else(Utc::now)
                .format("%Y-%m-%d")
                .to_string();
            let mut found = None;
            for page in 0..20 {
                let result = self
                    .asaas_get(&format!(
                        "/v3/payments?dateCreated%5Bge%5D={since}&limit=100&offset={}",
                        page * 100
                    ))
                    .await?;
                let items = result
                    .get("data")
                    .and_then(Value::as_array)
                    .ok_or("Lista de cobranças inválida")?;
                if let Some(payment) = paid_checkout_payment(items, checkout_id) {
                    found = Some(payment.clone());
                    break;
                }
                if items.len() < 100 {
                    break;
                }
            }
            found
        } else {
            None
        };
        let payment = filtered
            .or(fallback.as_ref())
            .ok_or("Cobrança confirmada ainda não disponível")?;
        let sub_id = str_field(payment, "subscription").ok_or("Assinatura ausente")?;
        let customer = str_field(payment, "customer").ok_or("Cliente ausente")?;
        let sub = self
            .asaas_get(&format!("/v3/subscriptions/{sub_id}"))
            .await?;
        // A assinatura pode já estar inativa quando o evento de pagamento
        // atrasado chega depois de um cancelamento. O pagamento confirmado e
        // o vínculo exato com o checkout continuam sendo obrigatórios.
        if str_field(&sub, "checkoutSession").as_deref() != Some(checkout_id)
            || str_field(&sub, "customer") != Some(customer.clone())
        {
            return Err("Assinatura não corresponde ao checkout pago".into());
        }
        let next_charge = str_field(&sub, "nextDueDate").unwrap_or_default();
        let payment_id = str_field(payment, "id").ok_or("Cobrança sem identificador")?;
        let due_date = str_field(payment, "dueDate")
            .and_then(|s| NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok())
            .ok_or("Data da cobrança ausente")?;
        Ok((sub_id, customer, next_charge, payment_id, due_date))
    }

    pub async fn cancel(&self, account: &Account) -> Result<Account, String> {
        if account.cancelled {
            return Ok(account.clone());
        }
        let payment = if account.subscription_id.is_none() {
            Some(
                self.reconcile_checkout(&account.checkout_id, account.checkout_expires_at)
                    .await?,
            )
        } else {
            None
        };
        let sub_id = account
            .subscription_id
            .clone()
            .or_else(|| payment.as_ref().map(|(sub_id, _, _, _, _)| sub_id.clone()))
            .ok_or("Assinatura ausente")?;
        let mut updated = account.clone();
        if let Some((_, customer, next_charge, payment_id, due_date)) = payment {
            apply_paid_checkout(
                &mut updated,
                &sub_id,
                &customer,
                &next_charge,
                &payment_id,
                due_date,
            );
            self.put(&format!("CUSTOMER#{customer}"), &json!({"key":account.key}))
                .await?;
            self.put(&format!("SUB#{sub_id}"), &json!({"key":account.key}))
                .await?;
            self.save_account(&updated).await?;
        }
        let response = self
            .client
            .delete(format!("{}/v3/subscriptions/{sub_id}", self.asaas_url))
            .header("access_token", self.asaas_key.as_str())
            .send()
            .await
            .map_err(|_| "Asaas indisponível".to_owned())?;
        if !response.status().is_success() && response.status().as_u16() != 404 {
            return Err(format!(
                "Asaas recusou o cancelamento ({})",
                response.status()
            ));
        }
        updated.subscription_id = Some(sub_id);
        updated.cancelled = true;
        updated.next_charge = None;
        self.save_account(&updated).await?;
        Ok(updated)
    }

    pub async fn reserve(&self, account: &Account) -> Result<Option<String>, String> {
        let key = format!("USAGE#{}#{}", account.key, today());
        let result = self
            .db
            .update_item()
            .table_name(&self.table)
            .key("pk", A::S(key.clone()))
            .update_expression("SET #used = if_not_exists(#used, :zero) + :one, #ttl = :ttl")
            .condition_expression("attribute_not_exists(#used) OR #used < :limit")
            .expression_attribute_names("#used", "used")
            .expression_attribute_names("#ttl", "ttl")
            .expression_attribute_values(":zero", A::N("0".into()))
            .expression_attribute_values(":one", A::N("1".into()))
            .expression_attribute_values(":limit", A::N("10".into()))
            .expression_attribute_values(
                ":ttl",
                A::N((Utc::now().timestamp() + 3 * 86400).to_string()),
            )
            .send()
            .await;
        match result {
            Ok(_) => Ok(Some(key)),
            Err(e)
                if e.as_service_error()
                    .is_some_and(|s| s.is_conditional_check_failed_exception()) =>
            {
                Ok(None)
            }
            Err(e) => Err(e.to_string()),
        }
    }

    pub async fn refund_reservation(&self, key: &str) {
        if self
            .db
            .update_item()
            .table_name(&self.table)
            .key("pk", A::S(key.to_owned()))
            .update_expression("SET #used = #used - :one")
            .condition_expression("#used > :zero")
            .expression_attribute_names("#used", "used")
            .expression_attribute_values(":one", A::N("1".into()))
            .expression_attribute_values(":zero", A::N("0".into()))
            .send()
            .await
            .is_err()
        {
            observability::error("billing", "refund_reservation", "database_failed", None);
        }
    }

    pub async fn analyze(&self, image: &str, paid: bool) -> Result<Analysis, AnalysisFailure> {
        if !valid_jpeg_image(image) {
            return Err(AnalysisFailure::InvalidImage);
        }
        let body = gemini_request_body(image);
        let mut attempt = 0;
        let mut using_pro = false;
        let started = std::time::Instant::now();
        let response = loop {
            let remaining = GEMINI_TOTAL_BUDGET.saturating_sub(started.elapsed());
            let model = if using_pro {
                GEMINI_FALLBACK_MODEL
            } else {
                GEMINI_MODEL
            };
            let response = self.client.post(format!("https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"))
                .timeout(remaining)
                .header("x-goog-api-key", self.gemini_key.as_str())
                .json(&body)
                .send()
                .await
                .map_err(|error| match (using_pro, error.is_timeout()) {
                    (true, true) => AnalysisFailure::GeminiProTimeout,
                    (true, false) => AnalysisFailure::GeminiProNetwork,
                    (false, true) => AnalysisFailure::GeminiTimeout,
                    (false, false) => AnalysisFailure::GeminiNetwork,
                })?;
            let jitter_ms = Utc::now().timestamp_subsec_millis() as u64 % 501;
            let pause = std::time::Duration::from_millis(700 + jitter_ms);
            let remaining = GEMINI_TOTAL_BUDGET.saturating_sub(started.elapsed());
            if !using_pro
                && should_retry_gemini(response.status().as_u16(), attempt, remaining, pause)
            {
                observability::warning("billing", "analyze", "gemini_retry_503", Some(503));
                tokio::time::sleep(pause).await;
                attempt += 1;
                continue;
            }
            if !using_pro
                && should_fallback_to_pro(response.status().as_u16(), attempt, paid, remaining)
            {
                observability::warning("billing", "analyze", "gemini_fallback_pro", Some(503));
                using_pro = true;
                continue;
            }
            break response;
        };
        if !response.status().is_success() {
            return Err(if using_pro {
                AnalysisFailure::GeminiProStatus(response.status().as_u16())
            } else {
                AnalysisFailure::GeminiStatus(response.status().as_u16())
            });
        }
        let result: Value = response
            .json()
            .await
            .map_err(|_| AnalysisFailure::GeminiResponse)?;
        let text = extract_analysis_text(&result)?;
        let analysis = parse_analysis(text)?;
        if using_pro {
            observability::warning("billing", "analyze", "gemini_fallback_pro_recovered", None);
        } else if attempt > 0 {
            observability::warning("billing", "analyze", "gemini_retry_recovered", None);
        }
        Ok(analysis)
    }

    pub fn valid_webhook(&self, provided: Option<&str>) -> bool {
        valid_webhook_token(&self.webhook_token, provided)
    }

    pub async fn enqueue_webhook(&self, event: &Value) -> Result<(), String> {
        let compact = compact_webhook_event(event);
        let event_id = str_field(&compact, "id").ok_or("evento sem id")?;
        let deduplication_id = format!("{:x}", Sha256::digest(event_id.as_bytes()));
        let group_id = webhook_group(&compact);
        self.queue
            .send_message()
            .queue_url(&self.queue_url)
            .message_body(compact.to_string())
            .message_group_id(group_id)
            .message_deduplication_id(deduplication_id)
            .send()
            .await
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    pub async fn webhook(&self, event: &Value) -> Result<(), String> {
        let event_id = str_field(event, "id").ok_or("evento sem id")?;
        if event_id.len() > 150 {
            return Err("id inválido".into());
        }
        let kind = str_field(event, "event").ok_or("evento sem tipo")?;
        if self.item(&format!("EVENT#{event_id}")).await?.is_some() {
            return Ok(());
        }
        if kind.starts_with("CHECKOUT_") {
            let checkout = event.get("checkout").ok_or("checkout ausente")?;
            let id = str_field(checkout, "id").ok_or("checkout sem id")?;
            let Some(map) = self.item(&format!("CHECKOUT#{id}")).await? else {
                return Err("checkout desconhecido".into());
            };
            let key = str_field(&map, "key").ok_or("mapeamento inválido")?;
            let mut account = self.account(&key).await?.ok_or("assinatura ausente")?;
            if account.checkout_id != id {
                return Ok(());
            }
            if kind == "CHECKOUT_PAID" {
                if account.subscription_id.is_none() || account.paid_through.is_none() {
                    let (sub_id, customer, next_charge, payment_id, due_date) = self
                        .reconcile_checkout(&id, account.checkout_expires_at)
                        .await?;
                    apply_paid_checkout(
                        &mut account,
                        &sub_id,
                        &customer,
                        &next_charge,
                        &payment_id,
                        due_date,
                    );
                    self.put(&format!("CUSTOMER#{customer}"), &json!({"key":key}))
                        .await?;
                    self.put(&format!("SUB#{sub_id}"), &json!({"key":key}))
                        .await?;
                    self.save_account(&account).await?;
                }
            } else if kind == "CHECKOUT_CANCELED" || kind == "CHECKOUT_EXPIRED" {
                account.checkout_url.clear();
                account.checkout_expires_at = 0;
                self.save_account(&account).await?;
            }
        } else if kind.starts_with("SUBSCRIPTION_") {
            let sub = event.get("subscription").ok_or("assinatura ausente")?;
            let id = str_field(sub, "id").ok_or("assinatura sem id")?;
            let customer = str_field(sub, "customer").ok_or("cliente ausente")?;
            let Some(map) = self.item(&format!("CUSTOMER#{customer}")).await? else {
                return Ok(());
            };
            let key = str_field(&map, "key").ok_or("mapeamento inválido")?;
            let mut account = self.account(&key).await?.ok_or("assinatura ausente")?;
            if account.subscription_id.as_deref() != Some(id.as_str()) {
                return Ok(());
            }
            account.subscription_id = Some(id.clone());
            if !account.cancelled {
                account.next_charge =
                    str_field(sub, "nextDueDate").map(|date| match &account.paid_through {
                        Some(through) if through > &date => through.clone(),
                        _ => date,
                    });
            }
            if kind == "SUBSCRIPTION_INACTIVATED" || kind == "SUBSCRIPTION_DELETED" {
                account.cancelled = true;
                account.next_charge = None;
            }
            self.put(&format!("SUB#{id}"), &json!({"key":key})).await?;
            self.save_account(&account).await?;
        } else if kind.starts_with("PAYMENT_") {
            let payment = event.get("payment").ok_or("pagamento ausente")?;
            let Some(sub_id) = str_field(payment, "subscription") else {
                return Ok(());
            };
            let Some(map) = self.item(&format!("SUB#{sub_id}")).await? else {
                return Ok(());
            };
            let key = str_field(&map, "key").ok_or("mapeamento inválido")?;
            let mut account = self.account(&key).await?.ok_or("assinatura ausente")?;
            if account.subscription_id.as_deref() != Some(sub_id.as_str()) {
                return Ok(());
            }
            if kind == "PAYMENT_CONFIRMED" || kind == "PAYMENT_RECEIVED" {
                let subscription_next_due = self
                    .asaas_get(&format!("/v3/subscriptions/{sub_id}"))
                    .await
                    .ok()
                    .and_then(|subscription| str_field(&subscription, "nextDueDate"));
                account.record_payment(payment, subscription_next_due.as_deref());
            } else if (kind == "PAYMENT_REFUNDED" || kind == "PAYMENT_CHARGEBACK_REQUESTED")
                && str_field(payment, "id") == account.last_payment_id
            {
                account.revoked = true;
            }
            self.save_account(&account).await?;
        }
        self.put(&format!("EVENT#{event_id}"), &json!({"processed":true}))
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_a_paid_analysis_with_a_long_but_usable_description() {
        let description = "Prato feito tradicional com arroz branco, feijão, coxa e sobrecoxa de frango assada e batatas fritas, acompanhado por tigelas extras de batata frita e feijão.";
        assert!(description.len() > 120);
        let text = json!({
            "description": description,
            "foods": [{"name":"Arroz branco cozido","amount":"200 g","caloriesKcal":260}]
        });
        let analysis = parse_analysis(&text.to_string()).unwrap();
        assert_eq!(analysis.description, description);
    }

    #[test]
    fn bounds_extreme_ai_text_without_cutting_utf8() {
        let analysis = normalize_analysis(Analysis {
            description: "feijão ".repeat(100),
            foods: vec![Food {
                name: "🥗".repeat(40),
                amount: "porção ".repeat(20),
                calories_kcal: 100.0,
            }],
        });
        assert!(analysis.description.len() <= 500);
        assert!(analysis.foods[0].name.len() <= 100);
        assert!(analysis.foods[0].amount.len() <= 80);
        assert!(analysis.description.ends_with('…'));
    }

    #[test]
    fn rejects_fake_or_oversized_jpeg_before_using_gemini() {
        let mut jpeg = vec![
            0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0, 0xff, 0xda, 0, 8, 1, 1, 0,
            0, 0x3f, 0,
        ];
        jpeg.extend([0; 80]);
        jpeg.extend([0xff, 0xd9]);
        assert!(valid_jpeg_image(&STANDARD.encode(&jpeg)));
        assert!(!valid_jpeg_image(&STANDARD.encode(vec![0; 200])));
        assert!(!valid_jpeg_image(&STANDARD.encode(&jpeg[..jpeg.len() - 2])));
        jpeg[9] = 0x10;
        jpeg[10] = 0x01;
        assert!(!valid_jpeg_image(&STANDARD.encode(&jpeg)));
        assert!(!valid_jpeg_image(&"a".repeat(481_000)));
    }

    #[test]
    fn retries_only_the_first_503() {
        let budget = std::time::Duration::from_secs(10);
        let pause = std::time::Duration::from_secs(1);
        assert!(should_retry_gemini(503, 0, budget, pause));
        assert!(!should_retry_gemini(503, 1, budget, pause));
        assert!(!should_retry_gemini(400, 0, budget, pause));
        assert!(!should_retry_gemini(429, 0, budget, pause));
        assert!(!should_retry_gemini(
            503,
            0,
            std::time::Duration::from_secs(4),
            pause
        ));
    }

    #[test]
    fn uses_pro_only_after_paid_flash_retries_fail() {
        let remaining = std::time::Duration::from_secs(15);
        assert!(should_fallback_to_pro(503, 1, true, remaining));
        assert!(!should_fallback_to_pro(503, 0, true, remaining));
        assert!(!should_fallback_to_pro(503, 1, false, remaining));
        assert!(!should_fallback_to_pro(429, 1, true, remaining));
        assert!(!should_fallback_to_pro(
            503,
            1,
            true,
            std::time::Duration::from_secs(5)
        ));
        assert_eq!(
            AnalysisFailure::GeminiProStatus(503).code(),
            "gemini_pro_status"
        );
        assert_eq!(
            AnalysisFailure::GeminiProStatus(503).upstream_status(),
            Some(503)
        );
    }

    #[test]
    fn requests_a_structured_json_response_for_both_models() {
        assert_eq!(GEMINI_MODEL, "gemini-3.8-flash");
        assert_eq!(GEMINI_FALLBACK_MODEL, "gemini-3.1-pro-preview");
        let body = gemini_request_body("Zm9v");
        assert_eq!(
            body.pointer("/contents/0/parts/1/inline_data/data"),
            Some(&json!("Zm9v"))
        );
        assert_eq!(
            body.pointer("/generationConfig/responseFormat/text/mimeType"),
            Some(&json!("APPLICATION_JSON"))
        );
        assert_eq!(
            body.pointer("/generationConfig/responseFormat/text/schema/properties/foods/maxItems"),
            Some(&json!(30))
        );
        assert!(body.pointer("/generationConfig/temperature").is_none());
    }

    #[test]
    fn still_rejects_an_unusable_suggestion() {
        let empty_foods = r#"{"description":"Almoço","foods":[]}"#;
        assert_eq!(
            parse_analysis(empty_foods).unwrap_err(),
            AnalysisFailure::EmptyFoods
        );
    }

    #[test]
    fn only_unusable_ai_results_spend_the_daily_failure_budget() {
        assert_eq!(FAILED_ANALYSIS_LIMIT, 5);
        for failure in [
            AnalysisFailure::EmptyFoods,
            AnalysisFailure::SafetyBlocked,
            AnalysisFailure::GeminiJsonSyntax,
            AnalysisFailure::MissingText,
        ] {
            assert!(failure.counts_toward_failure_limit());
        }
        for failure in [
            AnalysisFailure::InvalidImage,
            AnalysisFailure::GeminiTimeout,
            AnalysisFailure::GeminiStatus(503),
            AnalysisFailure::GeminiProNetwork,
            AnalysisFailure::GeminiProStatus(503),
        ] {
            assert!(!failure.counts_toward_failure_limit());
        }
    }

    #[test]
    fn reports_the_precise_reason_without_logging_model_content() {
        let cases = [
            (
                r#"{"description":" ","foods":[{"name":"Arroz","amount":"1 prato","caloriesKcal":250}]}"#,
                AnalysisFailure::EmptyDescription,
            ),
            (
                r#"{"description":"Almoço","foods":[{"name":" ","amount":"1 prato","caloriesKcal":250}]}"#,
                AnalysisFailure::EmptyFoodName,
            ),
            (
                r#"{"description":"Almoço","foods":[{"name":"Arroz","amount":" ","caloriesKcal":250}]}"#,
                AnalysisFailure::EmptyFoodAmount,
            ),
            (
                r#"{"description":"Almoço","foods":[{"name":"Arroz","amount":"1 prato","caloriesKcal":5001}]}"#,
                AnalysisFailure::InvalidCalories,
            ),
            (
                r#"{"description":"Almoço","foods":[{"name":"Arroz","amount":"1 prato"}]}"#,
                AnalysisFailure::CaloriesShape,
            ),
            (
                r#"{"description":42,"foods":[]}"#,
                AnalysisFailure::DescriptionShape,
            ),
            (
                r#"{"description":"Almoço","foods":{}}"#,
                AnalysisFailure::FoodsShape,
            ),
            (
                r#"{"description":"Almoço","foods":[{"amount":"1 prato","caloriesKcal":250}]}"#,
                AnalysisFailure::FoodNameShape,
            ),
            (
                r#"{"description":"Almoço","foods":[{"name":"Arroz","caloriesKcal":250}]}"#,
                AnalysisFailure::FoodAmountShape,
            ),
            (
                r#"{"description":"Almoço","foods": [}"#,
                AnalysisFailure::GeminiJsonSyntax,
            ),
        ];
        for (content, expected) in cases {
            let actual = parse_analysis(content).unwrap_err();
            assert_eq!(actual.code(), expected.code());
        }
        let too_many = json!({
            "description":"Almoço",
            "foods": (0..31).map(|_| json!({"name":"Arroz","amount":"1 prato","caloriesKcal":250})).collect::<Vec<_>>()
        });
        assert_eq!(
            parse_analysis(&too_many.to_string()).unwrap_err(),
            AnalysisFailure::TooManyFoods
        );
    }

    #[test]
    fn identifies_model_completion_problems() {
        assert_eq!(
            extract_analysis_text(&json!({"candidates":[]})).unwrap_err(),
            AnalysisFailure::NoCandidate
        );
        assert_eq!(
            extract_analysis_text(&json!({"candidates":[{"finishReason":"SAFETY"}]})).unwrap_err(),
            AnalysisFailure::SafetyBlocked
        );
        assert_eq!(
            extract_analysis_text(&json!({"candidates":[{"finishReason":"MAX_TOKENS"}]}))
                .unwrap_err(),
            AnalysisFailure::MaxTokens
        );
        assert_eq!(
            extract_analysis_text(
                &json!({"candidates":[{"finishReason":"STOP","content":{"parts":[]}}]})
            )
            .unwrap_err(),
            AnalysisFailure::MissingText
        );
        assert_eq!(
            extract_analysis_text(
                &json!({"candidates":[{"content":{"parts":[{}, {"text":"{}"}]}}]})
            )
            .unwrap(),
            "{}"
        );
    }

    #[test]
    fn checkout_reconciliation_requires_matching_confirmed_payment() {
        let valid = json!({"id":"pay_1","checkoutSession":"checkout-1","status":"CONFIRMED","value":8.99,"subscription":"sub_1","customer":"cus_1"});
        assert!(paid_checkout_payment(std::slice::from_ref(&valid), "checkout-1").is_some());
        for invalid in [
            json!({"checkoutSession":"checkout-2","status":"CONFIRMED","value":8.99,"subscription":"sub_1","customer":"cus_1"}),
            json!({"checkoutSession":"checkout-1","status":"PENDING","value":8.99,"subscription":"sub_1","customer":"cus_1"}),
            json!({"checkoutSession":"checkout-1","status":"CONFIRMED","value":99.00,"subscription":"sub_1","customer":"cus_1"}),
            json!({"checkoutSession":"checkout-1","status":"CONFIRMED","value":8.99,"customer":"cus_1"}),
        ] {
            assert!(paid_checkout_payment(&[invalid], "checkout-1").is_none());
        }
    }
    #[test]
    fn google_identity_uses_a_stable_hash() {
        assert!(google_key("subject-1").starts_with("GOOGLE#"));
        assert_ne!(google_key("subject-1"), google_key("subject-2"));
    }
    #[test]
    fn webhook_requires_the_exact_separate_token() {
        let secret = "a".repeat(64);
        assert!(!valid_webhook_token(&secret, None));
        assert!(!valid_webhook_token(&secret, Some("a")));
        assert!(!valid_webhook_token(&secret, Some(&"b".repeat(64))));
        assert!(valid_webhook_token(&secret, Some(&secret)));
    }
    #[test]
    fn checkout_link_uses_the_id_returned_by_asaas() {
        let id = "c7b1c696-b27b-4d3d-80b9-d1c018e387f8";
        assert_eq!(
            checkout_url(id).unwrap(),
            format!("https://asaas.com/checkoutSession/show?id={id}")
        );
        assert!(checkout_url("https://example.com").is_err());
    }
    #[test]
    fn existing_checkout_reuses_the_same_session_and_rejects_paid_accounts() {
        let account = Account {
            key: "test".into(),
            checkout_id: "checkout-1".into(),
            checkout_url: "https://asaas.com/checkoutSession/show?id=checkout-1".into(),
            checkout_expires_at: Utc::now().timestamp() + 3600,
            customer_id: None,
            subscription_id: None,
            paid_through: None,
            next_charge: None,
            revoked: false,
            cancelled: false,
            last_payment_id: None,
        };
        let (url, original) = existing_checkout(account.clone()).unwrap().unwrap();
        assert_eq!(url, account.checkout_url);
        assert_eq!(original.checkout_id, account.checkout_id);
        assert!(existing_checkout(Account {
            paid_through: Some("2099-12-31".into()),
            ..account
        })
        .is_err());
    }
    #[test]
    fn monthly_period_clamps_short_months() {
        assert_eq!(
            add_month(NaiveDate::from_ymd_opt(2026, 1, 31).unwrap()).to_string(),
            "2026-02-28"
        );
        assert_eq!(
            add_month(NaiveDate::from_ymd_opt(2026, 12, 24).unwrap()).to_string(),
            "2027-01-24"
        );
    }
    #[test]
    fn no_access_without_paid_period() {
        let account = Account {
            key: "test".into(),
            checkout_id: "id".into(),
            checkout_url: "url".into(),
            checkout_expires_at: 0,
            customer_id: None,
            subscription_id: None,
            paid_through: None,
            next_charge: None,
            revoked: false,
            cancelled: false,
            last_payment_id: None,
        };
        assert!(!account.active());
        let paid = Account {
            paid_through: Some("2099-12-31".into()),
            cancelled: true,
            ..account
        };
        assert!(paid.active());
    }

    #[test]
    fn paid_checkout_keeps_the_paid_period_even_when_renewal_was_cancelled() {
        let mut account = Account {
            key: "GOOGLE#test".into(),
            checkout_id: "checkout".into(),
            checkout_url: String::new(),
            checkout_expires_at: 0,
            customer_id: None,
            subscription_id: None,
            paid_through: None,
            next_charge: None,
            revoked: false,
            cancelled: true,
            last_payment_id: None,
        };
        apply_paid_checkout(
            &mut account,
            "sub-1",
            "customer-1",
            "2026-10-24",
            "payment-1",
            NaiveDate::from_ymd_opt(2026, 9, 24).unwrap(),
        );
        assert_eq!(account.paid_through.as_deref(), Some("2026-10-24"));
        assert!(account.cancelled);
        assert_eq!(account.next_charge, None);
        assert_eq!(account.subscription_id.as_deref(), Some("sub-1"));
    }

    #[test]
    fn billing_queue_event_excludes_customer_details() {
        let event = json!({
            "id":"evt-1","event":"CHECKOUT_PAID",
            "checkout":{"id":"checkout-1","customerData":{"email":"private@example.com"}}
        });
        let compact = compact_webhook_event(&event);
        assert_eq!(
            compact,
            json!({
                "id":"evt-1","event":"CHECKOUT_PAID",
                "checkout":{"id":"checkout-1","customer":null}
            })
        );
        assert!(!compact.to_string().contains("private@example.com"));
    }

    #[test]
    fn billing_events_for_a_customer_keep_the_same_fifo_group() {
        let checkout = json!({"checkout":{"id":"checkout","customer":"cus-1"}});
        let payment = json!({"payment":{"id":"payment","customer":"cus-1"}});
        assert_eq!(webhook_group(&checkout), webhook_group(&payment));
        assert_ne!(
            webhook_group(&checkout),
            webhook_group(&json!({"payment":{"id":"other","customer":"cus-2"}}))
        );
    }

    #[test]
    fn malformed_authenticated_webhook_can_still_be_queued_for_investigation() {
        let event = json!({"event":"CHECKOUT_PAID","checkout":{"customerData":{"email":"private@example.com"}}});
        let compact = compact_webhook_event(&event);
        assert!(compact["id"].as_str().unwrap().starts_with("invalid-"));
        assert!(compact["checkout"]["id"].is_null());
        assert!(!compact.to_string().contains("private@example.com"));
    }

    #[test]
    fn renewal_only_extends_for_a_new_paid_period() {
        let mut account = Account {
            key: "test".into(),
            checkout_id: "id".into(),
            checkout_url: String::new(),
            checkout_expires_at: 0,
            customer_id: None,
            subscription_id: Some("sub".into()),
            paid_through: None,
            next_charge: None,
            revoked: false,
            cancelled: false,
            last_payment_id: None,
        };
        account.record_payment(
            &json!({"id":"pay1","dueDate":"2026-01-31"}),
            Some("2026-02-28"),
        );
        assert_eq!(account.paid_through.as_deref(), Some("2026-02-28"));
        assert_eq!(account.next_charge.as_deref(), Some("2026-02-28"));
        account.revoked = true;
        account.record_payment(
            &json!({"id":"pay1","dueDate":"2026-01-31"}),
            Some("2026-02-28"),
        );
        assert!(account.revoked);
        account.record_payment(
            &json!({"id":"pay2","dueDate":"2026-02-28"}),
            Some("2026-03-31"),
        );
        assert!(!account.revoked);
        assert_eq!(account.paid_through.as_deref(), Some("2026-03-31"));
    }
}
