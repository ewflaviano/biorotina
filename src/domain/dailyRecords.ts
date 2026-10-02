import {
  inputDecimal,
  todayIsoDate,
  toLocalDateTime,
  type AppData,
} from "./data";

export type DailyRecordKind =
  "weight" | "activity" | "meal" | "hydration" | "medication" | "habit";

export interface DailyRecord {
  id: string;
  kind: DailyRecordKind;
  title: string;
  at: string;
}

export function isSelectableCalendarDay(
  day: unknown,
  today = todayIsoDate(),
): day is string {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const [year, month, date] = day.split("-").map(Number);
  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, date);
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() + 1 === month &&
    parsed.getUTCDate() === date &&
    day <= today
  );
}

export function formatCalendarDay(day: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${day}T12:00:00`));
}

export function summaryForDay(data: AppData, day: string) {
  const onDay = (at: string) => toLocalDateTime(at).slice(0, 10) === day;
  const weight = data.weights
    .filter((item) => onDay(item.measuredAt))
    .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt))[0];
  return {
    weight,
    activities: data.activities.filter((item) => onDay(item.occurredAt)),
    meals: data.meals.filter((item) => onDay(item.eatenAt)),
    medicationLogs: data.medicationLogs.filter((item) => onDay(item.takenAt)),
    habitLogs: data.habitLogs.filter((item) => onDay(item.completedAt)),
    hydrationEntries: data.hydrationEntries.filter((item) =>
      onDay(item.drankAt),
    ),
  };
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

export function lastRecordedDayBefore(
  data: AppData,
  day: string,
): string | null {
  let latest: string | null = null;
  for (const recordedDay of recordedDays(data)) {
    if (recordedDay < day && (latest === null || recordedDay > latest))
      latest = recordedDay;
  }
  return latest;
}

export function firstRecordedDayAfter(
  data: AppData,
  day: string,
  today = todayIsoDate(),
): string | null {
  let earliest: string | null = null;
  for (const recordedDay of recordedDays(data)) {
    if (
      recordedDay > day &&
      recordedDay <= today &&
      (earliest === null || recordedDay < earliest)
    )
      earliest = recordedDay;
  }
  return earliest;
}

function recordedDays(data: AppData): string[] {
  return [
    ...data.weights.map((item) => item.measuredAt),
    ...data.activities.map((item) => item.occurredAt),
    ...data.meals.map((item) => item.eatenAt),
    ...data.hydrationEntries.map((item) => item.drankAt),
    ...data.medicationLogs.map((item) => item.takenAt),
    ...data.habitLogs.map((item) => item.completedAt),
  ].map((at) => toLocalDateTime(at).slice(0, 10));
}

export function shiftCalendarDay(day: string, offset: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(0);
  next.setUTCHours(12, 0, 0, 0);
  next.setUTCFullYear(year, month - 1, date + offset);
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}
