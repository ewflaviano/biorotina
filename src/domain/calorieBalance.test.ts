import { describe, expect, it } from "vitest";
import { emptyData } from "./data";
import { calorieBalanceForDay, restingCalories } from "./calorieBalance";

function at(day: string) {
  return new Date(`${day}T12:00:00`).toISOString();
}

describe("balanço calórico diário", () => {
  it("aplica os dois parâmetros da equação de Mifflin–St Jeor só para adultos", () => {
    expect(restingCalories(70, 170, 30, "female")).toBe(1452);
    expect(restingCalories(70, 170, 30, "male")).toBe(1618);
    expect(restingCalories(70, 170, 17, "female")).toBeNull();
    expect(restingCalories(70, 170, 101, "male")).toBeNull();
  });

  it("usa peso anterior ao dia e subtrai o MET de repouso da atividade estimada", () => {
    const data = emptyData();
    data.profile.heightCm = 170;
    data.weights = [
      {
        id: crypto.randomUUID(),
        createdAt: at("2026-10-06"),
        measuredAt: at("2026-10-06"),
        weightKg: 70,
        note: "",
      },
      {
        id: crypto.randomUUID(),
        createdAt: at("2026-10-08"),
        measuredAt: at("2026-10-08"),
        weightKg: 90,
        note: "",
      },
    ];
    data.meals = [
      {
        id: crypto.randomUUID(),
        createdAt: at("2026-10-07"),
        eatenAt: at("2026-10-07"),
        name: "Refeição",
        caloriesKcal: 1800,
        foods: [],
        photoAssisted: false,
      },
    ];
    data.activities = [
      {
        id: crypto.randomUUID(),
        createdAt: at("2026-10-07"),
        occurredAt: at("2026-10-07"),
        name: "Caminhada",
        durationMinutes: 30,
        caloriesKcal: 190,
        caloriesSource: "estimated",
      },
    ];
    const result = calorieBalanceForDay(data, "2026-10-07", 30, "female");
    expect(result.weightKg).toBe(70);
    expect(result.restingCalories).toBe(1452);
    expect(result.extraActivityCalories).toBe(Math.round(190 * (2.8 / 3.8)));
    expect(result.differenceCalories).toBe(
      1800 - 1452 - result.extraActivityCalories,
    );
  });

  it("não transforma refeições sem calorias em consumo zero nem inclui atividade manual ambígua", () => {
    const data = emptyData();
    data.profile.heightCm = 170;
    data.weights = [
      {
        id: crypto.randomUUID(),
        createdAt: at("2026-10-07"),
        measuredAt: at("2026-10-07"),
        weightKg: 70,
        note: "",
      },
    ];
    data.meals = [
      {
        id: crypto.randomUUID(),
        createdAt: at("2026-10-07"),
        eatenAt: at("2026-10-07"),
        name: "Sem valor",
        caloriesKcal: null,
        foods: [],
        photoAssisted: false,
      },
    ];
    data.activities = [
      {
        id: crypto.randomUUID(),
        createdAt: at("2026-10-07"),
        occurredAt: at("2026-10-07"),
        name: "Caminhada",
        durationMinutes: 30,
        caloriesKcal: 200,
        caloriesSource: "manual",
      },
    ];
    const result = calorieBalanceForDay(data, "2026-10-07", 30, "female");
    expect(result.mealsWithCalories).toBe(0);
    expect(result.activitiesWithEstimate).toBe(0);
    expect(result.differenceCalories).toBeNull();
    data.meals[0].caloriesKcal = 500;
    expect(
      calorieBalanceForDay(data, "2026-10-07", 30, "female").differenceCalories,
    ).toBe(500 - 1452);
  });
});
