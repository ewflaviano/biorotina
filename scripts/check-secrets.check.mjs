import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const scanner = resolve("scripts/check-secrets.mjs");

function git(directory, ...args) {
  const result = spawnSync("git", args, {
    cwd: directory,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
}

test("encontra credencial removida dos arquivos atuais mas ainda presente no histórico", () => {
  const directory = mkdtempSync(join(tmpdir(), "biorotina-secrets-"));
  try {
    git(directory, "init", "-q");
    git(directory, "config", "user.name", "Test");
    git(directory, "config", "user.email", "test@example.com");
    const path = join(directory, "config.txt");
    writeFileSync(path, "access=" + "AKIA" + "A".repeat(16));
    git(directory, "add", "config.txt");
    git(directory, "commit", "-qm", "add config");
    unlinkSync(path);
    git(directory, "add", "-u");
    git(directory, "commit", "-qm", "remove config");

    const result = spawnSync(process.execPath, [scanner], {
      cwd: directory,
      encoding: "utf8",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /histórico: config\.txt/);
    assert.doesNotMatch(result.stderr, /AKIA[A-Z0-9]{16}/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
