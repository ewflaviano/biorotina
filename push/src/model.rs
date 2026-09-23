use chrono_tz::Tz;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use url::Url;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct SubscriptionKeys {
    pub p256dh: String,
    pub auth: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct BrowserSubscription {
    pub endpoint: String,
    pub keys: SubscriptionKeys,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReminderRequest {
    pub subscription: BrowserSubscription,
    pub times: Vec<String>,
    pub time_zone: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredSubscription {
    pub id: String,
    pub subscription: BrowserSubscription,
    pub times: Vec<String>,
    pub time_zone: String,
    pub expires_at: i64,
}

pub fn valid_time(time: &str) -> bool {
    let bytes = time.as_bytes();
    bytes.len() == 5
        && bytes[2] == b':'
        && bytes[0].is_ascii_digit()
        && bytes[1].is_ascii_digit()
        && bytes[3].is_ascii_digit()
        && bytes[4].is_ascii_digit()
        && time[..2].parse::<u8>().is_ok_and(|hour| hour < 24)
        && time[3..].parse::<u8>().is_ok_and(|minute| minute < 60)
}

pub fn validate(request: &ReminderRequest) -> Result<(), &'static str> {
    if request.times.len() > 48 || request.times.iter().any(|time| !valid_time(time)) || {
        let mut unique = request.times.clone();
        unique.sort();
        unique.dedup();
        unique.len() != request.times.len()
    } {
        return Err("Horários inválidos.");
    }
    if Tz::from_str(&request.time_zone).is_err() {
        return Err("Fuso horário inválido.");
    }
    if request.subscription.endpoint.len() > 2048
        || request.subscription.keys.p256dh.len() > 512
        || request.subscription.keys.auth.len() > 256
        || request.subscription.keys.p256dh.is_empty()
        || request.subscription.keys.auth.is_empty()
    {
        return Err("Inscrição inválida.");
    }
    let url = Url::parse(&request.subscription.endpoint).map_err(|_| "Inscrição inválida.")?;
    if url.scheme() != "https"
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || !url.host_str().is_some_and(allowed_push_host)
    {
        return Err("Serviço de notificações não reconhecido.");
    }
    Ok(())
}

fn allowed_push_host(host: &str) -> bool {
    host == "fcm.googleapis.com"
        || host == "android.googleapis.com"
        || host == "updates.push.services.mozilla.com"
        || host.ends_with(".push.apple.com")
        || host.ends_with(".notify.windows.com")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request() -> ReminderRequest {
        ReminderRequest {
            subscription: BrowserSubscription {
                endpoint: "https://fcm.googleapis.com/fcm/send/example".into(),
                keys: SubscriptionKeys {
                    p256dh: "example".into(),
                    auth: "example".into(),
                },
            },
            times: vec!["08:00".into(), "20:30".into()],
            time_zone: "America/Sao_Paulo".into(),
        }
    }

    #[test]
    fn accepts_24_hour_times_and_known_push_hosts() {
        assert!(validate(&request()).is_ok());
        assert!(valid_time("00:00"));
        assert!(valid_time("23:59"));
        assert!(!valid_time("24:00"));
        assert!(!valid_time("09:60"));
    }

    #[test]
    fn rejects_private_or_arbitrary_push_endpoints() {
        let mut value = request();
        value.subscription.endpoint = "https://127.0.0.1/secret".into();
        assert!(validate(&value).is_err());
        value.subscription.endpoint = "http://fcm.googleapis.com/abc".into();
        assert!(validate(&value).is_err());
    }

    #[test]
    fn rejects_duplicate_times_and_unknown_timezones() {
        let mut value = request();
        value.times.push("08:00".into());
        assert!(validate(&value).is_err());
        value.times.pop();
        value.time_zone = "Mars/Olympus".into();
        assert!(validate(&value).is_err());
    }
}
