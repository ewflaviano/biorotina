import type {
  AppData,
  Habit,
  HabitLog,
  HydrationEntry,
  Medication,
  MedicationLog,
  WeightEntry,
} from "./data";
import { hydrationSchema, weightSchema, MAX_WEIGHT_KG } from "./data";

export type EntryCollection =
  | "weights"
  | "activities"
  | "meals"
  | "hydrationEntries"
  | "medicationLogs"
  | "habitLogs";

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

export function editHydrationEntry(
  data: AppData,
  original: HydrationEntry,
  amountMl: number,
  drankAt: string,
): AppData {
  const index = data.hydrationEntries.findIndex(
    (entry) => entry.id === original.id,
  );
  const current = data.hydrationEntries[index];
  if (
    !current ||
    current.createdAt !== original.createdAt ||
    current.amountMl !== original.amountMl ||
    current.drankAt !== original.drankAt
  ) {
    throw new Error("Este registro mudou. Feche a edição e abra novamente.");
  }
  const updated = hydrationSchema.parse({ ...current, amountMl, drankAt });
  if (
    updated.amountMl === current.amountMl &&
    updated.drankAt === current.drankAt
  )
    return data;
  const hydrationEntries = [...data.hydrationEntries];
  hydrationEntries[index] = updated;
  return { ...data, hydrationEntries };
}

export function editWeightEntry(
  data: AppData,
  original: WeightEntry,
  weightKg: number,
  measuredAt: string,
  note: string,
): AppData {
  const index = data.weights.findIndex((entry) => entry.id === original.id);
  const current = data.weights[index];
  if (
    !current ||
    current.createdAt !== original.createdAt ||
    current.weightKg !== original.weightKg ||
    current.measuredAt !== original.measuredAt ||
    current.note !== original.note
  ) {
    throw new Error("Esta medida mudou. Feche a edição e abra novamente.");
  }
  if (weightKg > MAX_WEIGHT_KG)
    throw new Error(`Confira o peso: o máximo aceito é ${MAX_WEIGHT_KG} kg.`);
  const updated = weightSchema.parse({
    ...current,
    weightKg,
    measuredAt,
    note,
  });
  if (
    updated.weightKg === current.weightKg &&
    updated.measuredAt === current.measuredAt &&
    updated.note === current.note
  )
    return data;
  const weights = [...data.weights];
  weights[index] = updated;
  return { ...data, weights };
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

export function removeHabit(data: AppData, id: string): AppData {
  if (!data.habits.some((item) => item.id === id)) return data;
  return {
    ...data,
    habits: data.habits.filter((item) => item.id !== id),
    habitLogs: data.habitLogs.filter((item) => item.habitId !== id),
  };
}

export function restoreHabit(
  data: AppData,
  habit: Habit,
  logs: HabitLog[],
): AppData {
  if (data.habits.some((item) => item.id === habit.id)) return data;
  const existing = new Set(data.habitLogs.map((item) => item.id));
  return {
    ...data,
    habits: [habit, ...data.habits],
    habitLogs: [
      ...logs.filter((item) => !existing.has(item.id)),
      ...data.habitLogs,
    ],
  };
}
