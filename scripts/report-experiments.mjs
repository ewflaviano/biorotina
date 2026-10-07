import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { experimentKeys, outcomes } from "./experiment-contract.mjs";

export function reportQuery(environment = "production") {
  if (!["production", "development"].includes(environment))
    throw new Error("Ambiente inválido.");
  return `filter environment = "${environment}" and (kind = "experiment_metric" or kind = "experiment_metric_manual") | stats count(*) as events by kind, experiment, revision, arm, outcome | sort experiment asc, revision asc, kind asc, arm asc, outcome asc`;
}
export function summarize(results) {
  const groups = new Map();
  for (const row of results) {
    const r = Object.fromEntries(row.map((v) => [v.field, v.value]));
    const revision = Number(r.revision),
      count = Number(r.events);
    if (
      !["experiment_metric", "experiment_metric_manual"].includes(r.kind) ||
      !experimentKeys.includes(r.experiment) ||
      !["control", "experiment"].includes(r.arm) ||
      !outcomes.includes(r.outcome) ||
      !Number.isInteger(revision) ||
      revision < 1 ||
      revision > 2_147_483_647 ||
      !Number.isSafeInteger(count) ||
      count < 0
    )
      throw new Error("Agregado inválido; nenhuma linha bruta será exibida.");
    const allocation =
      r.kind === "experiment_metric_manual" ? "manual" : "randomized";
    const key = `${r.experiment}:${revision}:${allocation}:${r.arm}`;
    const item = groups.get(key) || {
      experiment: r.experiment,
      revision,
      allocation,
      arm: r.arm,
      exposure: 0,
      success: 0,
      error: 0,
      use: 0,
      rollback: 0,
    };
    item[r.outcome] += count;
    groups.set(key, item);
  }
  return [...groups.values()].map((item) => ({
    ...item,
    completedAttempts: item.success + item.error,
    successRate:
      item.success + item.error
        ? item.success / (item.success + item.error)
        : null,
  }));
}
export function timeRange(since, until) {
  const start = Date.parse(since),
    end = Date.parse(until);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    end - start > 14 * 86400_000
  )
    throw new Error(
      "Informe --since e --until em ISO, com janela positiva de até 14 dias.",
    );
  return { start: Math.floor(start / 1000), end: Math.floor(end / 1000) };
}
async function main() {
  const args = process.argv.slice(2);
  const value = (flag, fallback) =>
    args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
  const since = value(
    "--since",
    new Date(Date.now() - 86400_000).toISOString(),
  );
  const until = value("--until", new Date().toISOString());
  const environment = value("--environment", "production");
  const { start, end } = timeRange(since, until);
  const stage = process.env.BIOROTINA_STAGE || "dev";
  if (!/^[a-zA-Z0-9-]+$/.test(stage)) throw new Error("Stage inválido.");
  const aws = (args) =>
    JSON.parse(
      execFileSync("aws", [...args, "--output", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  const { queryId } = aws([
    "logs",
    "start-query",
    "--log-group-name",
    `/aws/lambda/biorotina-${stage}-telemetry`,
    "--start-time",
    String(start),
    "--end-time",
    String(end),
    "--query-string",
    reportQuery(environment),
  ]);
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = aws(["logs", "get-query-results", "--query-id", queryId]);
    if (result.status === "Complete") {
      console.log(
        JSON.stringify(
          {
            since,
            until,
            environment,
            groups: summarize(result.results),
            note: "Contagens de eventos consentidos, não pessoas. Tentativas concluídas = success + error. Compare braços sorteados apenas na alocação randomized e na mesma revisão/período; a alocação manual serve para diagnóstico separado. Ausência de linhas não comprova ausência de uso.",
          },
          null,
          2,
        ),
      );
      return;
    }
    if (!["Running", "Scheduled"].includes(result.status))
      throw new Error("Consulta agregada não concluiu.");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  aws(["logs", "stop-query", "--query-id", queryId]);
  throw new Error("Consulta agregada excedeu o prazo.");
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch(() => {
    console.error(
      "Não foi possível consultar métricas agregadas. Confira parâmetros, profile AWS, região e permissão de CloudWatch Insights.",
    );
    process.exitCode = 1;
  });
}
