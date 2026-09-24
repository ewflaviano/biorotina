import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const paths = execFileSync("git", [
  "ls-files",
  "--cached",
  "--others",
  "--exclude-standard",
  "-z",
])
  .toString()
  .split("\0")
  .filter(Boolean);

const patterns = [
  ["AWS access key", new RegExp("AKIA" + "[A-Z0-9]{16}")],
  ["Google API key", new RegExp("AIza" + "[A-Za-z0-9_-]{35}")],
  ["GitHub token", new RegExp("gh" + "[pousr]_[A-Za-z0-9]{30,}")],
  ["OpenAI API key", new RegExp("sk-" + "[A-Za-z0-9_-]{20,}")],
  [
    "private key block",
    new RegExp("-----BEGIN " + "(?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
  ],
];

function credentialPath(path) {
  const name = path.split("/").at(-1) ?? "";
  return (
    name !== ".env.example" &&
    (/^\.env(?:\.|$)/.test(name) ||
      /^(?:credentials|service-account).*\.json$/i.test(name) ||
      /\.(?:pem|p12|key)$/i.test(name))
  );
}

function checkContent(buffer, path, location) {
  if (buffer.includes(0)) return 0;
  const content = buffer.toString("utf8");
  let count = 0;
  for (const [label, pattern] of patterns) {
    if (pattern.test(content)) {
      console.error(`Possível ${label} em ${location}: ${path}`);
      count++;
    }
  }
  return count;
}

let findings = 0;
for (const path of paths) {
  if (credentialPath(path)) {
    console.error(`Arquivo de credencial não permitido: ${path}`);
    findings++;
    continue;
  }

  try {
    const buffer = readFileSync(path);
    findings += checkContent(buffer, path, "arquivo atual");
  } catch {
    continue;
  }
}

const history = execFileSync("git", ["rev-list", "--objects", "--all", "HEAD"])
  .toString()
  .trim()
  .split("\n");
const metadata = execFileSync(
  "git",
  ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
  { input: history.map((entry) => entry.slice(0, 40)).join("\n") + "\n" },
)
  .toString()
  .trim()
  .split("\n");
for (let index = 0; index < history.length; index++) {
  const path = history[index].slice(41);
  const [sha, kind, sizeText] = metadata[index].split(" ");
  if (kind !== "blob") continue;
  if (credentialPath(path)) {
    console.error(
      `Arquivo de credencial no histórico: ${path} (${sha.slice(0, 12)})`,
    );
    findings++;
    continue;
  }
  const size = Number(sizeText);
  if (size > 20_000_000) {
    console.error(
      `Arquivo histórico grande exige revisão: ${path} (${sha.slice(0, 12)})`,
    );
    findings++;
    continue;
  }
  const buffer = execFileSync("git", ["cat-file", "blob", sha], {
    maxBuffer: 21_000_000,
  });
  findings += checkContent(
    buffer,
    `${path} (${sha.slice(0, 12)})`,
    "histórico",
  );
}

if (findings) process.exitCode = 1;
else
  console.log(
    "Nenhum padrão conhecido de credencial nos arquivos ou no histórico.",
  );
