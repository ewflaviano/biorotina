import assert from "node:assert/strict";
import test from "node:test";
import { summarizeCalls } from "./report-ai-costs.mjs";
const call = (callId, accountKey, cost, rest = {}) => ({
  schemaVersion: 1,
  callId,
  requestId: callId,
  accountKey,
  model: "gemini-3.8-flash",
  allocation: "trial",
  outcome: "success",
  estimatedCostNanoUsd: cost,
  ...rest,
});
test("custos agrupam tentativas, modelos e contas sem tratar consumo desconhecido como zero", () => {
  const a = call("a", "user1", 1_500_000, { requestId: "meal1" });
  const report = summarizeCalls([
    a,
    a,
    call("b", "user1", null, { requestId: "meal1", outcome: "http_error" }),
    call("c", "user2", 2_500_000, {
      model: "gemini-3.1-pro-preview",
      allocation: "paid",
    }),
    call("d", "user2", null, { outcome: "pending" }),
  ]);
  assert.equal(report.calls, 4);
  assert.equal(report.analysisRequests, 3);
  assert.equal(report.accountsWithCalls, 2);
  assert.equal(report.knownCostUsd, "0.004000000");
  assert.equal(report.knownCostPerActiveAccountUsd, "0.002000000");
  assert.equal(report.unknownCostCalls, 2);
  assert.equal(report.pendingCalls, 1);
  assert.equal(report.byModel.length, 2);
  assert.ok(!JSON.stringify(report).includes("user1"));
});
test("balanço vazio não inventa média e rejeita custos inválidos", () => {
  assert.equal(summarizeCalls([]).knownCostPerActiveAccountUsd, null);
  assert.throws(() => summarizeCalls([call("a", "u", -1)]));
  assert.throws(() =>
    summarizeCalls([call("a", "u", Number.MAX_SAFE_INTEGER + 1)]),
  );
});
