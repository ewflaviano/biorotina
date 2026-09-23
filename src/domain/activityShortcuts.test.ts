import { describe, expect, it } from "vitest";
import type { ActivityEntry } from "./data";
import { activityShortcuts } from "./activityShortcuts";

function entry(name: string, createdAt: string): ActivityEntry {
  return {
    id: crypto.randomUUID(),
    name,
    durationMinutes: 30,
    caloriesKcal: null,
    occurredAt: createdAt,
    createdAt,
  };
}

describe("atalhos pessoais de atividade", () => {
  it("coloca atividades recentes antes das sugestões gerais, sem duplicar nomes", () => {
    const shortcuts = activityShortcuts([
      entry("Caminhada", "2026-01-01T12:00:00.000Z"),
      entry("Pilates", "2026-01-02T12:00:00.000Z"),
      entry("pilates", "2026-01-03T12:00:00.000Z"),
    ]);
    expect(shortcuts).toHaveLength(6);
    expect(shortcuts[0]).toMatchObject({
      name: "pilates",
      previous: { name: "pilates" },
    });
    expect(shortcuts[1].name).toBe("Caminhada");
    expect(
      shortcuts.filter((item) => item.name.toLowerCase() === "pilates"),
    ).toHaveLength(1);
    expect(shortcuts.some((item) => item.name === "Yoga")).toBe(true);
  });

  it("mantém atalhos gerais quando ainda não há histórico", () => {
    expect(activityShortcuts([]).map((item) => item.name)).toEqual([
      "Caminhada",
      "Corrida leve",
      "Musculação",
      "Yoga",
      "Bicicleta",
      "Boxe (saco)",
    ]);
  });
});
