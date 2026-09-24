use crate::model::{ReminderKind, StoredSubscription};
use aws_sdk_secretsmanager::Client as SecretsClient;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use sha2::{Digest, Sha256};
use std::time::Duration;
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
        })
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

pub fn is_expired_endpoint(error: &WebPushError) -> bool {
    matches!(
        error,
        WebPushError::EndpointNotFound(_) | WebPushError::EndpointNotValid(_)
    )
}
