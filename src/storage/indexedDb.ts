import { openDB, type DBSchema } from "idb";
import { emptyData, parseBackup, type AppData } from "../domain/data";

interface BiorotinaDb extends DBSchema {
  app: { key: "main"; value: AppData | Record<string, unknown> };
  geminiKey: { key: "current"; value: string };
  driveSync: {
    key: string;
    value: { snapshotId: string; contentHash: string };
  };
}

const dbPromise = openDB<BiorotinaDb>("biorotina", 3, {
  upgrade(database, oldVersion) {
    if (oldVersion < 1) database.createObjectStore("app");
    if (oldVersion < 2) database.createObjectStore("driveSync");
    if (oldVersion < 3) database.createObjectStore("geminiKey");
  },
});

export async function loadData(): Promise<AppData> {
  const db = await dbPromise;
  const saved = await db.get("app", "main");
  if (!saved) return emptyData();
  const data = parseBackup(saved);
  if (saved.schemaVersion !== 4) await db.put("app", data, "main");
  return data;
}

export async function saveData(data: AppData): Promise<void> {
  await (await dbPromise).put("app", data, "main");
}

export async function loadDriveSync(accountId: string) {
  return (await dbPromise).get("driveSync", accountId);
}

export async function saveDriveSync(
  accountId: string,
  sync: { snapshotId: string; contentHash: string },
) {
  await (await dbPromise).put("driveSync", sync, accountId);
}

export async function loadGeminiKey(): Promise<string | null> {
  return (await (await dbPromise).get("geminiKey", "current")) ?? null;
}

export async function saveGeminiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) throw new Error("Informe uma chave Gemini válida.");
  await (await dbPromise).put("geminiKey", trimmed, "current");
}

export async function removeGeminiKey(): Promise<void> {
  await (await dbPromise).delete("geminiKey", "current");
}
