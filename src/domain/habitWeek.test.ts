import { describe, expect, it } from "vitest";
import { type Habit, type HabitLog } from "./data";
import { habitWeekDays, habitWeekRows, startOfHabitWeek } from "./habitWeek";

function localIso(year: number, month: number, day: number, hour = 12) {
  return new Date(year, month - 1, day, hour).toISOString();
}

const habit: Habit = {
  id: crypto.randomUUID(),
  name: "Ler",
  createdAt: localIso(2026, 9, 30),
  reminderTimes: [],
  reminderWeekdays: [0, 1, 2, 3, 4, 5, 6],
};

function log(day: number, hour = 12): HabitLog {
  return {
    id: crypto.randomUUID(),
    habitId: habit.id,
    completedAt: localIso(2026, 10, day, hour),
    createdAt: localIso(2026, 10, day, hour),
  };
}

describe("visão semanal de hábitos", () => {
  it("começa na segunda e cruza mês e ano sem depender do fuso UTC", () => {
    expect(startOfHabitWeek("2026-10-04")).toBe("2026-09-28");
    expect(habitWeekDays("2026-12-28")).toEqual([
      "2026-12-28",
      "2026-12-29",
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-03",
    ]);
    expect(startOfHabitWeek("2027-01-03")).toBe("2026-12-28");
  });

  it("agrupa pelo dia local, conta lançamentos e distingue estados", () => {
    const rows = habitWeekRows(
      [habit],
      [log(1, 23), log(2, 8), log(2, 21)],
      "2026-09-28",
      "2026-10-03",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].recordedDays).toBe(2);
    expect(rows[0].days.map(({ state }) => state)).toEqual([
      "before-created",
      "before-created",
      "unrecorded",
      "recorded",
      "recorded",
      "unrecorded",
      "future",
    ]);
    expect(rows[0].days[4].count).toBe(2);
  });

  it("mantém um registro retroativo anterior ao cadastro visível", () => {
    const retroactive: HabitLog = {
      id: crypto.randomUUID(),
      habitId: habit.id,
      completedAt: localIso(2026, 9, 29),
      createdAt: localIso(2026, 10, 1),
    };
    const rows = habitWeekRows(
      [habit],
      [retroactive],
      "2026-09-28",
      "2026-10-04",
    );
    expect(rows[0].days[1].state).toBe("recorded");
    expect(rows[0].recordedDays).toBe(1);
  });

  it("não expõe logs de dias futuros como lançamentos navegáveis", () => {
    const rows = habitWeekRows([habit], [log(4)], "2026-09-28", "2026-10-03");
    expect(rows[0].days[6].state).toBe("future");
    expect(rows[0].recordedDays).toBe(0);
  });
});
