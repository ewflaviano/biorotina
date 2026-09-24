import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FRONTEND_FILES = new Set([
  ".env.example",
  "docs/tokens.css",
  "index.html",
  "vite.config.ts",
  "vitest.config.ts",
  "eslint.config.mjs",
]);
const SHARED_FILES = new Set([
  ".gitignore",
  ".github/workflows/ci.yml",
  "Makefile",
  "package.json",
  "package-lock.json",
  "scripts/check-secrets.mjs",
  "scripts/changed-areas.mjs",
  "scripts/changed-areas.check.mjs",
]);
const BACKEND_FILES = new Set(["scripts/configure-billing.mjs"]);

export function classifyPaths(paths) {
  let frontend = false;
  let backend = false;
  for (const path of paths) {
    if (
      path === "README.md" ||
      path === "CONTRIBUTING.md" ||
      path === "SECURITY.md" ||
      (path.startsWith("docs/") && !FRONTEND_FILES.has(path)) ||
      path.startsWith(".github/ISSUE_TEMPLATE/") ||
      path === ".github/PULL_REQUEST_TEMPLATE.md"
    )
      continue;
    if (SHARED_FILES.has(path)) {
      frontend = true;
      backend = true;
    } else if (BACKEND_FILES.has(path)) {
      backend = true;
    } else if (
      path.startsWith("src/") ||
      path.startsWith("public/") ||
      path.startsWith("test/") ||
      path.startsWith("tsconfig") ||
      FRONTEND_FILES.has(path)
    ) {
      frontend = true;
    } else if (
      path.startsWith("push/") ||
      path.startsWith("infra/") ||
      path === "serverless.yml"
    ) {
      backend = true;
    } else {
      frontend = true;
      backend = true;
    }
  }
  return { frontend, backend };
}

function changedPaths(base) {
  const output = execFileSync("git", [
    "diff",
    "--name-only",
    "-z",
    base,
    "HEAD",
  ]);
  return output.toString().split("\0").filter(Boolean);
}

function main() {
  const base = process.env.BASE_SHA ?? "";
  const runAll =
    process.env.EVENT_NAME === "workflow_dispatch" ||
    !base ||
    /^0+$/.test(base);
  const result = runAll
    ? { frontend: true, backend: true }
    : classifyPaths(changedPaths(base));
  const lines = `frontend=${result.frontend}\nbackend=${result.backend}\n`;
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, lines);
  process.stdout.write(lines);
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main();
}
