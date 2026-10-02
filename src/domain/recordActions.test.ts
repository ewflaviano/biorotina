import { describe, expect, it } from "vitest";
import { emptyData, parseBackup } from "./data";
import {
  editHydrationEntry,
  removeEntry,
  removeMedication,
  restoreEntry,
  restoreMedication,
} from "./recordActions";

describe("remoção e restauração de registros", () => {
  it("remove só a entrada escolhida e pode restaurá-la sem duplicar", () => {
    const data = emptyData();
    const now = new Date().toISOString();
    const first = {
      id: crypto.randomUUID(),
      createdAt: now,
      drankAt: now,
      amountMl: 250,
    };
    const second = {
      id: crypto.randomUUID(),
      createdAt: now,
      drankAt: now,
      amountMl: 500,
    };
    data.hydrationEntries = [first, second];
    const removed = removeEntry(data, "hydrationEntries", first.id);
    expect(removed.hydrationEntries).toEqual([second]);
    expect(data.hydrationEntries).toEqual([first, second]);
    expect(removeEntry(removed, "hydrationEntries", first.id)).toBe(removed);
    const restored = restoreEntry(removed, "hydrationEntries", first);
    expect(restored.hydrationEntries).toEqual([first, second]);
    expect(restoreEntry(restored, "hydrationEntries", first)).toBe(restored);
  });

  it("remove medicamento e registros de uso ligados, preservando os demais", () => {
    const data = emptyData();
    const now = new Date().toISOString();
    const first = {
      id: crypto.randomUUID(),
      createdAt: now,
      name: "A",
      dose: 1,
      unit: "mg",
      reminderTimes: [],
      reminderWeekdays: [0, 1, 2, 3, 4, 5, 6],
    };
    const second = {
      id: crypto.randomUUID(),
      createdAt: now,
      name: "B",
      dose: 2,
      unit: "mg",
      reminderTimes: [],
      reminderWeekdays: [0, 1, 2, 3, 4, 5, 6],
    };
    const firstLog = {
      id: crypto.randomUUID(),
      createdAt: now,
      takenAt: now,
      medicationId: first.id,
    };
    const secondLog = {
      id: crypto.randomUUID(),
      createdAt: now,
      takenAt: now,
      medicationId: second.id,
    };
    data.medications = [first, second];
    data.medicationLogs = [firstLog, secondLog];
    const removed = removeMedication(data, first.id);
    expect(removed.medications).toEqual([second]);
    expect(removed.medicationLogs).toEqual([secondLog]);
    const restored = restoreMedication(removed, first, [firstLog]);
    expect(restored.medications).toEqual([first, second]);
    expect(restored.medicationLogs).toEqual([firstLog, secondLog]);
    expect(restoreMedication(restored, first, [firstLog])).toBe(restored);
  });
});

describe("edição de hidratação", () => {
  const original = {
    id: "00000000-0000-4000-8000-000000000001",
    createdAt: "2026-09-30T10:00:00.000Z",
    drankAt: "2026-09-30T10:00:00.000Z",
    amountMl: 250,
  };

  it("atualiza a entrada pelo mesmo id e preserva o backup JSON", () => {
    const data = emptyData();
    data.hydrationEntries = [original];
    const updated = editHydrationEntry(
      data,
      original,
      350,
      "2026-10-01T09:00:00.000Z",
    );
    expect(updated.hydrationEntries).toEqual([
      { ...original, amountMl: 350, drankAt: "2026-10-01T09:00:00.000Z" },
    ]);
    expect(data.hydrationEntries).toEqual([original]);
    expect(parseBackup(JSON.parse(JSON.stringify(updated)))).toEqual(updated);
    expect(
      editHydrationEntry(
        updated,
        updated.hydrationEntries[0],
        350,
        updated.hydrationEntries[0].drankAt,
      ),
    ).toBe(updated);
  });

  it("recusa exclusão ou alteração concorrente da mesma entrada", () => {
    const data = emptyData();
    data.hydrationEntries = [original];
    expect(() =>
      editHydrationEntry(data, original, 300, "2026-10-01T09:00:00.000Z"),
    ).not.toThrow();
    expect(() =>
      editHydrationEntry(
        { ...data, hydrationEntries: [] },
        original,
        300,
        original.drankAt,
      ),
    ).toThrow("Este registro mudou");
    expect(() =>
      editHydrationEntry(
        { ...data, hydrationEntries: [{ ...original, amountMl: 400 }] },
        original,
        300,
        original.drankAt,
      ),
    ).toThrow("Este registro mudou");
  });

  it("valida volume e horário também no domínio", () => {
    const data = emptyData();
    data.hydrationEntries = [original];
    expect(() =>
      editHydrationEntry(data, original, 0, original.drankAt),
    ).toThrow();
    expect(() =>
      editHydrationEntry(data, original, 10_001, original.drankAt),
    ).toThrow();
    expect(() =>
      editHydrationEntry(data, original, 300, "data inválida"),
    ).toThrow();
  });
});
