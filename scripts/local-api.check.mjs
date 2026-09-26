import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createLocalApi } from "./local-api.mjs";

async function login(api, user = "1") {
  const response = await fetch(api.url + "/api/auth/google/exchange", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://127.0.0.1:5173",
    },
    body: JSON.stringify({ code: `local-test-user-${user}` }),
  });
  assert.equal(response.status, 200);
  const account = await response.json();
  const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
  assert.ok(cookie);
  return { account, cookie };
}

test("simulador local preserva a sessão e isola usuários de teste", async (context) => {
  const dataDir = await mkdtemp(join(tmpdir(), "biorotina-local-"));
  const api = await createLocalApi({ dataDir });
  context.after(async () => {
    await api.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const health = await fetch(api.url + "/health");
  assert.deepEqual(await health.json(), { mode: "local", status: "ok" });

  const first = await login(api);
  assert.equal(first.account.email, "teste.local@biorotina.test");
  const cors = await fetch(api.url + "/api/auth/access-token", {
    headers: { cookie: first.cookie, origin: "http://127.0.0.1:5173" },
  });
  assert.equal(
    cors.headers.get("access-control-allow-origin"),
    "http://127.0.0.1:5173",
  );
  assert.equal(cors.headers.get("access-control-allow-credentials"), "true");
  const apiToken = (await cors.json()).accessToken;
  assert.match(apiToken, /^local-session-/);
  assert.equal((await fetch(api.url + "/api/auth/access-token")).status, 401);

  const experiment = await fetch(api.url + "/api/experiments", {
    headers: {
      cookie: first.cookie,
      "x-biorotina-force-experiment": "demo-highlight=enabled",
    },
  });
  assert.deepEqual((await experiment.json()).enabled, ["demo-highlight"]);
  const hydrationExperiment = await fetch(api.url + "/api/experiments", {
    headers: {
      cookie: first.cookie,
      "x-biorotina-force-experiment": "hydration-quick-confirmation=enabled",
    },
  });
  assert.deepEqual((await hydrationExperiment.json()).enabled, [
    "hydration-quick-confirmation",
  ]);
  const formExperiment = await fetch(api.url + "/api/experiments", {
    headers: {
      cookie: first.cookie,
      "x-biorotina-force-experiment": "hydration-form-confirmation=enabled",
    },
  });
  assert.deepEqual((await formExperiment.json()).enabled, [
    "hydration-form-confirmation",
  ]);
  const ordinaryExperiments = await fetch(api.url + "/api/experiments", {
    headers: { cookie: first.cookie },
  });
  assert.deepEqual((await ordinaryExperiments.json()).enabled, []);
  const experimentApi = await fetch(api.url + "/api/experiments/demo", {
    method: "POST",
    headers: {
      cookie: first.cookie,
      "x-biorotina-experiment": "demo-highlight",
      "x-biorotina-force-experiment": "demo-highlight=enabled",
    },
  });
  assert.equal(experimentApi.status, 200);

  const backup = { schemaVersion: 4, profile: { displayName: "Teste" } };
  const saved = await fetch(api.url + "/api/local/drive/snapshots", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${first.account.accessToken}`,
    },
    body: JSON.stringify(backup),
  });
  const snapshot = await saved.json();
  assert.ok(snapshot.id);
  const restored = await fetch(
    api.url + "/api/local/drive/snapshots/" + snapshot.id,
    { headers: { authorization: `Bearer ${first.account.accessToken}` } },
  );
  assert.deepEqual(await restored.json(), backup);

  const second = await login(api, "2");
  const isolated = await fetch(api.url + "/api/local/drive/snapshots", {
    headers: { authorization: `Bearer ${second.account.accessToken}` },
  });
  assert.deepEqual((await isolated.json()).snapshots, []);
  const headerOptIn = await fetch(api.url + "/api/experiments", {
    headers: {
      cookie: second.cookie,
      "x-biorotina-force-experiment": "demo-highlight=enabled",
    },
  });
  assert.deepEqual((await headerOptIn.json()).enabled, ["demo-highlight"]);

  const billing = await fetch(api.url + "/api/billing/checkout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: first.cookie,
      authorization: `Bearer ${apiToken}`,
    },
    body: "{}",
  });
  const checkoutUrl = (await billing.json()).url;
  assert.match(checkoutUrl, /^http:\/\/127\.0\.0\.1:/);
  const status = await fetch(api.url + "/api/billing/status", {
    headers: { cookie: first.cookie, authorization: `Bearer ${apiToken}` },
  });
  assert.equal((await status.json()).checkoutUrl, checkoutUrl);
  assert.equal(
    (
      await fetch(api.url + "/api/billing/checkout", {
        method: "POST",
        body: "{}",
      })
    ).status,
    401,
  );

  const telemetry = await fetch(api.url + "/api/telemetry/error", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: "drive", code: "drive_sync_failed" }),
  });
  assert.equal(telemetry.status, 204);
  assert.match(
    await readFile(join(dataDir, "telemetry.jsonl"), "utf8"),
    /drive_sync_failed/,
  );

  await fetch(api.url + "/api/auth/logout", {
    method: "POST",
    headers: { cookie: first.cookie },
  });
  assert.equal(
    (
      await fetch(api.url + "/api/auth/access-token", {
        headers: { cookie: first.cookie },
      })
    ).status,
    401,
  );
});
