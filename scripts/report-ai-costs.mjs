import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export function summarizeCalls(calls) {
  const users = new Map();
  const models = new Map();
  const allocations = new Map();
  const requestIds = new Set();
  const seen = new Set();
  let total = 0n,
    unknownCostCalls = 0,
    pendingCalls = 0;
  for (const call of calls) {
    if (
      call.schemaVersion !== 1 ||
      typeof call.accountKey !== "string" ||
      typeof call.callId !== "string" ||
      typeof call.requestId !== "string" ||
      typeof call.model !== "string" ||
      !["trial", "paid"].includes(call.allocation) ||
      !(
        call.estimatedCostNanoUsd === null ||
        (Number.isSafeInteger(call.estimatedCostNanoUsd) &&
          call.estimatedCostNanoUsd >= 0)
      )
    )
      throw new Error("Registro de custo inválido; relatório interrompido.");
    if (seen.has(call.callId)) continue;
    seen.add(call.callId);
    requestIds.add(call.requestId);
    const known = call.estimatedCostNanoUsd !== null;
    const amount = known ? BigInt(call.estimatedCostNanoUsd) : 0n;
    total += amount;
    if (!known) unknownCostCalls++;
    if (call.outcome === "pending") pendingCalls++;
    for (const [groups, key] of [
      [users, createHash("sha256").update(call.accountKey).digest("hex")],
      [models, call.model],
      [allocations, call.allocation],
    ]) {
      const group = groups.get(key) ?? {
        calls: 0,
        unknownCostCalls: 0,
        cost: 0n,
      };
      group.calls++;
      group.cost += amount;
      if (!known) group.unknownCostCalls++;
      groups.set(key, group);
    }
  }
  const usd = (nano) =>
    `${nano / 1_000_000_000n}.${(nano % 1_000_000_000n).toString().padStart(9, "0")}`;
  const rows = (groups, field) =>
    [...groups]
      .map(([key, g]) => ({
        [field]: key,
        calls: g.calls,
        unknownCostCalls: g.unknownCostCalls,
        knownCostUsd: usd(g.cost),
      }))
      .sort((a, b) => a[field].localeCompare(b[field]));
  return {
    currency: "USD",
    calls: seen.size,
    analysisRequests: requestIds.size,
    accountsWithCalls: users.size,
    knownCostUsd: usd(total),
    unknownCostCalls,
    pendingCalls,
    knownCostPerActiveAccountUsd: users.size
      ? usd(total / BigInt(users.size))
      : null,
    knownCostPerCallUsd: seen.size ? usd(total / BigInt(seen.size)) : null,
    byAllocation: rows(allocations, "allocation"),
    byModel: rows(models, "model"),
    byAccount: rows(users, "accountAlias"),
    note: "Estimativa por preços públicos, sem créditos, descontos, impostos, câmbio ou AWS. Médias usam contas com chamadas no período, não todos os cadastrados. Custos desconhecidos não são zero; totais e médias são parciais se houver chamadas sem custo. Chaves pessoais Gemini não passam pelo backend e ficam fora. Não há recuperação de consumo anterior à implantação.",
  };
}

async function main() {
  const month = process.argv[2];
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? ""))
    throw new Error("Uso: npm run report-ai-costs -- AAAA-MM (mês em UTC)");
  const stage = process.env.BIOROTINA_STAGE || "dev";
  if (!/^[a-zA-Z0-9-]+$/.test(stage)) throw new Error("Stage inválido.");
  const aws = (args) =>
    JSON.parse(
      execFileSync("aws", [...args, "--output", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  const table = aws([
    "cloudformation",
    "describe-stack-resources",
    "--stack-name",
    `biorotina-${stage}`,
    "--logical-resource-id",
    "BillingTable",
  ]).StackResources[0].PhysicalResourceId;
  const calls = [];
  let cursor;
  do {
    const result = aws([
      "dynamodb",
      "scan",
      "--table-name",
      table,
      "--consistent-read",
      "--no-paginate",
      "--projection-expression",
      "pk,#data",
      "--filter-expression",
      "begins_with(pk,:prefix)",
      "--expression-attribute-names",
      JSON.stringify({ "#data": "data" }),
      "--expression-attribute-values",
      JSON.stringify({ ":prefix": { S: `AI_CALL#${month}#` } }),
      ...(cursor ? ["--exclusive-start-key", JSON.stringify(cursor)] : []),
    ]);
    for (const row of result.Items) calls.push(JSON.parse(row.data.S));
    cursor = result.LastEvaluatedKey;
  } while (cursor && Object.keys(cursor).length);
  console.log(
    JSON.stringify({ monthUtc: month, ...summarizeCalls(calls) }, null, 2),
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(() => {
    console.error(
      "Não foi possível gerar o balanço. Confira mês, credenciais AWS, região e acesso à tabela de cobrança.",
    );
    process.exitCode = 1;
  });
}
