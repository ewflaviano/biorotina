import { createServer } from "node:http";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const DEFAULT_PORT = 8787;
const MAX_BODY_BYTES = 10_000_000;
const SESSION_COOKIE = "biorotina_local_session";
const TEST_ACCOUNTS = {
  1: { id: "local-biorotina-user-1", email: "teste.local@biorotina.test" },
  2: { id: "local-biorotina-user-2", email: "teste.dois@biorotina.test" },
};

function applyCors(request, response) {
  const origin = request.headers.origin;
  if (
    typeof origin !== "string" ||
    !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)
  )
    return;
  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("access-control-allow-credentials", "true");
  response.setHeader(
    "access-control-allow-headers",
    "authorization, content-type, x-requested-with",
  );
  response.setHeader(
    "access-control-allow-methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  response.setHeader("vary", "Origin");
}

function json(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(body === undefined ? "" : JSON.stringify(body));
}

function text(response, status, body) {
  response.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Payload local muito grande.");
    chunks.push(chunk);
  }
  return chunks.length
    ? JSON.parse(Buffer.concat(chunks).toString("utf8"))
    : {};
}

function readCookie(request, name) {
  const prefix = `${name}=`;
  return (
    (request.headers.cookie || "")
      .split(/;\s*/)
      .find((value) => value.startsWith(prefix))
      ?.slice(prefix.length) || null
  );
}

async function loadState(path) {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8"));
    if (parsed && Array.isArray(parsed.snapshots))
      return {
        snapshots: parsed.snapshots,
        subscriptions: Array.isArray(parsed.subscriptions)
          ? parsed.subscriptions
          : [],
        plans:
          parsed.plans && typeof parsed.plans === "object" ? parsed.plans : {},
      };
  } catch {
    // O primeiro uso começa vazio.
  }
  return { snapshots: [], subscriptions: [], plans: {} };
}

function publicSnapshot(snapshot) {
  return {
    id: snapshot.id,
    createdTime: snapshot.createdTime,
    size: String(Buffer.byteLength(JSON.stringify(snapshot.data))),
  };
}

function accountForCode(code) {
  const suffix =
    typeof code === "string" ? code.match(/(?:-|^)user-(1|2)$/)?.[1] : null;
  return TEST_ACCOUNTS[suffix || "1"];
}

export async function createLocalApi({ dataDir, port = 0 } = {}) {
  const directory = resolve(dataDir ?? ".local/biorotina");
  const statePath = resolve(directory, "state.json");
  const telemetryPath = resolve(directory, "telemetry.jsonl");
  await mkdir(directory, { recursive: true });
  const state = await loadState(statePath);
  const sessions = new Map();
  const persist = () =>
    writeFile(statePath, JSON.stringify(state, null, 2) + "\n");
  const sessionFor = (request) =>
    sessions.get(readCookie(request, SESSION_COOKIE)) || null;
  const requireSession = (request, response) => {
    const session = sessionFor(request);
    if (!session)
      json(response, 401, {
        error: "A sessão local expirou. Conecte novamente.",
      });
    return session;
  };
  const requireDriveToken = (request, response) => {
    const session = [...sessions.values()].find(
      (item) => request.headers.authorization === `Bearer ${item.driveToken}`,
    );
    if (!session)
      json(response, 401, { error: "A conexão local com o Drive expirou." });
    return session;
  };
  const requireApiToken = (request, response) => {
    const session = sessionFor(request);
    if (
      !session ||
      request.headers.authorization !== `Bearer ${session.apiToken}`
    )
      json(response, 401, {
        error: "A sessão local expirou. Conecte novamente.",
      });
    return session &&
      request.headers.authorization === `Bearer ${session.apiToken}`
      ? session
      : null;
  };
  const planFor = (accountId) =>
    state.plans[accountId] || {
      active: false,
      cancelled: false,
      renewalActive: false,
      paidThrough: null,
      nextCharge: null,
      usedToday: 0,
      dailyLimit: 10,
      trialEnabled: true,
      trialUsed: 0,
      trialLimit: 5,
      checkoutUrl: null,
    };
  const billingStatus = (accountId) => planFor(accountId);

  const server = createServer(async (request, response) => {
    applyCors(request, response);
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;
    const method = request.method ?? "GET";
    if (method === "OPTIONS") return json(response, 204);
    try {
      if (path === "/health" && method === "GET")
        return json(response, 200, { mode: "local", status: "ok" });
      if (path === "/local/checkout" && method === "GET") {
        const sessionId = url.searchParams.get("session");
        const activated = url.searchParams.get("activated") === "1";
        return text(
          response,
          200,
          `<!doctype html><meta charset="utf-8"><title>Checkout simulado</title><main><h1>Checkout simulado</h1><p>${activated ? "Plano ativado para este usuário de teste." : "Nenhuma cobrança será criada."}</p>${sessionId && !activated ? `<form method="post" action="/api/local/billing/activate?session=${encodeURIComponent(sessionId)}"><button>Confirmar plano de teste</button></form>` : ""}</main>`,
        );
      }
      if (path === "/api/local/billing/activate" && method === "POST") {
        const session = sessions.get(url.searchParams.get("session"));
        if (!session)
          return json(response, 401, { error: "Checkout local expirado." });
        state.plans[session.account.id] = {
          ...planFor(session.account.id),
          active: true,
          cancelled: false,
          renewalActive: true,
          checkoutUrl: null,
        };
        await persist();
        response.writeHead(303, { location: "/local/checkout?activated=1" });
        return response.end();
      }
      if (path === "/api/telemetry/error" && method === "POST") {
        const event = await readJson(request);
        await appendFile(
          telemetryPath,
          JSON.stringify({ receivedAt: new Date().toISOString(), ...event }) +
            "\n",
        );
        return json(response, 204);
      }
      if (path === "/api/auth/google/exchange" && method === "POST") {
        const { code } = await readJson(request);
        const account = accountForCode(code);
        const session = {
          id: randomUUID(),
          account,
          driveToken: `local-drive-${randomUUID()}`,
          apiToken: `local-session-${randomUUID()}`,
        };
        sessions.set(session.id, session);
        response.setHeader(
          "set-cookie",
          `${SESSION_COOKIE}=${session.id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600`,
        );
        return json(response, 200, {
          ...account,
          accessToken: session.driveToken,
          expiresIn: 3600,
          driveAuthorized: true,
        });
      }
      if (path === "/api/auth/drive-token" && method === "GET") {
        const session = requireSession(request, response);
        return (
          session &&
          json(response, 200, {
            accessToken: session.driveToken,
            expiresIn: 3600,
          })
        );
      }
      if (path === "/api/auth/access-token" && method === "GET") {
        const session = requireSession(request, response);
        return (
          session && json(response, 200, { accessToken: session.apiToken })
        );
      }
      if (path === "/api/auth/logout" && method === "POST") {
        const session = sessionFor(request);
        if (session) sessions.delete(session.id);
        response.setHeader(
          "set-cookie",
          `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
        );
        return json(response, 204);
      }
      if (path === "/api/ai/trial-config" && method === "GET")
        return json(response, 200, { trialEnabled: true });
      if (path === "/api/local/ai/meal" && method === "POST") {
        await readJson(request);
        return json(response, 200, {
          description: "Refeição simulada para testes locais",
          foods: [{ name: "Exemplo", amount: "1 porção", caloriesKcal: 120 }],
        });
      }
      if (path === "/api/ai/meal" && method === "POST") {
        const session = requireApiToken(request, response);
        if (!session) return;
        await readJson(request);
        const plan = planFor(session.account.id);
        state.plans[session.account.id] = {
          ...plan,
          trialUsed: plan.trialUsed + 1,
        };
        await persist();
        return json(response, 200, {
          description: "Refeição simulada para testes locais",
          foods: [{ name: "Exemplo", amount: "1 porção", caloriesKcal: 120 }],
        });
      }
      if (path === "/api/billing/status" && method === "GET") {
        const session = requireApiToken(request, response);
        return (
          session && json(response, 200, billingStatus(session.account.id))
        );
      }
      if (path === "/api/billing/cancel" && method === "POST") {
        const session = requireApiToken(request, response);
        if (!session) return;
        await readJson(request);
        state.plans[session.account.id] = {
          ...planFor(session.account.id),
          active: false,
          cancelled: true,
          renewalActive: false,
        };
        await persist();
        return json(response, 200, billingStatus(session.account.id));
      }
      if (path === "/api/billing/checkout" && method === "POST") {
        const session = requireApiToken(request, response);
        if (!session) return;
        await readJson(request);
        const address = server.address();
        const localPort =
          typeof address === "object" && address ? address.port : DEFAULT_PORT;
        const checkoutUrl = `http://127.0.0.1:${localPort}/local/checkout?session=${encodeURIComponent(session.id)}`;
        state.plans[session.account.id] = {
          ...planFor(session.account.id),
          checkoutUrl,
        };
        await persist();
        return json(response, 200, { url: checkoutUrl });
      }
      if (path === "/api/feedback" && method === "POST") {
        await readJson(request);
        return json(response, 200, { sent: true, simulated: true });
      }
      if (path === "/api/push/config" && method === "GET")
        return json(response, 200, {
          publicKey: "local-notifications-are-simulated",
        });
      if (path === "/api/push/subscriptions" && method === "POST") {
        const item = await readJson(request);
        const subscription = { id: randomUUID(), token: randomUUID(), ...item };
        state.subscriptions.push(subscription);
        await persist();
        return json(response, 200, {
          id: subscription.id,
          token: subscription.token,
        });
      }
      if (path.startsWith("/api/push/subscriptions/")) {
        const id = path.split("/")[4];
        const index = state.subscriptions.findIndex((item) => item.id === id);
        if (index < 0)
          return json(response, 404, {
            error: "Inscrição local não encontrada.",
          });
        if (method === "DELETE") {
          state.subscriptions.splice(index, 1);
          await persist();
          return json(response, 204);
        }
        if (method === "POST" && path.endsWith("/test"))
          return json(response, 200, { sent: true, simulated: true });
        if (method === "PUT") {
          state.subscriptions[index] = {
            ...state.subscriptions[index],
            ...(await readJson(request)),
          };
          await persist();
          return json(response, 200, { updated: true });
        }
        return json(response, 200, { id, simulated: true });
      }
      if (path === "/api/local/drive/snapshots" && method === "GET") {
        const session = requireDriveToken(request, response);
        return (
          session &&
          json(response, 200, {
            snapshots: state.snapshots
              .filter((item) => item.accountId === session.account.id)
              .map(publicSnapshot),
          })
        );
      }
      if (path === "/api/local/drive/snapshots" && method === "POST") {
        const session = requireDriveToken(request, response);
        if (!session) return;
        const snapshot = {
          id: randomUUID(),
          accountId: session.account.id,
          createdTime: new Date().toISOString(),
          data: await readJson(request),
        };
        state.snapshots.unshift(snapshot);
        await persist();
        return json(response, 200, publicSnapshot(snapshot));
      }
      if (path.startsWith("/api/local/drive/snapshots/") && method === "GET") {
        const session = requireDriveToken(request, response);
        if (!session) return;
        const id = path.split("/").at(-1);
        const snapshot = state.snapshots.find(
          (item) => item.id === id && item.accountId === session.account.id,
        );
        return snapshot
          ? json(response, 200, snapshot.data)
          : json(response, 404, { error: "Backup local não encontrado." });
      }
      if (path === "/api/local/tick" && method === "POST")
        return json(response, 200, {
          processedSubscriptions: state.subscriptions.length,
          delivered: 0,
          simulated: true,
        });
      return json(response, 404, { error: "Rota local não encontrada." });
    } catch (cause) {
      return json(response, 400, {
        error:
          cause instanceof Error ? cause.message : "Falha no simulador local.",
      });
    }
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  const actualPort =
    typeof address === "object" && address ? address.port : port;
  return {
    url: `http://127.0.0.1:${actualPort}`,
    dataDir: directory,
    close: () =>
      new Promise((resolvePromise, reject) =>
        server.close((error) => (error ? reject(error) : resolvePromise())),
      ),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.BIOROTINA_LOCAL_API_PORT || DEFAULT_PORT);
  const api = await createLocalApi({
    port,
    dataDir: process.env.BIOROTINA_LOCAL_DATA_DIR,
  });
  console.log(`Simulador local da Biorotina em ${api.url}`);
  console.log(`Dados descartáveis em ${api.dataDir}`);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => void api.close().then(() => process.exit(0)));
}
