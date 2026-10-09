import { toLocalDateTime, type Habit, type HabitLog } from "./data";
import { shiftCalendarDay } from "./dailyRecords";

export type HabitWeekDay = {
  day: string;
  count: number;
  state: "recorded" | "unrecorded" | "before-created" | "future";
};

export type HabitWeekRow = {
  habit: Habit;
  recordedDays: number;
  days: HabitWeekDay[];
};

export function startOfHabitWeek(day: string): string {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return shiftCalendarDay(day, -((weekday + 6) % 7));
}

export function habitWeekDays(start: string): string[] {
  return Array.from({ length: 7 }, (_, index) =>
    shiftCalendarDay(start, index),
  );
}

export function habitWeekRows(
  habits: Habit[],
  logs: HabitLog[],
  weekStart: string,
  today: string,
): HabitWeekRow[] {
  const days = habitWeekDays(weekStart);
  const counts = new Map<string, Map<string, number>>();

  for (const log of logs) {
    const day = toLocalDateTime(log.completedAt).slice(0, 10);
    if (day < weekStart || day > days[6]) continue;
    let byDay = counts.get(log.habitId);
    if (!byDay) {
      byDay = new Map();
      counts.set(log.habitId, byDay);
    }
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  return habits.map((habit) => {
    const createdDay = toLocalDateTime(habit.createdAt).slice(0, 10);
    const habitDays = days.map((day): HabitWeekDay => {
      const count = counts.get(habit.id)?.get(day) ?? 0;
      return {
        day,
        count,
        state:
          day > today
            ? "future"
            : count > 0
              ? "recorded"
              : day < createdDay
                ? "before-created"
                : "unrecorded",
      };
    });
    return {
      habit,
      recordedDays: habitDays.filter((item) => item.state === "recorded")
        .length,
      days: habitDays,
    };
  });
}
