import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
if (!clientSecret)
  throw new Error(
    "Defina GOOGLE_OAUTH_CLIENT_SECRET com o segredo do cliente OAuth Web.",
  );

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
const secretArn = stack.Stacks[0].Outputs.find(
  (item) => item.OutputKey === "GoogleOAuthClientSecretArn",
)?.OutputValue;
if (!secretArn) throw new Error("Segredo OAuth ausente na stack.");

const folder = mkdtempSync(
  join(process.env.RUNNER_TEMP || tmpdir(), "biorotina-google-oauth-"),
);
try {
  const path = join(folder, "oauth.json");
  writeFileSync(path, JSON.stringify({ clientSecret }), { mode: 0o600 });
  execFileSync(
    "aws",
    [
      "secretsmanager",
      "put-secret-value",
      "--secret-id",
      secretArn,
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
process.stdout.write("Segredo OAuth armazenado no Secrets Manager.\n");
