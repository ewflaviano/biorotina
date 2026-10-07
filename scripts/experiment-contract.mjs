export const experimentKeys = [
  "demo-highlight",
  "onboarding-install-prompt",
  "hydration-quick-confirmation",
  "hydration-form-confirmation",
  "weight-form-confirmation",
  "activity-form-confirmation",
  "habit-form-confirmation",
  "medication-form-confirmation",
  "daily-records-last-day-shortcut",
  "daily-records-next-day-shortcut",
  "weight-history-edit",
  "weight-history-last-day-shortcut",
  "hydration-history-last-day-shortcut",
  "habit-history-clear-search",
  "medication-history-clear-search",
  "food-daily-calories",
];
export const outcomes = ["exposure", "success", "error", "use", "rollback"];
export function validExperimentMetric(value) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 5 &&
    Object.keys(value).every((key) =>
      ["experiment", "revision", "arm", "outcome", "environment"].includes(key),
    ) &&
    experimentKeys.includes(value.experiment) &&
    Number.isInteger(value.revision) &&
    value.revision >= 1 &&
    value.revision <= 2_147_483_647 &&
    ["control", "experiment"].includes(value.arm) &&
    outcomes.includes(value.outcome) &&
    ["production", "development"].includes(value.environment)
  );
}
export function validExperimentConfig(value) {
  return (
    value &&
    typeof value === "object" &&
    Object.keys(value).length === 4 &&
    typeof value.enabled === "boolean" &&
    typeof value.killSwitch === "boolean" &&
    Number.isInteger(value.rolloutPercent) &&
    value.rolloutPercent >= 0 &&
    value.rolloutPercent <= 100 &&
    Number.isInteger(value.revision) &&
    value.revision >= 1 &&
    value.revision <= 2_147_483_647
  );
}
