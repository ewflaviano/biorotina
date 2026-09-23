import { describe, expect, it } from "vitest";
import {
  activityCatalog,
  activitySourceUrl,
  caloriesPerMinute,
  estimateActivityCalories,
  findCatalogActivity,
} from "./activityCatalog";

describe("catálogo de atividades e estimativa", () => {
  it("oferece atividades distintas com código e MET válidos", () => {
    expect(activityCatalog.length).toBeGreaterThanOrEqual(50);
    expect(new Set(activityCatalog.map((item) => item.name)).size).toBe(
      activityCatalog.length,
    );
    expect(new Set(activityCatalog.map((item) => item.code)).size).toBe(
      activityCatalog.length,
    );
    expect(activityCatalog.every((item) => item.met > 0)).toBe(true);
    expect(findCatalogActivity("  YOGA ")?.code).toBe("02175");
    expect(findCatalogActivity("boxe (saco)")?.met).toBe(5.8);
    expect(findCatalogActivity("Minha atividade")).toBeNull();
    expect(activitySourceUrl(findCatalogActivity("Caminhada")!)).toBe(
      "https://pacompendium.com/walking/",
    );
  });

  it("converte MET em kcal/min pelo peso e arredonda apenas o total sugerido", () => {
    const walking = findCatalogActivity("Caminhada");
    expect(caloriesPerMinute(3.8, 70)).toBeCloseTo(4.655, 3);
    expect(estimateActivityCalories(walking, 30, 70)).toBe(140);
    expect(estimateActivityCalories(walking, 30, 80)).toBe(160);
    expect(estimateActivityCalories(walking, 0, 70)).toBeNull();
    expect(estimateActivityCalories(null, 30, 70)).toBeNull();
    expect(estimateActivityCalories(walking, 30, -70)).toBeNull();
  });
});
