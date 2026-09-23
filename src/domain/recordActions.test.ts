import { describe, expect, it } from "vitest";
import { emptyData } from "./data";
import {
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
    };
    const second = {
      id: crypto.randomUUID(),
      createdAt: now,
      name: "B",
      dose: 2,
      unit: "mg",
      reminderTimes: [],
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
