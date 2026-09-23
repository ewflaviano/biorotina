import type { AppData, Medication, MedicationLog } from "./data";

export type EntryCollection =
  "weights" | "activities" | "meals" | "hydrationEntries" | "medicationLogs";

export function removeEntry<K extends EntryCollection>(
  data: AppData,
  collection: K,
  id: string,
): AppData {
  const entries = data[collection];
  if (!entries.some((entry) => entry.id === id)) return data;
  return {
    ...data,
    [collection]: entries.filter((entry) => entry.id !== id),
  };
}

export function restoreEntry<K extends EntryCollection>(
  data: AppData,
  collection: K,
  entry: AppData[K][number],
): AppData {
  if (data[collection].some((current) => current.id === entry.id)) return data;
  return { ...data, [collection]: [entry, ...data[collection]] };
}

export function removeMedication(data: AppData, id: string): AppData {
  if (!data.medications.some((item) => item.id === id)) return data;
  return {
    ...data,
    medications: data.medications.filter((item) => item.id !== id),
    medicationLogs: data.medicationLogs.filter(
      (item) => item.medicationId !== id,
    ),
  };
}

export function restoreMedication(
  data: AppData,
  medication: Medication,
  logs: MedicationLog[],
): AppData {
  if (data.medications.some((item) => item.id === medication.id)) return data;
  const existingLogIds = new Set(data.medicationLogs.map((item) => item.id));
  return {
    ...data,
    medications: [medication, ...data.medications],
    medicationLogs: [
      ...logs.filter((item) => !existingLogIds.has(item.id)),
      ...data.medicationLogs,
    ],
  };
}
