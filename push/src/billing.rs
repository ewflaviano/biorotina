use aws_config::BehaviorVersion;
use aws_sdk_dynamodb::{types::AttributeValue as A, Client as Db};
use aws_sdk_secretsmanager::Client as Secrets;
use chrono::{Datelike, Duration, NaiveDate, Utc};
use chrono_tz::America::Sao_Paulo;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use subtle::ConstantTimeEq;

const GEMINI_MODEL: &str = "gemini-3.8-flash";
const ASAAS_USER_AGENT: &str = "Biorotina/0.1 (+https://biorotina.app.br)";
const PROMPT: &str = "Analise apenas os alimentos e bebidas visíveis nesta foto de refeição. Responda em português do Brasil com JSON. Para cada alimento visível, dê um nome simples, uma porção aproximada (gramas ou medida caseira) e as calorias aproximadas dessa porção. Não invente ingredientes invisíveis. Se a foto não permitir identificar uma refeição, retorne foods vazio. Não faça recomendações médicas ou nutricionais. A pessoa vai revisar tudo.";

#[derive(Clone)]
pub struct Billing {
    pub db: Db,
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

fn str_field(value: &Value, name: &str) -> Option<String> {
    value
        .get(name)?
        .as_str()
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
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

    pub async fn checkout(&self, key: String) -> Result<(String, Account), String> {
        if let Some(existing) = self.account(&key).await? {
            if existing.active() {
                return Err("Já existe um plano ativo para esta conta Google".into());
            }
            if existing.subscription_id.is_some() && !existing.cancelled {
                return Err("Existe uma assinatura em andamento no Asaas. Cancele a renovação antes de assinar novamente.".into());
            }
            if !existing.checkout_url.is_empty()
                && existing.checkout_expires_at > Utc::now().timestamp()
                && existing.paid_through.is_none()
            {
                return Ok((existing.checkout_url.clone(), existing));
            }
        }
        let expires = Utc::now().timestamp() + 3600;
        let reference = uuid::Uuid::new_v4().to_string();
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
        let mut safe_to_release = false;
        let outcome = async {
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
            self.save_account(&account).await?;
            self.put(&format!("CHECKOUT#{checkout_id}"), &json!({"key":key}))
                .await?;
            safe_to_release = true;
            Ok((checkout_url, account))
        }
        .await;
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
                eprintln!("billing checkout lock release failed: {error}");
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
    ) -> Result<(String, String, String, String, NaiveDate), String> {
        let payments = self
            .asaas_get(&format!(
                "/v3/payments?checkoutSession={checkout_id}&limit=10"
            ))
            .await?;
        let payment = payments
            .get("data")
            .and_then(Value::as_array)
            .and_then(|items| {
                items
                    .iter()
                    .find(|p| str_field(p, "subscription").is_some())
            })
            .ok_or("Cobrança ainda não disponível")?;
        let sub_id = str_field(payment, "subscription").ok_or("Assinatura ausente")?;
        let customer = str_field(payment, "customer").ok_or("Cliente ausente")?;
        let sub = self
            .asaas_get(&format!("/v3/subscriptions/{sub_id}"))
            .await?;
        let next_charge = str_field(&sub, "nextDueDate").ok_or("Próxima cobrança ausente")?;
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
        let sub_id = match &account.subscription_id {
            Some(id) => id.clone(),
            None => self.reconcile_checkout(&account.checkout_id).await?.0,
        };
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
        let mut updated = account.clone();
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
        let _ = self
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
            .await;
    }

    pub async fn analyze(&self, image: &str) -> Result<Analysis, String> {
        if image.len() > 480_000
            || image.len() < 100
            || !image
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'+' || b == b'/' || b == b'=')
        {
            return Err("Imagem inválida ou grande demais".into());
        }
        let body = json!({"contents":[{"parts":[{"text":PROMPT},{"inline_data":{"mime_type":"image/jpeg","data":image}}]}],"generationConfig":{"temperature":0.2,"maxOutputTokens":2048,"thinkingConfig":{"thinkingLevel":"LOW"},"responseFormat":{"text":{"mimeType":"APPLICATION_JSON","schema":{"type":"object","properties":{"description":{"type":"string"},"foods":{"type":"array","items":{"type":"object","properties":{"name":{"type":"string"},"amount":{"type":"string"},"caloriesKcal":{"type":"number"}},"required":["name","amount","caloriesKcal"]}}},"required":["description","foods"]}}}}});
        let response = self.client.post(format!("https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent")).header("x-goog-api-key", self.gemini_key.as_str()).json(&body).send().await.map_err(|_| "Gemini indisponível".to_owned())?;
        if !response.status().is_success() {
            return Err(format!("Gemini indisponível ({})", response.status()));
        }
        let result: Value = response
            .json()
            .await
            .map_err(|_| "Resposta inválida do Gemini".to_owned())?;
        let text = result
            .pointer("/candidates/0/content/parts/0/text")
            .and_then(Value::as_str)
            .ok_or("Gemini não identificou alimentos")?;
        let analysis: Analysis =
            serde_json::from_str(text).map_err(|_| "Sugestão incompleta".to_owned())?;
        if analysis.description.trim().is_empty()
            || analysis.description.len() > 120
            || analysis.foods.is_empty()
            || analysis.foods.len() > 30
            || analysis.foods.iter().any(|f| {
                f.name.trim().is_empty()
                    || f.name.len() > 100
                    || f.amount.trim().is_empty()
                    || f.amount.len() > 80
                    || !f.calories_kcal.is_finite()
                    || f.calories_kcal < 0.0
                    || f.calories_kcal > 5000.0
            })
        {
            return Err("Sugestão inválida".into());
        }
        Ok(analysis)
    }

    pub fn valid_webhook(&self, provided: Option<&str>) -> bool {
        valid_webhook_token(&self.webhook_token, provided)
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
                if account.subscription_id.is_some() {
                    return Ok(());
                }
                let (sub_id, customer, next_charge, payment_id, due_date) =
                    self.reconcile_checkout(&id).await?;
                let estimated_through = add_month(due_date).format("%Y-%m-%d").to_string();
                let through = if next_charge > estimated_through {
                    next_charge.clone()
                } else {
                    estimated_through
                };
                let is_new_period = account
                    .paid_through
                    .as_deref()
                    .is_none_or(|old| old < through.as_str());
                if is_new_period {
                    account.paid_through = Some(through.clone());
                    account.revoked = false;
                }
                account.next_charge = Some(if next_charge < through {
                    through.clone()
                } else {
                    next_charge
                });
                account.customer_id = Some(customer.clone());
                account.subscription_id = Some(sub_id.clone());
                account.last_payment_id = Some(payment_id);
                account.cancelled = false;
                self.put(&format!("CUSTOMER#{customer}"), &json!({"key":key}))
                    .await?;
                self.put(&format!("SUB#{sub_id}"), &json!({"key":key}))
                    .await?;
                self.save_account(&account).await?;
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
            account.next_charge =
                str_field(sub, "nextDueDate").map(|date| match &account.paid_through {
                    Some(through) if through > &date => through.clone(),
                    _ => date,
                });
            if kind == "SUBSCRIPTION_INACTIVATED" || kind == "SUBSCRIPTION_DELETED" {
                account.cancelled = true;
                account.next_charge = None;
            } else if (kind == "SUBSCRIPTION_CREATED" || kind == "SUBSCRIPTION_UPDATED")
                && str_field(sub, "status").as_deref() == Some("ACTIVE")
            {
                account.cancelled = false;
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
