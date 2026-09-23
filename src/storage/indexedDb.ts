import { openDB, type DBSchema } from "idb";
import { emptyData, parseBackup, type AppData } from "../domain/data";

interface BiorotinaDb extends DBSchema {
  app: { key: "main"; value: AppData | Record<string, unknown> };
  driveSync: {
    key: string;
    value: { snapshotId: string; contentHash: string };
  };
}

const dbPromise = openDB<BiorotinaDb>("biorotina", 2, {
  upgrade(database, oldVersion) {
    if (oldVersion < 1) database.createObjectStore("app");
    if (oldVersion < 2) database.createObjectStore("driveSync");
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

export async function loadDriveSync(accountId: string) {
  return (await dbPromise).get("driveSync", accountId);
}

export async function saveDriveSync(
  accountId: string,
  sync: { snapshotId: string; contentHash: string },
) {
  await (await dbPromise).put("driveSync", sync, accountId);
}
