use crate::model::{ReminderRequest, StoredSubscription};
use crate::schedule::{next_due_utc, slot_key};
use aws_sdk_dynamodb::types::AttributeValue;
use aws_sdk_dynamodb::Client;
use chrono::{DateTime, NaiveDateTime, Utc};
use serde_json::from_str;
use sha2::{Digest, Sha256};
use subtle::ConstantTimeEq;
use uuid::Uuid;

#[derive(Clone)]
pub struct Store {
    client: Client,
    table: String,
}

#[derive(Debug)]
pub struct StoreError;

impl std::fmt::Display for StoreError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Falha ao acessar os lembretes")
    }
}

impl std::error::Error for StoreError {}

pub struct DueSubscription {
    pub subscription: StoredSubscription,
    pub at: DateTime<Utc>,
    pub slot: String,
}

pub const PUBLIC_CREATE_LIMIT_PER_DAY: u32 = 30;
pub const PUBLIC_FEEDBACK_LIMIT_PER_DAY: u32 = 5;
const GLOBAL_FEEDBACK_LIMIT_PER_DAY: u32 = 100;

fn due_shard(id: &str) -> String {
    let digest = Sha256::digest(id.as_bytes());
    format!("DUE#{:02}", digest[0] % 16)
}

impl Store {
    pub fn new(client: Client, table: String) -> Self {
        Self { client, table }
    }

    pub async fn reserve_public_create(&self, anonymous_key: &str) -> Result<bool, StoreError> {
        self.reserve_counter(
            "RATE#PUSH_CREATE",
            anonymous_key,
            PUBLIC_CREATE_LIMIT_PER_DAY,
        )
        .await
    }

    pub async fn reserve_public_feedback(
        &self,
        anonymous_key: &str,
        day: &str,
    ) -> Result<bool, StoreError> {
        if !self
            .reserve_counter(
                "RATE#FEEDBACK",
                anonymous_key,
                PUBLIC_FEEDBACK_LIMIT_PER_DAY,
            )
            .await?
        {
            return Ok(false);
        }
        self.reserve_counter("RATE#FEEDBACK_GLOBAL", day, GLOBAL_FEEDBACK_LIMIT_PER_DAY)
            .await
    }

    async fn reserve_counter(
        &self,
        category: &str,
        key: &str,
        limit: u32,
    ) -> Result<bool, StoreError> {
        let result = self
            .client
            .update_item()
            .table_name(&self.table)
            .key("pk", AttributeValue::S(category.into()))
            .key("sk", AttributeValue::S(key.into()))
            .update_expression("SET #count = if_not_exists(#count, :zero) + :one, #ttl = :ttl")
            .condition_expression("attribute_not_exists(#count) OR #count < :limit")
            .expression_attribute_names("#count", "count")
            .expression_attribute_names("#ttl", "ttl")
            .expression_attribute_values(":zero", AttributeValue::N("0".into()))
            .expression_attribute_values(":one", AttributeValue::N("1".into()))
            .expression_attribute_values(":limit", AttributeValue::N(limit.to_string()))
            .expression_attribute_values(
                ":ttl",
                AttributeValue::N((Utc::now().timestamp() + 3 * 86400).to_string()),
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
            Err(_) => Err(StoreError),
        }
    }

    pub async fn create(&self, request: ReminderRequest) -> Result<(String, String), StoreError> {
        let id = Uuid::new_v4().to_string();
        let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        let subscription = StoredSubscription {
            id: id.clone(),
            subscription: request.subscription,
            reminders: request.reminders,
            time_zone: request.time_zone,
            expires_at: Utc::now().timestamp() + 180 * 24 * 60 * 60,
        };
        self.put(&subscription, &token_hash(&token), true).await?;
        Ok((id, token))
    }

    async fn put(
        &self,
        subscription: &StoredSubscription,
        hash: &str,
        only_new: bool,
    ) -> Result<(), StoreError> {
        let payload = serde_json::to_string(subscription).map_err(|_| StoreError)?;
        let mut request = self
            .client
            .put_item()
            .table_name(&self.table)
            .item("pk", AttributeValue::S("SUB".into()))
            .item("sk", AttributeValue::S(subscription.id.clone()))
            .item("data", AttributeValue::S(payload))
            .item("tokenHash", AttributeValue::S(hash.into()))
            .item(
                "ttl",
                AttributeValue::N(subscription.expires_at.to_string()),
            );
        if let Some(next) = next_due_utc(subscription, Utc::now()) {
            request = request
                .item("nextSlot", AttributeValue::S(slot_key(next)))
                .item("dueShard", AttributeValue::S(due_shard(&subscription.id)));
        }
        if only_new {
            request = request.condition_expression("attribute_not_exists(pk)");
        } else {
            request = request
                .condition_expression("tokenHash = :hash")
                .expression_attribute_values(":hash", AttributeValue::S(hash.into()));
        }
        request.send().await.map_err(|_| StoreError)?;
        Ok(())
    }

    async fn get(&self, id: &str) -> Result<Option<(StoredSubscription, String)>, StoreError> {
        let output = self
            .client
            .get_item()
            .table_name(&self.table)
            .key("pk", AttributeValue::S("SUB".into()))
            .key("sk", AttributeValue::S(id.into()))
            .send()
            .await
            .map_err(|_| StoreError)?;
        let Some(item) = output.item else {
            return Ok(None);
        };
        let data = item
            .get("data")
            .and_then(|value| value.as_s().ok())
            .ok_or(StoreError)?;
        let hash = item
            .get("tokenHash")
            .and_then(|value| value.as_s().ok())
            .ok_or(StoreError)?;
        let subscription: StoredSubscription = from_str(data).map_err(|_| StoreError)?;
        Ok(Some((subscription, hash.clone())))
    }

    pub async fn authorized(
        &self,
        id: &str,
        token: &str,
    ) -> Result<Option<StoredSubscription>, StoreError> {
        let Some((subscription, hash)) = self.get(id).await? else {
            return Ok(None);
        };
        let candidate = token_hash(token);
        if candidate.as_bytes().ct_eq(hash.as_bytes()).into() {
            Ok(Some(subscription))
        } else {
            Ok(None)
        }
    }

    pub async fn update(
        &self,
        subscription: &StoredSubscription,
        token: &str,
    ) -> Result<(), StoreError> {
        let mut updated = subscription.clone();
        updated.expires_at = Utc::now().timestamp() + 180 * 24 * 60 * 60;
        self.put(&updated, &token_hash(token), false).await
    }

    pub async fn delete(&self, id: &str) -> Result<(), StoreError> {
        self.client
            .delete_item()
            .table_name(&self.table)
            .key("pk", AttributeValue::S("SUB".into()))
            .key("sk", AttributeValue::S(id.into()))
            .send()
            .await
            .map_err(|_| StoreError)?;
        Ok(())
    }

    pub async fn due_up_to(&self, now: DateTime<Utc>) -> Result<Vec<DueSubscription>, StoreError> {
        let mut output = Vec::new();
        for shard in 0..16 {
            let mut next_key = None;
            loop {
                let mut request = self
                    .client
                    .query()
                    .table_name(&self.table)
                    .index_name("DueIndex")
                    .key_condition_expression("dueShard = :shard AND nextSlot <= :now")
                    .expression_attribute_values(
                        ":shard",
                        AttributeValue::S(format!("DUE#{shard:02}")),
                    )
                    .expression_attribute_values(":now", AttributeValue::S(slot_key(now)));
                if let Some(key) = next_key {
                    request = request.set_exclusive_start_key(Some(key));
                }
                let page = request.send().await.map_err(|_| StoreError)?;
                for item in page.items() {
                    let Some(slot) = item.get("nextSlot").and_then(|value| value.as_s().ok())
                    else {
                        continue;
                    };
                    let Some(data) = item.get("data").and_then(|value| value.as_s().ok()) else {
                        continue;
                    };
                    if let (Ok(subscription), Ok(at)) = (
                        from_str(data),
                        NaiveDateTime::parse_from_str(slot, "%Y-%m-%dT%H:%M"),
                    ) {
                        output.push(DueSubscription {
                            subscription,
                            at: at.and_utc(),
                            slot: slot.clone(),
                        });
                    }
                }
                next_key = page.last_evaluated_key().cloned();
                if next_key.is_none() {
                    break;
                }
            }
        }
        Ok(output)
    }

    pub async fn current_due(
        &self,
        id: &str,
        slot: &str,
    ) -> Result<Option<StoredSubscription>, StoreError> {
        let output = self
            .client
            .get_item()
            .table_name(&self.table)
            .key("pk", AttributeValue::S("SUB".into()))
            .key("sk", AttributeValue::S(id.into()))
            .consistent_read(true)
            .send()
            .await
            .map_err(|_| StoreError)?;
        let Some(item) = output.item else {
            return Ok(None);
        };
        if item
            .get("nextSlot")
            .and_then(|value| value.as_s().ok())
            .map(String::as_str)
            != Some(slot)
        {
            return Ok(None);
        }
        let data = item
            .get("data")
            .and_then(|value| value.as_s().ok())
            .ok_or(StoreError)?;
        Ok(Some(from_str(data).map_err(|_| StoreError)?))
    }

    pub async fn advance(
        &self,
        subscription: &StoredSubscription,
        old_slot: &str,
        after: chrono::DateTime<Utc>,
    ) -> Result<(), StoreError> {
        let next = next_due_utc(subscription, after);
        let mut request = self
            .client
            .update_item()
            .table_name(&self.table)
            .key("pk", AttributeValue::S("SUB".into()))
            .key("sk", AttributeValue::S(subscription.id.clone()))
            .condition_expression("nextSlot = :old")
            .expression_attribute_values(":old", AttributeValue::S(old_slot.into()));
        request = if let Some(next) = next {
            request
                .update_expression("SET nextSlot = :next")
                .expression_attribute_values(":next", AttributeValue::S(slot_key(next)))
        } else {
            request.update_expression("REMOVE nextSlot, dueShard")
        };
        match request.send().await {
            Ok(_) => Ok(()),
            Err(error)
                if error
                    .as_service_error()
                    .is_some_and(|value| value.is_conditional_check_failed_exception()) =>
            {
                Ok(())
            }
            Err(_) => Err(StoreError),
        }
    }

    pub async fn claim(&self, id: &str, slot: &str, ttl: i64) -> Result<bool, StoreError> {
        let result = self
            .client
            .put_item()
            .table_name(&self.table)
            .item("pk", AttributeValue::S(format!("SENT#{id}")))
            .item("sk", AttributeValue::S(slot.into()))
            .item("ttl", AttributeValue::N(ttl.to_string()))
            .condition_expression("attribute_not_exists(pk)")
            .send()
            .await;
        match result {
            Ok(_) => Ok(true),
            Err(error)
                if error
                    .as_service_error()
                    .is_some_and(|value| value.is_conditional_check_failed_exception()) =>
            {
                Ok(false)
            }
            Err(_) => Err(StoreError),
        }
    }

    pub async fn release(&self, id: &str, slot: &str) -> Result<(), StoreError> {
        self.client
            .delete_item()
            .table_name(&self.table)
            .key("pk", AttributeValue::S(format!("SENT#{id}")))
            .key("sk", AttributeValue::S(slot.into()))
            .send()
            .await
            .map_err(|_| StoreError)?;
        Ok(())
    }
}

fn token_hash(token: &str) -> String {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
    URL_SAFE_NO_PAD.encode(Sha256::digest(token.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn hashes_tokens_without_storing_them() {
        assert_eq!(token_hash("abc"), token_hash("abc"));
        assert_ne!(token_hash("abc"), token_hash("abd"));
        assert!(!token_hash("abc").contains("abc"));
    }

    #[test]
    fn assigns_a_stable_due_index_partition() {
        let shard = due_shard("device-id");
        assert_eq!(shard, due_shard("device-id"));
        assert!(shard.starts_with("DUE#"));
        let number: u8 = shard[4..].parse().unwrap();
        assert!(number < 16);
    }
}
