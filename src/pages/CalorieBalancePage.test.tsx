import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyData, todayIsoDate, type AppData } from "../domain/data";
import { shiftCalendarDay } from "../domain/dailyRecords";
import { CalorieBalancePage } from "./CalorieBalancePage";
import { MorePage } from "./MorePage";

const state = vi.hoisted(() => ({
  data: null as AppData | null,
  enabled: false,
}));
const recordUse = vi.hoisted(() => vi.fn());
vi.mock("../state/AppDataContext", () => ({
  useAppData: () => ({ data: state.data }),
}));
vi.mock("../experiments/ExperimentContext", () => ({
  useExperimentExposure: vi.fn(),
  useExperiment: () => ({
    enabled: (key: string) => key === "calorie-balance-daily" && state.enabled,
    recordUse,
  }),
}));

beforeEach(() => {
  state.data = emptyData();
  state.enabled = false;
  recordUse.mockClear();
});

describe("tela experimental de balanço calórico", () => {
  it("mostra o link em Mais somente para o braço experimental", () => {
    const view = render(
      <MemoryRouter>
        <MorePage />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("link", { name: /Balanço calórico/ })).toBeNull();
    state.enabled = true;
    view.rerender(
      <MemoryRouter>
        <MorePage />
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("link", { name: /Balanço calórico/ }),
    ).toHaveAttribute("href", "/balanco-calorico");
    fireEvent.click(screen.getByRole("link", { name: /Balanço calórico/ }));
    expect(recordUse).toHaveBeenCalledWith("calorie-balance-daily");
  });

  it("calcula o dia com parâmetros transitórios e atualiza ao trocar data", () => {
    const today = todayIsoDate();
    const yesterday = shiftCalendarDay(today, -1);
    const at = (day: string) => new Date(`${day}T12:00:00`).toISOString();
    state.data!.profile.heightCm = 170;
    state.data!.weights.push({
      id: crypto.randomUUID(),
      createdAt: at(yesterday),
      measuredAt: at(yesterday),
      weightKg: 70,
      note: "",
    });
    state.data!.meals.push({
      id: crypto.randomUUID(),
      createdAt: at(yesterday),
      eatenAt: at(yesterday),
      name: "Refeição",
      caloriesKcal: 1800,
      foods: [],
      photoAssisted: false,
    });
    const initial = JSON.stringify(state.data);
    render(
      <MemoryRouter>
        <CalorieBalancePage />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Para calcular, informe/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Idade nesse dia/), {
      target: { value: "30" },
    });
    fireEvent.change(screen.getByLabelText("Parâmetro da fórmula"), {
      target: { value: "female" },
    });
    expect(screen.getByText(/Para calcular, informe/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Dia do balanço calórico"), {
      target: { value: yesterday },
    });
    expect(screen.getByRole("status")).toHaveTextContent("+348 kcal");
    expect(recordUse).toHaveBeenCalledWith("calorie-balance-daily");
    expect(JSON.stringify(state.data)).toBe(initial);
  });
});
