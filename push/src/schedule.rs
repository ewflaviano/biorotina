use crate::model::{ReminderKind, StoredSubscription};
use chrono::{DateTime, Datelike, Duration, LocalResult, TimeZone, Utc};
use chrono_tz::Tz;

pub fn due_slot(
    subscription: &StoredSubscription,
    now: DateTime<Utc>,
) -> Option<(String, String, ReminderKind)> {
    if subscription.expires_at <= now.timestamp() {
        return None;
    }
    let zone: Tz = subscription.time_zone.parse().ok()?;
    let local = now.with_timezone(&zone);
    let time = local.format("%H:%M").to_string();
    subscription
        .reminders
        .iter()
        .filter(|reminder| {
            reminder.time == time
                && reminder
                    .days
                    .contains(&(local.weekday().num_days_from_sunday() as u8))
        })
        .map(|reminder| reminder.kind.clone())
        .max_by_key(|kind| matches!(kind, ReminderKind::Medication))
        .map(|kind| (local.format("%Y-%m-%d").to_string(), time, kind))
}

pub fn next_due_utc(
    subscription: &StoredSubscription,
    after: DateTime<Utc>,
) -> Option<DateTime<Utc>> {
    let zone: Tz = subscription.time_zone.parse().ok()?;
    let today = after.with_timezone(&zone).date_naive();
    let mut candidates = Vec::new();
    for day in 0..=2 {
        let date = today + Duration::days(day);
        let weekday = date.weekday().num_days_from_sunday() as u8;
        for reminder in &subscription.reminders {
            if !reminder.days.contains(&weekday) {
                continue;
            }
            let (hour, minute) = reminder.time.split_once(':')?;
            let local = date.and_hms_opt(hour.parse().ok()?, minute.parse().ok()?, 0)?;
            match zone.from_local_datetime(&local) {
                LocalResult::Single(value) => candidates.push(value.with_timezone(&Utc)),
                LocalResult::Ambiguous(first, second) => {
                    candidates.push(first.with_timezone(&Utc));
                    candidates.push(second.with_timezone(&Utc));
                }
                LocalResult::None => {}
            }
        }
    }
    candidates
        .into_iter()
        .filter(|candidate| *candidate > after && candidate.timestamp() < subscription.expires_at)
        .min()
}

pub fn slot_key(at: DateTime<Utc>) -> String {
    at.format("%Y-%m-%dT%H:%M").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{BrowserSubscription, SubscriptionKeys};
    use chrono::TimeZone;

    fn example() -> StoredSubscription {
        StoredSubscription {
            id: "example".into(),
            subscription: BrowserSubscription {
                endpoint: "https://fcm.googleapis.com/fcm/send/example".into(),
                keys: SubscriptionKeys {
                    p256dh: "example".into(),
                    auth: "example".into(),
                },
            },
            reminders: vec![
                crate::model::Reminder {
                    time: "08:00".into(),
                    days: vec![0, 1, 2, 3, 4, 5, 6],
                    kind: crate::model::ReminderKind::Hydration,
                },
                crate::model::Reminder {
                    time: "20:30".into(),
                    days: vec![0, 1, 2, 3, 4, 5, 6],
                    kind: crate::model::ReminderKind::Medication,
                },
            ],
            time_zone: "America/Sao_Paulo".into(),
            expires_at: 2_000_000_000,
        }
    }

    #[test]
    fn follows_local_time_in_sao_paulo() {
        let now = Utc.with_ymd_and_hms(2026, 9, 23, 11, 0, 0).unwrap();
        assert_eq!(
            due_slot(&example(), now),
            Some((
                "2026-09-23".into(),
                "08:00".into(),
                crate::model::ReminderKind::Hydration
            ))
        );
        assert_eq!(
            due_slot(&example(), now + chrono::Duration::minutes(1)),
            None
        );
    }

    #[test]
    fn skips_expired_subscriptions() {
        let mut subscription = example();
        subscription.expires_at = 1;
        assert_eq!(due_slot(&subscription, Utc::now()), None);
    }

    #[test]
    fn indexes_only_the_next_due_time_in_utc() {
        let before = Utc.with_ymd_and_hms(2026, 9, 23, 10, 59, 0).unwrap();
        let morning = next_due_utc(&example(), before).unwrap();
        assert_eq!(slot_key(morning), "2026-09-23T11:00");
        assert_eq!(
            slot_key(next_due_utc(&example(), morning).unwrap()),
            "2026-09-23T23:30"
        );
    }

    #[test]
    fn skips_a_nonexistent_dst_hour() {
        let mut subscription = example();
        subscription.time_zone = "America/New_York".into();
        subscription.reminders = vec![crate::model::Reminder {
            time: "02:30".into(),
            days: vec![0, 1, 2, 3, 4, 5, 6],
            kind: crate::model::ReminderKind::Hydration,
        }];
        let before = Utc.with_ymd_and_hms(2026, 3, 8, 6, 59, 0).unwrap();
        assert_eq!(
            slot_key(next_due_utc(&subscription, before).unwrap()),
            "2026-03-09T06:30"
        );
    }
}
