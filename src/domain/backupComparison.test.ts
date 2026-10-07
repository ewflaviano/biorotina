import { describe, expect, it } from "vitest";
import { emptyData, parseBackup } from "./data";
import { compareBackup } from "./backupComparison";

const at = "2026-10-07T12:00:00.000Z";
const id = (last: number) =>
  `00000000-0000-4000-8000-${String(last).padStart(12, "0")}`;

function populatedData() {
  const data = emptyData();
  data.weights.push({
    id: id(1),
    createdAt: at,
    measuredAt: at,
    weightKg: 70,
    note: "",
  });
  data.activities.push({
    id: id(2),
    createdAt: at,
    occurredAt: at,
    name: "Exemplo",
    durationMinutes: 20,
    caloriesKcal: null,
  });
  data.meals.push({
    id: id(3),
    createdAt: at,
    eatenAt: at,
    name: "Exemplo",
    caloriesKcal: null,
    foods: [],
    photoAssisted: false,
  });
  data.hydrationEntries.push({
    id: id(4),
    createdAt: at,
    drankAt: at,
    amountMl: 250,
  });
  data.medications.push({
    id: id(5),
    createdAt: at,
    name: "Exemplo",
    dose: 1,
    unit: "unidade",
    reminderTimes: [],
    reminderWeekdays: [0, 1, 2, 3, 4, 5, 6],
  });
  data.medicationLogs.push({
    id: id(6),
    createdAt: at,
    medicationId: id(5),
    takenAt: at,
  });
  data.habits.push({
    id: id(7),
    createdAt: at,
    name: "Exemplo",
    reminderTimes: [],
    reminderWeekdays: [0, 1, 2, 3, 4, 5, 6],
  });
  data.habitLogs.push({
    id: id(8),
    createdAt: at,
    habitId: id(7),
    completedAt: at,
  });
  return data;
}

describe("comparação de backup", () => {
  it("inclui as oito categorias e distingue ausentes de registros alterados", () => {
    const local = populatedData();
    const incoming = structuredClone(local);
    incoming.weights[0].note = "Corrigido";
    incoming.hydrationEntries = [];
    incoming.activities.push({ ...incoming.activities[0], id: id(9) });
    incoming.profile.displayName = "Exemplo";
    incoming.hydrationReminderTimes = ["09:00"];

    const result = compareBackup(local, incoming);
    expect(result.categories).toHaveLength(8);
    expect(result.categories.map((category) => category.key)).toEqual([
      "weights",
      "activities",
      "meals",
      "hydrationEntries",
      "medications",
      "medicationLogs",
      "habits",
      "habitLogs",
    ]);
    expect(result).toMatchObject({
      localTotal: 8,
      incomingTotal: 8,
      onlyLocal: 1,
      onlyIncoming: 1,
      changed: 1,
      profileChanged: true,
      hydrationRemindersChanged: true,
    });
    expect(
      result.categories.find((category) => category.key === "weights"),
    ).toMatchObject({ changed: 1, onlyLocal: 0, onlyIncoming: 0 });
    expect(
      result.categories.find((category) => category.key === "hydrationEntries"),
    ).toMatchObject({ onlyLocal: 1 });
  });

  it("ignora a ordem das propriedades e aceita arquivo antigo migrado", () => {
    const local = populatedData();
    const legacy = Object.fromEntries(
      Object.entries(local).filter(
        ([key]) => key !== "habits" && key !== "habitLogs",
      ),
    );
    const incoming = parseBackup({ ...legacy, schemaVersion: 5 });
    incoming.weights[0] = {
      note: "",
      weightKg: 70,
      measuredAt: at,
      createdAt: at,
      id: id(1),
    };
    const result = compareBackup(local, incoming);
    expect(
      result.categories.find((category) => category.key === "weights")?.changed,
    ).toBe(0);
    expect(
      result.categories.find((category) => category.key === "habits")
        ?.onlyLocal,
    ).toBe(1);
    expect(
      result.categories.find((category) => category.key === "habitLogs")
        ?.onlyLocal,
    ).toBe(1);
  });

  it("não esconde registros quando um arquivo contém IDs duplicados", () => {
    const local = emptyData();
    const incoming = emptyData();
    const entry = { id: id(10), createdAt: at, drankAt: at, amountMl: 250 };
    local.hydrationEntries = [entry, { ...entry, amountMl: 300 }];
    incoming.hydrationEntries = [entry];
    expect(compareBackup(local, incoming)).toMatchObject({
      localTotal: 2,
      incomingTotal: 1,
      onlyLocal: 1,
      changed: 0,
    });
  });
});
