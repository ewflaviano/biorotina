import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { experimentKeys as contractKeys } from "./experiment-contract.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const names = (source) =>
  [...source.matchAll(/"([a-z0-9-]+)"/g)].map((match) => match[1]);
const sorted = (items) => [...items].sort();

test("registro, gate, configuração e telemetria aceitam as mesmas chaves", () => {
  const registry = [
    ...read("../src/experiments/registry.ts").matchAll(
      /^ {2}"([a-z0-9-]+)": \{$/gm,
    ),
  ].map((match) => match[1]);
  const api = read("../push/src/bin/experiments_api.rs").match(
    /const FEATURES: &\[&str\] = &\[([\s\S]*?)\];/,
  )?.[1];
  const config = read("configure-experiment.mjs").match(
    /!\s*\[([\s\S]*?)\]\.includes\(key\)/,
  )?.[1];
  const variants = read("../push/src/bin/telemetry.rs").match(
    /enum Experiment \{([\s\S]*?)\}/,
  )?.[1];

  assert.ok(
    api && config && variants,
    "As listas de chaves devem ser legíveis",
  );
  const telemetry = [...variants.matchAll(/^\s+([A-Z][A-Za-z]+),$/gm)].map(
    (match) => match[1].replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase(),
  );
  assert.deepEqual(sorted(registry), sorted(contractKeys));
  assert.deepEqual(
    sorted(["demo-highlight", ...names(api)]),
    sorted(contractKeys),
  );
  assert.deepEqual(sorted(names(config)), sorted(contractKeys));
  assert.deepEqual(sorted(telemetry), sorted(contractKeys));
});
