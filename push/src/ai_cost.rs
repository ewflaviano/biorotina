//! Provider usage accounting, independent of the user's refundable quota.
//! No prompts, photos, generated food names, API keys or email addresses.
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub input_tokens: u64,
    pub cached_input_tokens: u64,
    pub output_tokens: u64,
    pub thinking_tokens: u64,
    pub total_tokens: Option<u64>,
}
impl Usage {
    pub fn from_response(response: &Value) -> Option<Self> {
        let u = response.get("usageMetadata")?;
        let input = u.get("promptTokenCount")?.as_u64()?;
        let cached = u
            .get("cachedContentTokenCount")
            .map_or(Some(0), Value::as_u64)?;
        if cached > input {
            return None;
        }
        Some(Self {
            input_tokens: input,
            cached_input_tokens: cached,
            // Missing candidate count is valid for a blocked response, but a
            // missing field on a normal generation must not become zero cost.
            output_tokens: u.get("candidatesTokenCount").map_or_else(
                || {
                    if response
                        .get("promptFeedback")
                        .and_then(|p| p.get("blockReason"))
                        .is_some()
                    {
                        Some(0)
                    } else {
                        None
                    }
                },
                Value::as_u64,
            )?,
            thinking_tokens: u.get("thoughtsTokenCount").map_or(Some(0), Value::as_u64)?,
            total_tokens: u.get("totalTokenCount").and_then(Value::as_u64),
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pricing {
    pub version: String,
    pub input_nano_usd_per_token: u64,
    pub cached_input_nano_usd_per_token: u64,
    pub output_nano_usd_per_token: u64,
}
impl Pricing {
    // Standard Gemini Developer API paid tier; USD list estimate, not invoice.
    // Source: https://ai.google.dev/gemini-api/docs/pricing (2026-10-31).
    pub fn for_model(model: &str, now: DateTime<Utc>, input: u64) -> Option<Self> {
        let (version, rates) = match model {
            "gemini-3.8-flash" if now < "2027-01-01T00:00:00Z".parse::<DateTime<Utc>>().ok()? => {
                ("google-standard-2026-10-31-flash-intro", (750, 75, 3750))
            }
            "gemini-3.8-flash" => ("google-standard-2026-10-31-flash-2027", (1500, 150, 7500)),
            "gemini-3.1-pro-preview" if input <= 200_000 => {
                ("google-standard-2026-10-31-pro-short", (2000, 200, 12000))
            }
            "gemini-3.1-pro-preview" => ("google-standard-2026-10-31-pro-long", (4000, 400, 18000)),
            _ => return None,
        };
        Some(Self {
            version: version.into(),
            input_nano_usd_per_token: rates.0,
            cached_input_nano_usd_per_token: rates.1,
            output_nano_usd_per_token: rates.2,
        })
    }
    pub fn estimate(&self, usage: &Usage) -> Option<u64> {
        usage
            .input_tokens
            .checked_sub(usage.cached_input_tokens)?
            .checked_mul(self.input_nano_usd_per_token)?
            .checked_add(
                usage
                    .cached_input_tokens
                    .checked_mul(self.cached_input_nano_usd_per_token)?,
            )?
            .checked_add(
                usage
                    .output_tokens
                    .checked_add(usage.thinking_tokens)?
                    .checked_mul(self.output_nano_usd_per_token)?,
            )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCall {
    pub schema_version: u32,
    pub request_id: String,
    pub call_id: String,
    pub account_key: String,
    pub occurred_at: DateTime<Utc>,
    pub model: String,
    pub allocation: String,
    pub input_type: String,
    pub attempt: u32,
    pub outcome: String,
    pub http_status: Option<u16>,
    pub duration_ms: Option<u64>,
    pub usage: Option<Usage>,
    pub pricing: Option<Pricing>,
    pub estimated_cost_nano_usd: Option<u64>,
}
impl AiCall {
    pub fn key(&self) -> String {
        format!(
            "AI_CALL#{}#{}",
            self.occurred_at.format("%Y-%m"),
            self.call_id
        )
    }
    pub fn complete(
        &mut self,
        response: Option<&Value>,
        outcome: &str,
        status: Option<u16>,
        duration_ms: u64,
    ) {
        self.outcome = outcome.into();
        self.http_status = status;
        self.duration_ms = Some(duration_ms);
        self.usage = response.and_then(Usage::from_response);
        self.pricing = self
            .usage
            .as_ref()
            .and_then(|u| Pricing::for_model(&self.model, self.occurred_at, u.input_tokens));
        self.estimated_cost_nano_usd = self
            .usage
            .as_ref()
            .zip(self.pricing.as_ref())
            .and_then(|(u, p)| p.estimate(u));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn includes_thinking_and_discounts_cached_input_without_double_counting() {
        let u = Usage::from_response(&json!({"usageMetadata":{"promptTokenCount":1000,"cachedContentTokenCount":200,"candidatesTokenCount":100,"thoughtsTokenCount":50,"totalTokenCount":1150}})).unwrap();
        let p = Pricing::for_model(
            "gemini-3.8-flash",
            "2026-11-01T00:00:00Z".parse().unwrap(),
            1000,
        )
        .unwrap();
        assert_eq!(p.estimate(&u), Some(1_177_500));
    }
    #[test]
    fn missing_usage_or_incomplete_generation_is_unknown_not_zero() {
        assert!(Usage::from_response(&json!({})).is_none());
        assert!(Usage::from_response(&json!({"usageMetadata":{"promptTokenCount":100}})).is_none());
        assert!(Usage::from_response(&json!({"usageMetadata":{"promptTokenCount":1,"cachedContentTokenCount":2,"candidatesTokenCount":1}})).is_none());
    }
    #[test]
    fn pricing_handles_pro_context_threshold_and_flash_promotion_end() {
        let now = "2026-11-01T00:00:00Z".parse().unwrap();
        assert_eq!(
            Pricing::for_model("gemini-3.1-pro-preview", now, 200_000)
                .unwrap()
                .output_nano_usd_per_token,
            12000
        );
        assert_eq!(
            Pricing::for_model("gemini-3.1-pro-preview", now, 200_001)
                .unwrap()
                .output_nano_usd_per_token,
            18000
        );
        assert_eq!(
            Pricing::for_model(
                "gemini-3.8-flash",
                "2027-01-01T00:00:00Z".parse().unwrap(),
                1
            )
            .unwrap()
            .input_nano_usd_per_token,
            1500
        );
        assert!(Pricing::for_model("unknown", now, 1).is_none());
    }
}
