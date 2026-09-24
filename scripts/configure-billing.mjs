import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const asaas = process.env.ASAAS_API_KEY;
const gemini = process.env.GEMINI_API_KEY;
if (!asaas || !gemini)
  throw new Error(
    "Configure ASAAS_API_KEY e GEMINI_API_KEY nos secrets do repositório.",
  );

function stackOutput(name) {
  const stack = JSON.parse(
    execFileSync(
      "aws",
      [
        "cloudformation",
        "describe-stacks",
        "--stack-name",
        "biorotina-dev",
        "--output",
        "json",
      ],
      { encoding: "utf8" },
    ),
  );
  return stack.Stacks[0].Outputs.find((item) => item.OutputKey === name)
    ?.OutputValue;
}
const keyArn = stackOutput("BillingKeysArn");
const tokenArn = stackOutput("BillingWebhookTokenArn");
const apiUrl = stackOutput("PushApiUrl");
if (!keyArn || !tokenArn || !apiUrl)
  throw new Error("Recursos de assinatura ausentes na stack.");

const folder = mkdtempSync(
  join(process.env.RUNNER_TEMP || tmpdir(), "biorotina-billing-"),
);
try {
  const path = join(folder, "keys.json");
  writeFileSync(path, JSON.stringify({ asaas, gemini }), { mode: 0o600 });
  execFileSync(
    "aws",
    [
      "secretsmanager",
      "put-secret-value",
      "--secret-id",
      keyArn,
      "--secret-string",
      `file://${path}`,
      "--output",
      "json",
    ],
    { stdio: "ignore" },
  );
} finally {
  rmSync(folder, { recursive: true, force: true });
}

const token = execFileSync(
  "aws",
  [
    "secretsmanager",
    "get-secret-value",
    "--secret-id",
    tokenArn,
    "--query",
    "SecretString",
    "--output",
    "text",
  ],
  { encoding: "utf8" },
).trim();
const webhookUrl = `${apiUrl.replace(/\/$/, "")}/api/billing/webhook`;
const baseUrl = "https://api.asaas.com/v3/webhooks";
async function call(method, url, body) {
  const response = await fetch(url, {
    method,
    headers: { access_token: asaas, "content-type": "application/json" },
    body: body && JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(
      `Asaas recusou configuração do webhook (${response.status}).`,
    );
  return response.json();
}
const existing = await call("GET", baseUrl);
const hook = existing.data?.find((item) => item.url === webhookUrl);
const config = {
  name: "Biorotina assinatura IA",
  url: webhookUrl,
  email: "ewanderson.flaviano@gmail.com",
  enabled: true,
  interrupted: hook?.interrupted ?? false,
  apiVersion: 3,
  authToken: token,
  sendType: "SEQUENTIALLY",
  events: [
    "CHECKOUT_PAID",
    "CHECKOUT_CANCELED",
    "CHECKOUT_EXPIRED",
    "SUBSCRIPTION_CREATED",
    "SUBSCRIPTION_UPDATED",
    "SUBSCRIPTION_INACTIVATED",
    "SUBSCRIPTION_DELETED",
    "PAYMENT_CONFIRMED",
    "PAYMENT_RECEIVED",
    "PAYMENT_REFUNDED",
    "PAYMENT_CHARGEBACK_REQUESTED",
  ],
};
await call(
  hook ? "PUT" : "POST",
  hook ? `${baseUrl}/${hook.id}` : baseUrl,
  config,
);
process.stdout.write("Segredos e webhook de assinatura configurados.\n");
