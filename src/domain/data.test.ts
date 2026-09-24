import { describe, expect, it } from "vitest";
import {
  appDataSchema,
  bmi,
  bmiCategory,
  emptyData,
  inputDecimal,
  isToday,
  numberPt,
  parseBackup,
  parseDecimal,
  parseOptionalCalories,
  todayIsoDate,
  totalRecords,
  toLocalDateTime,
  validateAnthropometrics,
} from "./data";

describe("modelo e backup", () => {
  it("cria um documento vazio com versão explícita e sem dados pessoais", () => {
    const data = emptyData();
    expect(data.schemaVersion).toBe(4);
    expect(data.profile).toEqual({ displayName: "", heightCm: null });
    expect(totalRecords(data)).toBe(0);
    expect(appDataSchema.parse(data)).toEqual(data);
  });

  it("aceita um backup válido e contabiliza todos os tipos de registro", () => {
    const data = emptyData();
    data.weights.push({
      id: crypto.randomUUID(),
      weightKg: 72.4,
      measuredAt: new Date().toISOString(),
      note: "",
      createdAt: new Date().toISOString(),
    });
    data.activities.push({
      id: crypto.randomUUID(),
      name: "Caminhada",
      durationMinutes: 35,
      caloriesKcal: null,
      occurredAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    data.meals.push({
      id: crypto.randomUUID(),
      name: "Almoço",
      caloriesKcal: 400,
      foods: [],
      photoAssisted: false,
      eatenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    data.medications.push({
      id: crypto.randomUUID(),
      name: "Exemplo",
      dose: 10,
      unit: "mg",
      reminderTimes: ["08:00"],
      createdAt: new Date().toISOString(),
    });
    data.medicationLogs.push({
      id: crypto.randomUUID(),
      medicationId: data.medications[0].id,
      takenAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    data.hydrationEntries.push({
      id: crypto.randomUUID(),
      amountMl: 250,
      drankAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    data.hydrationReminderTimes.push("09:00", "14:00");
    expect(totalRecords(parseBackup(JSON.parse(JSON.stringify(data))))).toBe(6);
  });

  it("migra backup da versão 1 sem perder registros anteriores", () => {
    const data = emptyData();
    data.profile.displayName = "Ana";
    const oldData = Object.fromEntries(
      Object.entries(data).filter(([key]) => !key.startsWith("hydration")),
    );
    const migrated = parseBackup({ ...oldData, schemaVersion: 1 });
    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.profile.displayName).toBe("Ana");
    expect(migrated.hydrationEntries).toEqual([]);
    expect(migrated.hydrationReminderTimes).toEqual([]);
  });

  it("preserva o horário do medicamento ao migrar um backup da versão 2", () => {
    const current = emptyData();
    const old = {
      ...current,
      schemaVersion: 2,
      medications: [
        {
          id: crypto.randomUUID(),
          name: "Exemplo",
          dose: 1,
          unit: "comprimido",
          scheduleTime: "08:15",
          createdAt: new Date().toISOString(),
        },
      ],
    };
    expect(parseBackup(old).medications[0].reminderTimes).toEqual(["08:15"]);
  });

  it("migra refeições da versão 3 sem inventar alimentos ou análise por foto", () => {
    const current = emptyData();
    const date = new Date().toISOString();
    const old = {
      ...current,
      schemaVersion: 3,
      meals: [
        {
          id: crypto.randomUUID(),
          name: "Jantar",
          caloriesKcal: 330,
          eatenAt: date,
          createdAt: date,
        },
      ],
    };
    expect(parseBackup(old).meals[0]).toMatchObject({
      name: "Jantar",
      foods: [],
      photoAssisted: false,
    });
  });

  it("rejeita versões futuras para evitar interpretar um formato desconhecido", () => {
    expect(() => parseBackup({ ...emptyData(), schemaVersion: 5 })).toThrow();
  });

  it("rejeita valores de saúde impossíveis ou malformados na importação", () => {
    const base = emptyData();
    const date = new Date().toISOString();
    expect(() =>
      parseBackup({
        ...base,
        weights: [
          {
            id: crypto.randomUUID(),
            weightKg: -4,
            measuredAt: date,
            note: "",
            createdAt: date,
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      parseBackup({
        ...base,
        medications: [
          {
            id: crypto.randomUUID(),
            name: "X",
            dose: 0,
            unit: "mg",
            reminderTimes: ["25:00"],
            createdAt: date,
          },
        ],
      }),
    ).toThrow();
    expect(() => parseBackup({ ...base, updatedAt: "ontem" })).toThrow();
    expect(() =>
      parseBackup({ ...base, hydrationReminderTimes: ["25:00"] }),
    ).toThrow();
    expect(() =>
      parseBackup({ ...base, hydrationReminderTimes: ["09:00", "09:00"] }),
    ).toThrow();
    expect(() =>
      parseBackup({
        ...base,
        hydrationEntries: [
          {
            id: crypto.randomUUID(),
            amountMl: -1,
            drankAt: date,
            createdAt: date,
          },
        ],
      }),
    ).toThrow();
  });
});

describe("cálculos e entrada numérica", () => {
  it("calcula IMC apenas com altura válida", () => {
    expect(bmi(72, 180)).toBeCloseTo(22.22, 2);
    expect(bmi(72, null)).toBeNull();
    expect(bmi(72, 0)).toBeNull();
    expect(bmi(400, 180)).toBeNull();
    expect(bmi(72, 300)).toBeNull();
  });

  it("classifica IMC adulto em cada limite oficial", () => {
    expect(bmiCategory(0)).toBeNull();
    expect(bmiCategory(18.49)).toBe("Abaixo do peso");
    expect(bmiCategory(18.5)).toBe("Peso adequado");
    expect(bmiCategory(24.99)).toBe("Peso adequado");
    expect(bmiCategory(25)).toBe("Sobrepeso");
    expect(bmiCategory(30)).toBe("Obesidade grau I");
    expect(bmiCategory(35)).toBe("Obesidade grau II");
    expect(bmiCategory(40)).toBe("Obesidade grau III");
  });

  it("bloqueia importação de medidas muito improváveis sem alterar os dados", () => {
    const data = emptyData();
    data.profile.heightCm = 300;
    expect(() => validateAnthropometrics(data)).toThrow(/altura/);
    data.profile.heightCm = 180;
    data.weights.push({
      id: crypto.randomUUID(),
      weightKg: 400,
      measuredAt: new Date().toISOString(),
      note: "",
      createdAt: new Date().toISOString(),
    });
    expect(() => validateAnthropometrics(data)).toThrow(/peso/);
    data.weights[0].weightKg = 350;
    expect(() => validateAnthropometrics(data)).not.toThrow();
  });

  it("aceita decimal com vírgula e rejeita valores vazios, negativos e infinitos", () => {
    expect(parseDecimal("72,4", "um peso")).toBe(72.4);
    expect(parseDecimal(" 35 ", "uma duração")).toBe(35);
    for (const input of ["", "0", "-1", "Infinity", "abc"])
      expect(() => parseDecimal(input, "um peso")).toThrow();
    expect(parseDecimal("0", "calorias", true)).toBe(0);
    expect(inputDecimal(0.125)).toBe("0,125");
    expect(parseDecimal(inputDecimal(0.125), "uma dose")).toBe(0.125);
  });

  it("diferencia calorias não informadas de zero informado", () => {
    expect(parseOptionalCalories("")).toBeNull();
    expect(parseOptionalCalories("0")).toBe(0);
    expect(parseOptionalCalories("180,5")).toBe(180.5);
  });

  it("usa formatação brasileira e compara o dia local", () => {
    expect(numberPt(72.4, 1)).toBe("72,4");
    expect(toLocalDateTime(new Date().toISOString()).slice(0, 10)).toBe(
      todayIsoDate(),
    );
    expect(isToday(new Date().toISOString())).toBe(true);
  });
});
