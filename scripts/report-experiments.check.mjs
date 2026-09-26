import test from "node:test";
import assert from "node:assert/strict";
import { reportQuery, summarize, timeRange } from "./report-experiments.mjs";
const row = (arm, outcome, events, revision = "2") =>
  Object.entries({
    experiment: "hydration-form-confirmation",
    revision,
    arm,
    outcome,
    events,
  }).map(([field, value]) => ({ field, value }));
test("relatório calcula tentativas concluídas por braço sem total da população", () => {
  const result = summarize([
    row("control", "exposure", "20"),
    row("control", "success", "9"),
    row("control", "error", "1"),
    row("experiment", "success", "3"),
    row("experiment", "rollback", "1"),
    row("control", "exposure", "1", "3"),
  ]);
  assert.equal(result[0].completedAttempts, 10);
  assert.equal(result[0].successRate, 0.9);
  assert.equal(result[1].completedAttempts, 3);
  assert.equal(result[1].successRate, 1);
  assert.equal(result[2].revision, 3);
  assert.equal(result[2].successRate, null);
  assert.deepEqual(summarize([]), []);
});
test("consulta e relatório recusam dimensões livres e intervalos inválidos", () => {
  assert.match(reportQuery(), /stats count\(\*\)/);
  assert.match(reportQuery("development"), /environment = "development"/);
  assert.throws(() => reportQuery('" | fields @message'));
  assert.throws(() => summarize([row("free-text", "success", "1")]));
  assert.throws(() => summarize([row("control", "success", "NaN")]));
  assert.throws(() => timeRange("2026-09-26", "2026-09-25"));
  assert.throws(() => timeRange("2026-08-26", "2026-09-26"));
  assert.equal(
    timeRange("2026-09-25T00:00:00Z", "2026-09-26T00:00:00Z").end -
      timeRange("2026-09-25T00:00:00Z", "2026-09-26T00:00:00Z").start,
    86400,
  );
});
