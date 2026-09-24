import { type AppData } from "../domain/data";

const recordCollections = [
  "weights",
  "activities",
  "meals",
  "medications",
  "medicationLogs",
  "habits",
  "habitLogs",
  "hydrationEntries",
] as const;

type RecordCollection = (typeof recordCollections)[number];

function mergeRecords<K extends RecordCollection>(
  preferred: AppData[K],
  incoming: AppData[K],
): { records: AppData[K]; added: number; differing: number } {
  const byId = new Map(preferred.map((item) => [item.id, item]));
  const records = [...preferred];
  let added = 0;
  let differing = 0;
  for (const item of incoming) {
    const existing = byId.get(item.id);
    if (!existing) {
      records.push(item);
      byId.set(item.id, item);
      added += 1;
    } else if (JSON.stringify(existing) !== JSON.stringify(item)) {
      differing += 1;
    }
  }
  return { records: records as AppData[K], added, differing };
}

/** Keeps the preferred version when one record ID has different contents. */
export function mergeAppData(preferred: AppData, incoming: AppData) {
  const merged: AppData = { ...preferred };
  let added = 0;
  let differing = 0;
  for (const collection of recordCollections) {
    const result = mergeRecords(preferred[collection], incoming[collection]);
    // Each collection has its own entry type; the runtime keys are fixed above.
    Object.assign(merged, { [collection]: result.records });
    added += result.added;
    differing += result.differing;
  }
  merged.profile = {
    displayName: preferred.profile.displayName || incoming.profile.displayName,
    heightCm: preferred.profile.heightCm ?? incoming.profile.heightCm,
  };
  merged.hydrationReminderTimes =
    preferred.hydrationReminderTimes.length > 0
      ? preferred.hydrationReminderTimes
      : incoming.hydrationReminderTimes;
  const changed =
    added > 0 ||
    JSON.stringify(merged.profile) !== JSON.stringify(preferred.profile) ||
    JSON.stringify(merged.hydrationReminderTimes) !==
      JSON.stringify(preferred.hydrationReminderTimes);
  return { data: merged, added, differing, changed };
}
