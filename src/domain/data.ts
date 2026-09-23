import { z } from "zod";

const datedEntry = {
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
};

export const weightSchema = z
  .object({
    ...datedEntry,
    measuredAt: z.string().datetime(),
    weightKg: z.number().positive().finite(),
    note: z.string().max(500),
  })
  .strict();

export const activitySchema = z
  .object({
    ...datedEntry,
    occurredAt: z.string().datetime(),
    name: z.string().trim().min(1).max(100),
    durationMinutes: z.number().positive().finite(),
    caloriesKcal: z.number().nonnegative().finite().nullable(),
    caloriesSource: z.enum(["estimated", "manual"]).optional(),
  })
  .strict();

export const mealSchema = z
  .object({
    ...datedEntry,
    eatenAt: z.string().datetime(),
    name: z.string().trim().min(1).max(120),
    caloriesKcal: z.number().nonnegative().finite().nullable(),
  })
  .strict();

export const reminderTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const medicationV2Schema = z
  .object({
    ...datedEntry,
    name: z.string().trim().min(1).max(120),
    dose: z.number().positive().finite(),
    unit: z.string().trim().min(1).max(30),
    scheduleTime: reminderTimeSchema.nullable(),
  })
  .strict();

export const medicationSchema = medicationV2Schema
  .omit({ scheduleTime: true })
  .extend({
    reminderTimes: z
      .array(reminderTimeSchema)
      .max(48)
      .refine((times) => new Set(times).size === times.length),
  })
  .strict();

export const medicationLogSchema = z
  .object({
    ...datedEntry,
    medicationId: z.string().uuid(),
    takenAt: z.string().datetime(),
  })
  .strict();

export const hydrationSchema = z
  .object({
    ...datedEntry,
    drankAt: z.string().datetime(),
    amountMl: z.number().positive().finite().max(10_000),
  })
  .strict();

export const appDataSchema = z
  .object({
    schemaVersion: z.literal(3),
    revision: z.number().int().nonnegative(),
    updatedAt: z.string().datetime(),
    profile: z
      .object({
        displayName: z.string().max(80),
        heightCm: z.number().positive().finite().nullable(),
      })
      .strict(),
    weights: z.array(weightSchema),
    activities: z.array(activitySchema),
    meals: z.array(mealSchema),
    medications: z.array(medicationSchema),
    medicationLogs: z.array(medicationLogSchema),
    hydrationEntries: z.array(hydrationSchema),
    hydrationReminderTimes: z
      .array(reminderTimeSchema)
      .max(24)
      .refine((times) => new Set(times).size === times.length),
  })
  .strict();

const appDataV2Schema = appDataSchema
  .extend({
    schemaVersion: z.literal(2),
    medications: z.array(medicationV2Schema),
  })
  .strict();

const appDataV1Schema = appDataV2Schema
  .omit({ hydrationEntries: true, hydrationReminderTimes: true })
  .extend({ schemaVersion: z.literal(1) })
  .strict();

export type AppData = z.infer<typeof appDataSchema>;
export type WeightEntry = z.infer<typeof weightSchema>;
export type ActivityEntry = z.infer<typeof activitySchema>;
export type MealEntry = z.infer<typeof mealSchema>;
export type Medication = z.infer<typeof medicationSchema>;
export type MedicationLog = z.infer<typeof medicationLogSchema>;
export type HydrationEntry = z.infer<typeof hydrationSchema>;

export function emptyData(): AppData {
  return {
    schemaVersion: 3,
    revision: 0,
    updatedAt: new Date().toISOString(),
    profile: { displayName: "", heightCm: null },
    weights: [],
    activities: [],
    meals: [],
    medications: [],
    medicationLogs: [],
    hydrationEntries: [],
    hydrationReminderTimes: [],
  };
}

export function parseBackup(input: unknown): AppData {
  if (
    input !== null &&
    typeof input === "object" &&
    "schemaVersion" in input &&
    input.schemaVersion === 1
  ) {
    return migrateV2({
      ...appDataV1Schema.parse(input),
      schemaVersion: 2,
      hydrationEntries: [],
      hydrationReminderTimes: [],
    });
  }
  if (
    input !== null &&
    typeof input === "object" &&
    "schemaVersion" in input &&
    input.schemaVersion === 2
  ) {
    return migrateV2(appDataV2Schema.parse(input));
  }
  return appDataSchema.parse(input);
}

function migrateV2(input: z.infer<typeof appDataV2Schema>): AppData {
  return {
    ...input,
    schemaVersion: 3,
    medications: input.medications.map(({ scheduleTime, ...item }) => ({
      ...item,
      reminderTimes: scheduleTime ? [scheduleTime] : [],
    })),
  };
}

export function totalRecords(data: AppData): number {
  return (
    data.weights.length +
    data.activities.length +
    data.meals.length +
    data.medications.length +
    data.medicationLogs.length +
    data.hydrationEntries.length
  );
}

export const MAX_WEIGHT_KG = 350;
export const MIN_HEIGHT_CM = 50;
export const MAX_HEIGHT_CM = 250;

export function bmi(weightKg: number, heightCm: number | null): number | null {
  if (
    !Number.isFinite(weightKg) ||
    weightKg <= 0 ||
    weightKg > MAX_WEIGHT_KG ||
    heightCm === null ||
    !Number.isFinite(heightCm) ||
    heightCm < MIN_HEIGHT_CM ||
    heightCm > MAX_HEIGHT_CM
  )
    return null;
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

// Referência para adultos de 18 a 59 anos: Ministério da Saúde.
// https://linhasdecuidado.saude.gov.br/portal/obesidade-no-adulto/unidade-de-atencao-primaria/rastreamento-diagnostico/
export function bmiCategory(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value < 18.5) return "Abaixo do peso";
  if (value < 25) return "Peso adequado";
  if (value < 30) return "Sobrepeso";
  if (value < 35) return "Obesidade grau I";
  if (value < 40) return "Obesidade grau II";
  return "Obesidade grau III";
}

export function validateAnthropometrics(data: AppData): void {
  if (
    data.profile.heightCm !== null &&
    (data.profile.heightCm < MIN_HEIGHT_CM ||
      data.profile.heightCm > MAX_HEIGHT_CM)
  ) {
    throw new Error("O arquivo contém uma altura fora da faixa aceita.");
  }
  if (data.weights.some((item) => item.weightKg > MAX_WEIGHT_KG)) {
    throw new Error("O arquivo contém um peso fora da faixa aceita.");
  }
}

export function todayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function toLocalDateTime(iso: string): string {
  const date = new Date(iso);
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${day}T${time}`;
}

export function fromLocalDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Informe uma data válida.");
  return date.toISOString();
}

export const numberPt = (value: number, digits = 0) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: digits }).format(
    value,
  );
export const inputDecimal = (value: number) => String(value).replace(".", ",");
export const datePt = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
export const dateTimePt = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));

export function isToday(iso: string): boolean {
  return toLocalDateTime(iso).slice(0, 10) === todayIsoDate();
}

export function parseDecimal(
  value: string,
  label: string,
  allowZero = false,
): number {
  const parsed = Number(value.trim().replace(",", "."));
  if (
    !value.trim() ||
    !Number.isFinite(parsed) ||
    (allowZero ? parsed < 0 : parsed <= 0)
  ) {
    throw new Error(
      `Informe ${label} válido${allowZero ? "" : " maior que zero"}.`,
    );
  }
  return parsed;
}

export function parseOptionalCalories(value: string): number | null {
  return value.trim()
    ? parseDecimal(value, "um valor de calorias", true)
    : null;
}
