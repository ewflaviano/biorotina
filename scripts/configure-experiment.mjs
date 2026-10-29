import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
function value(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

const key = value("--key");
const rolloutPercent = Number(value("--rollout") ?? "0");
const revision = Number(value("--revision") ?? "1");
const stage = process.env.BIOROTINA_STAGE || "dev";
if (
  ![
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
    "weight-history-next-day-shortcut",
    "weight-history-latest-day-shortcut",
    "hydration-history-last-day-shortcut",
    "hydration-history-next-day-shortcut",
    "hydration-custom-shortcuts",
    "habit-history-clear-search",
    "habit-history-last-day-shortcut",
    "habit-history-next-day-shortcut",
    "medication-history-clear-search",
    "medication-history-last-day-shortcut",
    "medication-history-next-day-shortcut",
    "activity-history-clear-search",
    "activity-history-last-day-shortcut",
    "activity-history-next-day-shortcut",
    "food-history-clear-search",
    "food-history-last-day-shortcut",
    "food-history-next-day-shortcut",
    "food-daily-calories",
    "food-description-ai",
    "mobile-nav-meal-priority",
    "calorie-balance-daily",
    "initial-sync-before-entry",
  ].includes(key) ||
  !Number.isInteger(rolloutPercent) ||
  rolloutPercent < 0 ||
  rolloutPercent > 100 ||
  !Number.isInteger(revision) ||
  revision < 1 ||
  revision > 2_147_483_647
) {
  throw new Error(
    "Uso: node scripts/configure-experiment.mjs --key <chave registrada> --rollout 0..100 --revision 1 [--enabled] [--kill-switch]",
  );
}

const config = {
  enabled: args.includes("--enabled"),
  killSwitch: args.includes("--kill-switch"),
  rolloutPercent,
  revision,
};
const aws = (command) =>
  execFileSync("aws", command, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();
const table = aws([
  "cloudformation",
  "describe-stack-resources",
  "--stack-name",
  `biorotina-${stage}`,
  "--logical-resource-id",
  "ExperimentsTable",
  "--query",
  "StackResources[0].PhysicalResourceId",
  "--output",
  "text",
]);
aws([
  "dynamodb",
  "put-item",
  "--table-name",
  table,
  "--item",
  JSON.stringify({
    pk: { S: `EXPERIMENT#${key}` },
    config: { S: JSON.stringify(config) },
  }),
]);
console.log(`Experimento ${key} atualizado (revisão ${revision}).`);
