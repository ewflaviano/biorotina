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
  ].includes(key) ||
  !Number.isInteger(rolloutPercent) ||
  rolloutPercent < 0 ||
  rolloutPercent > 100 ||
  !Number.isInteger(revision) ||
  revision < 1
) {
  throw new Error(
    "Uso: node scripts/configure-experiment.mjs --key <demo-highlight|onboarding-install-prompt|hydration-quick-confirmation> --rollout 0..100 --revision 1 [--enabled] [--kill-switch]",
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
