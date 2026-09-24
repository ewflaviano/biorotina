import assert from "node:assert/strict";
import test from "node:test";
import { classifyPaths } from "./changed-areas.mjs";

test("frontend changes do not start backend validation", () => {
  assert.deepEqual(
    classifyPaths(["src/pages/HydrationPage.tsx", "test/pages.test.tsx"]),
    {
      frontend: true,
      backend: false,
    },
  );
});

test("backend changes do not start frontend validation", () => {
  assert.deepEqual(
    classifyPaths([
      "push/src/bin/tick.rs",
      "serverless.yml",
      "scripts/configure-billing.mjs",
    ]),
    {
      frontend: false,
      backend: true,
    },
  );
});

test("shared files start both validations", () => {
  assert.deepEqual(classifyPaths(["package-lock.json"]), {
    frontend: true,
    backend: true,
  });
});

test("documentation changes do not deploy the app", () => {
  assert.deepEqual(
    classifyPaths([
      "README.md",
      "CONTRIBUTING.md",
      "SECURITY.md",
      "docs/architecture.md",
      ".github/ISSUE_TEMPLATE/bug_report.yml",
      ".github/PULL_REQUEST_TEMPLATE.md",
    ]),
    { frontend: false, backend: false },
  );
});

test("unknown project files are validated by both jobs", () => {
  assert.deepEqual(classifyPaths(["new-tool.config.js"]), {
    frontend: true,
    backend: true,
  });
});
