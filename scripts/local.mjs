import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiPort = process.env.BIOROTINA_LOCAL_API_PORT || "8787";
const apiUrl = `http://127.0.0.1:${apiPort}`;
const environment = {
  ...process.env,
  BIOROTINA_LOCAL_API_PORT: apiPort,
  VITE_BIOROTINA_LOCAL_MODE: "true",
  VITE_BIOROTINA_LOCAL_TEST_USER: process.env.BIOROTINA_LOCAL_TEST_USER || "1",
  VITE_PUSH_API_URL: apiUrl,
  VITE_GOOGLE_CLIENT_ID: "local-biorotina-client",
  VITE_FIREBASE_API_KEY: "",
  VITE_FIREBASE_APP_ID: "",
  VITE_FIREBASE_MEASUREMENT_ID: "",
  VITE_FIREBASE_PROJECT_ID: "",
};

function start(command, args) {
  return spawn(command, args, {
    cwd: root,
    env: environment,
    stdio: "inherit",
  });
}

const api = start(process.execPath, ["scripts/local-api.mjs"]);
const vite = start(process.execPath, [
  "node_modules/vite/bin/vite.js",
  "--host",
  "127.0.0.1",
]);
let stopping = false;

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  api.kill("SIGTERM");
  vite.kill("SIGTERM");
  process.exitCode = code;
}

for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => stop());
api.once("exit", (code) => {
  if (!stopping) stop(code ?? 1);
});
vite.once("exit", (code) => {
  if (!stopping) stop(code ?? 1);
});
