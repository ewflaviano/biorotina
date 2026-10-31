//! November campaign policy. Enrollment snapshots the offer so later changes do
//! not shorten an already granted trial. Legacy lifetime usage stays untouched.
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

pub const CAMPAIGN_ID: &str = "november-2026";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Campaign {
    pub starts_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
    pub days: u32,
    pub daily_limit: u32,
}
impl Default for Campaign {
    fn default() -> Self {
        Self {
            starts_at: "2026-11-01T03:00:00Z".parse().unwrap(),
            ends_at: "2026-12-01T03:00:00Z".parse().unwrap(),
            days: 14,
            daily_limit: 5,
        }
    }
}
impl Campaign {
    pub fn valid(&self) -> bool {
        self.starts_at < self.ends_at
            && (1..=90).contains(&self.days)
            && (1..=10).contains(&self.daily_limit)
    }
    pub fn open(&self, now: DateTime<Utc>) -> bool {
        now >= self.starts_at && now < self.ends_at
    }
    pub fn enroll(&self, now: DateTime<Utc>) -> Enrollment {
        Enrollment {
            started_at: now,
            ends_at: now + chrono::Duration::days(i64::from(self.days)),
            days: self.days,
            daily_limit: self.daily_limit,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Enrollment {
    pub started_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
    pub days: u32,
    pub daily_limit: u32,
}
impl Enrollment {
    pub fn active(&self, now: DateTime<Utc>) -> bool {
        now >= self.started_at && now < self.ends_at
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn at(s: &str) -> DateTime<Utc> {
        s.parse().unwrap()
    }
    #[test]
    fn enrollment_window_uses_sao_paulo_midnight_and_exclusive_end() {
        let c = Campaign::default();
        assert!(!c.open(at("2026-11-01T02:59:59Z")));
        assert!(c.open(at("2026-11-01T03:00:00Z")));
        assert!(c.open(at("2026-12-01T02:59:59Z")));
        assert!(!c.open(at("2026-12-01T03:00:00Z")));
    }
    #[test]
    fn late_enrollment_gets_full_fourteen_days_and_does_not_restart() {
        let c = Campaign::default();
        let e = c.enroll(at("2026-12-01T02:59:59Z"));
        assert_eq!(e.ends_at, at("2026-12-15T02:59:59Z"));
        assert!(e.active(at("2026-12-15T02:59:58Z")));
        assert!(!e.active(e.ends_at));
        assert_eq!(e.daily_limit, 5);
    }
    #[test]
    fn policy_changes_do_not_change_existing_enrollment() {
        let mut c = Campaign::default();
        let e = c.enroll(at("2026-11-03T15:00:00Z"));
        c.days = 1;
        c.daily_limit = 1;
        let next = c.enroll(at("2026-11-04T15:00:00Z"));
        assert_eq!(next.days, 1);
        assert_eq!(next.daily_limit, 1);
        assert_eq!(e.days, 14);
        assert_eq!(e.daily_limit, 5);
        assert_eq!(e.ends_at, at("2026-11-17T15:00:00Z"));
    }
    #[test]
    fn rejects_invalid_policy() {
        let mut c = Campaign::default();
        assert!(c.valid());
        c.days = 0;
        assert!(!c.valid());
        c.days = 14;
        c.daily_limit = 11;
        assert!(!c.valid());
        c.daily_limit = 5;
        c.ends_at = c.starts_at;
        assert!(!c.valid());
    }
}
