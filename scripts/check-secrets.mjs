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

let findings = 0;
for (const path of paths) {
  const name = path.split("/").at(-1) ?? "";
  if (
    name !== ".env.example" &&
    (/^\.env(?:\.|$)/.test(name) ||
      /^(?:credentials|service-account).*\.json$/i.test(name) ||
      /\.(?:pem|p12|key)$/i.test(name))
  ) {
    console.error(`Arquivo de credencial não permitido: ${path}`);
    findings++;
    continue;
  }

  let content;
  try {
    const buffer = readFileSync(path);
    if (buffer.includes(0)) continue;
    content = buffer.toString("utf8");
  } catch {
    continue;
  }
  for (const [label, pattern] of patterns) {
    if (pattern.test(content)) {
      console.error(`Possível ${label} em ${path}`);
      findings++;
    }
  }
}

if (findings) process.exitCode = 1;
else console.log("Nenhum padrão conhecido de credencial encontrado.");
