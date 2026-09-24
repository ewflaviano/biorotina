import { openDB, type DBSchema } from "idb";
import {
  emptyData,
  parseBackup,
  totalRecords,
  type AppData,
} from "../domain/data";

interface BiorotinaDb extends DBSchema {
  app: { key: string; value: AppData | Record<string, unknown> };
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

function dataKey(accountId: string | null): string {
  return accountId ? `account:${accountId}` : "main";
}

export async function prepareAccountScopes(
  hadRememberedAccount: boolean,
): Promise<void> {
  const db = await dbPromise;
  const tx = db.transaction(["app", "driveSync"], "readwrite");
  const app = tx.objectStore("app");
  if (!(await app.get("__scoped-v1"))) {
    const syncedAccounts = await tx.objectStore("driveSync").getAllKeys();
    const oldData = await app.get("main");
    if (oldData && (hadRememberedAccount || syncedAccounts.length > 0)) {
      await app.put(oldData, "legacy-unassigned");
      await app.put(emptyData(), "main");
    }
    await app.put({ done: true }, "__scoped-v1");
  }
  await tx.done;
}

export async function loadLegacyData(): Promise<AppData | null> {
  const saved = await (await dbPromise).get("app", "legacy-unassigned");
  if (!saved) return null;
  const data = parseBackup(saved);
  return totalRecords(data) > 0 ||
    data.profile.displayName ||
    data.profile.heightCm ||
    data.hydrationReminderTimes.length
    ? data
    : null;
}

export async function loadData(
  accountId: string | null = null,
): Promise<AppData> {
  const db = await dbPromise;
  const key = dataKey(accountId);
  const saved = await db.get("app", key);
  if (!saved) return emptyData();
  const data = parseBackup(saved);
  if (saved.schemaVersion !== 4) await db.put("app", data, key);
  return data;
}

export async function loadOtherAccountData(
  currentAccountId: string,
): Promise<AppData[]> {
  const db = await dbPromise;
  const keys = await db.getAllKeys("app");
  const otherIds = keys
    .filter(
      (key): key is string =>
        typeof key === "string" &&
        key.startsWith("account:") &&
        key !== dataKey(currentAccountId),
    )
    .map((key) => key.slice("account:".length));
  return Promise.all(otherIds.map((id) => loadData(id)));
}

export async function saveData(
  data: AppData,
  accountId: string | null = null,
): Promise<void> {
  await (await dbPromise).put("app", data, dataKey(accountId));
}

export async function clearLocalData(): Promise<void> {
  const tx = (await dbPromise).transaction(
    ["app", "driveSync", "geminiKey"],
    "readwrite",
  );
  await Promise.all([
    tx.objectStore("app").clear(),
    tx.objectStore("driveSync").clear(),
    tx.objectStore("geminiKey").clear(),
  ]);
  await tx.done;
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
