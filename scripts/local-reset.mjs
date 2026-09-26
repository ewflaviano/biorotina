import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const directory = resolve(
  process.env.BIOROTINA_LOCAL_DATA_DIR || ".local/biorotina",
);
await rm(directory, { recursive: true, force: true });
console.log(`Dados locais removidos de ${directory}`);
