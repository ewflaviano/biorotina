import { inputDecimal, toLocalDateTime, type AppData } from "./data";

export type DailyRecordKind =
  "weight" | "activity" | "meal" | "hydration" | "medication" | "habit";

export interface DailyRecord {
  id: string;
  kind: DailyRecordKind;
  title: string;
  at: string;
}

export function recordsForDay(data: AppData, day: string): DailyRecord[] {
  const medicationNames = new Map(
    data.medications.map((medication) => [medication.id, medication.name]),
  );
  const habitNames = new Map(
    data.habits.map((habit) => [habit.id, habit.name]),
  );
  const all: DailyRecord[] = [
    ...data.weights.map((item) => ({
      id: item.id,
      kind: "weight" as const,
      title: `Peso · ${inputDecimal(item.weightKg)} kg`,
      at: item.measuredAt,
    })),
    ...data.activities.map((item) => ({
      id: item.id,
      kind: "activity" as const,
      title: `${item.name} · ${inputDecimal(item.durationMinutes)} min`,
      at: item.occurredAt,
    })),
    ...data.meals.map((item) => ({
      id: item.id,
      kind: "meal" as const,
      title: item.name,
      at: item.eatenAt,
    })),
    ...data.hydrationEntries.map((item) => ({
      id: item.id,
      kind: "hydration" as const,
      title: `Água · ${inputDecimal(item.amountMl)} ml`,
      at: item.drankAt,
    })),
    ...data.medicationLogs.map((item) => ({
      id: item.id,
      kind: "medication" as const,
      title: `${medicationNames.get(item.medicationId) ?? "Medicamento"} · uso registrado`,
      at: item.takenAt,
    })),
    ...data.habitLogs.map((item) => ({
      id: item.id,
      kind: "habit" as const,
      title: `${habitNames.get(item.habitId) ?? "Hábito"} · realizado`,
      at: item.completedAt,
    })),
  ];

  return all
    .filter((item) => toLocalDateTime(item.at).slice(0, 10) === day)
    .sort(
      (a, b) =>
        b.at.localeCompare(a.at) ||
        a.kind.localeCompare(b.kind) ||
        a.id.localeCompare(b.id),
    );
}

export function shiftCalendarDay(day: string, offset: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(0);
  next.setUTCHours(12, 0, 0, 0);
  next.setUTCFullYear(year, month - 1, date + offset);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}
