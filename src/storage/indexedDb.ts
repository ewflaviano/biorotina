import { openDB, type DBSchema } from "idb";
import { emptyData, parseBackup, type AppData } from "../domain/data";

interface BiorotinaDb extends DBSchema {
  app: { key: "main"; value: AppData | Record<string, unknown> };
}

const dbPromise = openDB<BiorotinaDb>("biorotina", 1, {
  upgrade(database) {
    database.createObjectStore("app");
  },
});

export async function loadData(): Promise<AppData> {
  const db = await dbPromise;
  const saved = await db.get("app", "main");
  if (!saved) return emptyData();
  const data = parseBackup(saved);
  if (saved.schemaVersion !== 3) await db.put("app", data, "main");
  return data;
}

export async function saveData(data: AppData): Promise<void> {
  await (await dbPromise).put("app", data, "main");
}
