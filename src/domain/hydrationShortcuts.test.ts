import { describe, expect, it } from "vitest";
import { emptyData, parseBackup, hydrationQuickAmountsSchema } from "./data";
import {
  updateHydrationQuickAmounts,
  validateHydrationQuickAmounts,
} from "./hydrationShortcuts";

describe("atalhos de hidratação", () => {
  it.each(["", "0", "-1", "10001", "250.5", "250,5", "Infinity", "1e3"])(
    "recusa o volume %s",
    (invalid) => {
      const result = validateHydrationQuickAmounts([invalid, "400", "600"]);
      expect(result.amounts).toBeNull();
      expect(result.errors[0]).not.toBe("");
    },
  );

  it("identifica volumes duplicados e aceita os limites", () => {
    expect(validateHydrationQuickAmounts(["350", "350", "600"]).errors).toEqual(
      ["Use três volumes diferentes.", "Use três volumes diferentes.", ""],
    );
    expect(
      validateHydrationQuickAmounts(["1", "350", "10000"]).amounts,
    ).toEqual([1, 350, 10000]);
    expect(hydrationQuickAmountsSchema.safeParse([1, 1.5, 3]).success).toBe(
      false,
    );
    expect(hydrationQuickAmountsSchema.safeParse([200, 250]).success).toBe(
      false,
    );
  });

  it("migra v7 sem alterar seus registros e inclui os atalhos no JSON atual", () => {
    const data = emptyData();
    data.hydrationEntries = [
      {
        id: crypto.randomUUID(),
        createdAt: "2026-10-12T10:00:00Z",
        drankAt: "2026-10-12T10:00:00Z",
        amountMl: 350,
      },
    ];
    const legacy = Object.fromEntries(
      Object.entries(data).filter(([key]) => key !== "hydrationQuickAmounts"),
    );
    const migrated = parseBackup({ ...legacy, schemaVersion: 7 });
    expect(migrated.hydrationQuickAmounts).toBeNull();
    expect(migrated.hydrationEntries).toEqual(data.hydrationEntries);
    const configured = updateHydrationQuickAmounts(
      migrated,
      null,
      [350, 400, 600],
    );
    expect(parseBackup(JSON.parse(JSON.stringify(configured)))).toEqual(
      configured,
    );
    expect(() =>
      parseBackup({ ...configured, hydrationQuickAmounts: [350, 350, 600] }),
    ).toThrow();
  });

  it("preserva novas entradas e recusa edição concorrente dos atalhos", () => {
    const data = emptyData();
    data.hydrationQuickAmounts = [350, 400, 600];
    const configured = updateHydrationQuickAmounts(
      data,
      [350, 400, 600],
      [200, 250, 500],
    );
    expect(configured.hydrationEntries).toBe(data.hydrationEntries);
    expect(() =>
      updateHydrationQuickAmounts(configured, [350, 400, 600], [1, 2, 3]),
    ).toThrow("Os atalhos mudaram");
    expect(
      updateHydrationQuickAmounts(configured, [200, 250, 500], [200, 250, 500]),
    ).toBe(configured);
  });
});
