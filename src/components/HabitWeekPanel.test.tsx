import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type Habit, type HabitLog } from "../domain/data";
import { HabitWeekPanel } from "./HabitWeekPanel";

afterEach(() => vi.useRealTimers());

describe("painel semanal de hábitos", () => {
  it("abre o histórico do dia registrado e impede avanço além da semana atual", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 4, 12));
    const habit: Habit = {
      id: crypto.randomUUID(),
      name: "Ler",
      createdAt: new Date(2026, 8, 28, 12).toISOString(),
      reminderTimes: [],
      reminderWeekdays: [0, 1, 2, 3, 4, 5, 6],
    };
    const log: HabitLog = {
      id: crypto.randomUUID(),
      habitId: habit.id,
      completedAt: new Date(2026, 9, 2, 12).toISOString(),
      createdAt: new Date(2026, 9, 2, 12).toISOString(),
    };
    const onSelectDay = vi.fn();
    render(
      <HabitWeekPanel
        habits={[habit]}
        logs={[log]}
        onSelectDay={onSelectDay}
      />,
    );

    expect(screen.getByText("28 set – 4 out 2026")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Próxima semana" }),
    ).toBeDisabled();
    const group = screen.getByRole("group", { name: "Semana de Ler" });
    fireEvent.click(
      within(group).getByRole("button", {
        name: /sexta-feira, 2 de outubro de 2026: 1 registro/,
      }),
    );
    expect(onSelectDay).toHaveBeenCalledWith("2026-10-02");

    fireEvent.click(screen.getByRole("button", { name: "Semana anterior" }));
    expect(screen.getByText("21 set – 27 set 2026")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Próxima semana" }),
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Próxima semana" }));
    expect(screen.getByText("28 set – 4 out 2026")).toBeInTheDocument();
  });

  it("mostra orientação quando não há hábitos", () => {
    render(<HabitWeekPanel habits={[]} logs={[]} onSelectDay={vi.fn()} />);
    expect(
      screen.getByText(/Cadastre um hábito para conferir/),
    ).toBeInTheDocument();
  });
});
