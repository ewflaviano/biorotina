use crate::model::{ReminderKind, StoredSubscription};
use aws_sdk_secretsmanager::Client as SecretsClient;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::NaiveDate;
use sha2::{Digest, Sha256};
use std::{net::IpAddr, time::Duration};
use web_push::{
    request_builder, ContentEncoding, PartialVapidSignatureBuilder, SubscriptionInfo,
    VapidSignatureBuilder, WebPushError, WebPushMessageBuilder,
};

#[derive(Clone)]
pub struct PushSender {
    client: reqwest::Client,
    vapid: PartialVapidSignatureBuilder,
    pub public_key: String,
    subject: String,
    rate_secret: [u8; 32],
}

#[derive(Debug)]
pub struct SenderInitError;

impl std::fmt::Display for SenderInitError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("Falha ao inicializar envio de notificações")
    }
}

impl std::error::Error for SenderInitError {}

impl PushSender {
    pub async fn from_secret(
        client: &SecretsClient,
        secret_arn: &str,
    ) -> Result<Self, SenderInitError> {
        let response = client
            .get_secret_value()
            .secret_id(secret_arn)
            .send()
            .await
            .map_err(|_| SenderInitError)?;
        let seed = response.secret_string().ok_or(SenderInitError)?;
        let rate_secret =
            Sha256::digest([b"push-rate-v1:".as_slice(), seed.as_bytes()].concat()).into();
        let mut material = seed.as_bytes().to_vec();
        let vapid = loop {
            let key = URL_SAFE_NO_PAD.encode(Sha256::digest(&material));
            if let Ok(builder) = VapidSignatureBuilder::from_base64_no_sub(&key) {
                break builder;
            }
            material.push(0);
        };
        let public_key = URL_SAFE_NO_PAD.encode(vapid.get_public_key());
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .build()
            .map_err(|_| SenderInitError)?;
        Ok(Self {
            client,
            vapid,
            public_key,
            subject: std::env::var("PUBLIC_APP_URL").map_err(|_| SenderInitError)?,
            rate_secret,
        })
    }

    pub fn create_limit_key(&self, source_ip: IpAddr, day: NaiveDate) -> String {
        create_limit_key(&self.rate_secret, source_ip, day)
    }

    pub async fn send(
        &self,
        subscription: &StoredSubscription,
        kind: ReminderKind,
    ) -> Result<(), WebPushError> {
        let info = SubscriptionInfo::new(
            &subscription.subscription.endpoint,
            &subscription.subscription.keys.p256dh,
            &subscription.subscription.keys.auth,
        );
        let mut signature = self.vapid.clone().add_sub_info(&info);
        signature.add_claim("sub", self.subject.clone());
        let signature = signature.build()?;
        let mut builder = WebPushMessageBuilder::new(&info);
        let payload = match kind {
            ReminderKind::Hydration => b"{\"kind\":\"hydration\"}".as_slice(),
            ReminderKind::Medication => b"{\"kind\":\"medication\"}".as_slice(),
            ReminderKind::Habit => b"{\"kind\":\"habit\"}".as_slice(),
        };
        builder.set_payload(ContentEncoding::Aes128Gcm, payload);
        builder.set_vapid_signature(signature);
        let push_request = request_builder::build_request::<Vec<u8>>(builder.build()?);
        let mut request = self.client.post(push_request.uri().to_string());
        for (name, value) in push_request.headers() {
            request = request.header(
                name.as_str(),
                value.to_str().map_err(|_| WebPushError::InvalidResponse)?,
            );
        }
        let response = request
            .body(push_request.body().clone())
            .send()
            .await
            .map_err(|_| WebPushError::Unspecified)?;
        let status = http::StatusCode::from_u16(response.status().as_u16())
            .map_err(|_| WebPushError::InvalidResponse)?;
        let body = response
            .bytes()
            .await
            .map_err(|_| WebPushError::InvalidResponse)?;
        if body.len() > 65_536 {
            return Err(WebPushError::ResponseTooLarge);
        }
        request_builder::parse_response(status, body.to_vec())
    }
}

fn create_limit_key(secret: &[u8; 32], source_ip: IpAddr, day: NaiveDate) -> String {
    let mut hash = Sha256::new();
    hash.update(secret);
    hash.update(day.format("%Y-%m-%d").to_string());
    hash.update(source_ip.to_string());
    format!("{:x}", hash.finalize())
}

pub fn is_expired_endpoint(error: &WebPushError) -> bool {
    matches!(
        error,
        WebPushError::EndpointNotFound(_) | WebPushError::EndpointNotValid(_)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_create_limit_key_does_not_store_the_ip_and_rotates_each_day() {
        let secret = [7; 32];
        let ip: IpAddr = "203.0.113.10".parse().unwrap();
        let day = NaiveDate::from_ymd_opt(2026, 9, 24).unwrap();
        let key = create_limit_key(&secret, ip, day);
        assert_eq!(key, create_limit_key(&secret, ip, day));
        assert!(!key.contains("203.0.113.10"));
        assert_ne!(
            key,
            create_limit_key(&secret, ip, NaiveDate::from_ymd_opt(2026, 9, 25).unwrap())
        );
    }
}
