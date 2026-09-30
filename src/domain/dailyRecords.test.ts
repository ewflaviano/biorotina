import { describe, expect, it } from "vitest";
import { emptyData, toLocalDateTime } from "./data";
import { recordsForDay, shiftCalendarDay } from "./dailyRecords";

function localIso(day: number, hour: number) {
  return new Date(2026, 8, day, hour, 15).toISOString();
}

describe("consulta de registros por dia", () => {
  it("reúne as seis áreas no dia local, da entrada mais recente para a antiga", () => {
    const data = emptyData();
    const id = () => crypto.randomUUID();
    const base = { createdAt: localIso(29, 8) };
    data.weights.push({
      ...base,
      id: id(),
      measuredAt: localIso(29, 8),
      weightKg: 72.4,
      note: "",
    });
    data.activities.push({
      ...base,
      id: id(),
      occurredAt: localIso(29, 9),
      name: "Caminhada",
      durationMinutes: 25,
      caloriesKcal: null,
    });
    data.meals.push({
      ...base,
      id: id(),
      eatenAt: localIso(29, 10),
      name: "Almoço",
      caloriesKcal: null,
      foods: [],
      photoAssisted: false,
    });
    data.hydrationEntries.push({
      ...base,
      id: id(),
      drankAt: localIso(29, 11),
      amountMl: 250,
    });
    data.medicationLogs.push({
      ...base,
      id: id(),
      takenAt: localIso(29, 12),
      medicationId: id(),
    });
    data.habitLogs.push({
      ...base,
      id: id(),
      completedAt: localIso(29, 13),
      habitId: id(),
    });
    data.weights.push({
      ...base,
      id: id(),
      measuredAt: localIso(30, 0),
      weightKg: 72.5,
      note: "",
    });
    const before = JSON.stringify(data);

    expect(recordsForDay(data, "2026-09-29").map((item) => item.kind)).toEqual([
      "habit",
      "medication",
      "hydration",
      "meal",
      "activity",
      "weight",
    ]);
    expect(recordsForDay(data, "2026-09-29")[1].title).toBe(
      "Medicamento · uso registrado",
    );
    expect(recordsForDay(data, "2026-09-29")[0].title).toBe(
      "Hábito · realizado",
    );
    expect(recordsForDay(data, "2026-09-30")).toHaveLength(1);
    expect(JSON.stringify(data)).toBe(before);
  });

  it("separa entradas de cada lado da meia-noite local", () => {
    const data = emptyData();
    data.hydrationEntries.push(
      {
        id: crypto.randomUUID(),
        createdAt: localIso(29, 23),
        drankAt: localIso(29, 23),
        amountMl: 200,
      },
      {
        id: crypto.randomUUID(),
        createdAt: localIso(30, 0),
        drankAt: localIso(30, 0),
        amountMl: 250,
      },
    );
    expect(toLocalDateTime(data.hydrationEntries[0].drankAt).slice(0, 10)).toBe(
      "2026-09-29",
    );
    expect(recordsForDay(data, "2026-09-29")).toHaveLength(1);
    expect(recordsForDay(data, "2026-09-30")).toHaveLength(1);
  });

  it("avança por datas de calendário, inclusive ano bissexto", () => {
    expect(shiftCalendarDay("2024-02-28", 1)).toBe("2024-02-29");
    expect(shiftCalendarDay("2024-03-01", -1)).toBe("2024-02-29");
    expect(shiftCalendarDay("2026-12-31", 1)).toBe("2027-01-01");
  });
});
