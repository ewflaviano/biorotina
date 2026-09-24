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

const GLOBAL_EPOCH_KEY = "__session-epoch";

function scopeEpochKey(accountId: string | null): string {
  return `__session-epoch:${dataKey(accountId)}`;
}

function sessionEpoch(value: AppData | Record<string, unknown> | undefined) {
  return value && "epoch" in value && typeof value.epoch === "string"
    ? value.epoch
    : "initial";
}

export class StaleRevisionError extends Error {}
export class SessionInvalidatedError extends Error {}

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
  if (saved.schemaVersion !== 6) await db.put("app", data, key);
  return data;
}

export async function loadDataState(accountId: string | null = null) {
  const tx = (await dbPromise).transaction("app", "readonly");
  const app = tx.objectStore("app");
  const [saved, globalMarker, scopeMarker] = await Promise.all([
    app.get(dataKey(accountId)),
    app.get(GLOBAL_EPOCH_KEY),
    app.get(scopeEpochKey(accountId)),
  ]);
  await tx.done;
  return {
    data: saved ? parseBackup(saved) : emptyData(),
    epoch: `${sessionEpoch(globalMarker)}:${sessionEpoch(scopeMarker)}`,
  };
}

export async function saveData(
  data: AppData,
  accountId: string | null = null,
): Promise<void> {
  await (await dbPromise).put("app", data, dataKey(accountId));
}

export async function saveDataIfRevision(
  data: AppData,
  expectedRevision: number,
  expectedEpoch: string,
  accountId: string | null = null,
): Promise<void> {
  const tx = (await dbPromise).transaction("app", "readwrite");
  const app = tx.objectStore("app");
  const [saved, globalMarker, scopeMarker] = await Promise.all([
    app.get(dataKey(accountId)),
    app.get(GLOBAL_EPOCH_KEY),
    app.get(scopeEpochKey(accountId)),
  ]);
  if (
    `${sessionEpoch(globalMarker)}:${sessionEpoch(scopeMarker)}` !==
    expectedEpoch
  ) {
    await tx.done;
    throw new SessionInvalidatedError("A sessão foi encerrada em outra aba.");
  }
  const revision = saved ? parseBackup(saved).revision : 0;
  if (revision !== expectedRevision) {
    await tx.done;
    throw new StaleRevisionError("Os registros mudaram em outra aba.");
  }
  await app.put(data, dataKey(accountId));
  await tx.done;
}

export async function clearAccountData(accountId: string): Promise<string> {
  const epoch = crypto.randomUUID();
  const tx = (await dbPromise).transaction(
    ["app", "driveSync", "geminiKey"],
    "readwrite",
  );
  await Promise.all([
    tx.objectStore("app").delete(dataKey(accountId)),
    tx.objectStore("app").put({ epoch }, scopeEpochKey(accountId)),
    tx.objectStore("driveSync").delete(accountId),
    tx.objectStore("geminiKey").clear(),
  ]);
  await tx.done;
  return epoch;
}

export async function clearLocalData(): Promise<string> {
  const epoch = crypto.randomUUID();
  const tx = (await dbPromise).transaction(
    ["app", "driveSync", "geminiKey"],
    "readwrite",
  );
  await Promise.all([
    tx.objectStore("app").clear(),
    tx.objectStore("driveSync").clear(),
    tx.objectStore("geminiKey").clear(),
  ]);
  await tx.objectStore("app").put({ epoch }, GLOBAL_EPOCH_KEY);
  await tx.done;
  return epoch;
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
