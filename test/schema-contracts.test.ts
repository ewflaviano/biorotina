import { describe, expect, it } from "vitest";
import { analysisSchema } from "../src/ai/gemini";
import { planStatusSchema } from "../src/billing/client";
import {
  appDataSchema,
  emptyData,
  parseBackup,
  reminderTimeSchema,
} from "../src/domain/data";

describe("contratos de dados", () => {
  it("aceita o documento atual salvo no navegador", () => {
    const data = emptyData();
    expect(appDataSchema.safeParse(data).success).toBe(true);
    expect(parseBackup(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it("rejeita campos extras e valores inválidos em backup importado", () => {
    expect(
      appDataSchema.safeParse({ ...emptyData(), source: "untrusted" }).success,
    ).toBe(false);
    expect(() =>
      parseBackup({
        ...emptyData(),
        profile: { displayName: "Ana", heightCm: "170" },
      }),
    ).toThrow();
    expect(reminderTimeSchema.safeParse("24:00").success).toBe(false);
  });

  it("migra o formato legado conhecido antes de entregar os dados ao app", () => {
    const current = emptyData();
    const legacy = Object.fromEntries(
      Object.entries(current).filter(
        ([key]) => !key.startsWith("hydration") && !key.startsWith("habit"),
      ),
    );
    const migrated = parseBackup({ ...legacy, schemaVersion: 1 });
    expect(migrated.schemaVersion).toBe(6);
    expect(appDataSchema.safeParse(migrated).success).toBe(true);
  });

  it("aceita somente a resposta estruturada da análise de refeição", () => {
    expect(
      analysisSchema.safeParse({
        description: "Arroz e feijão",
        foods: [{ name: "Arroz", amount: "3 colheres", caloriesKcal: 150 }],
      }).success,
    ).toBe(true);
    expect(
      analysisSchema.safeParse({
        description: "Arroz e feijão",
        foods: [{ name: "Arroz", amount: "3 colheres", caloriesKcal: -1 }],
      }).success,
    ).toBe(false);
  });

  it("aceita somente o estado de plano retornado pela API", () => {
    const valid = {
      active: false,
      cancelled: false,
      renewalActive: false,
      paidThrough: null,
      nextCharge: null,
      usedToday: 0,
      dailyLimit: 10,
      checkoutUrl: null,
      trialEnabled: true,
      trialUsed: 0,
      trialLimit: 5,
    };
    expect(planStatusSchema.safeParse(valid).success).toBe(true);
    expect(
      planStatusSchema.safeParse({ ...valid, dailyLimit: 0 }).success,
    ).toBe(false);
  });
});
