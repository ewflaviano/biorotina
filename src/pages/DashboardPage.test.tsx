import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyData, todayIsoDate, type AppData } from "../domain/data";
import { formatCalendarDay, shiftCalendarDay } from "../domain/dailyRecords";
import { DashboardPage } from "./DashboardPage";

const state = vi.hoisted(() => ({ data: null as AppData | null }));
vi.mock("../state/AppDataContext", () => ({
  useAppData: () => ({ data: state.data }),
}));
vi.mock("../experiments/ExperimentContext", () => ({
  useExperiment: () => ({ enabled: () => false }),
  useExperimentExposure: () => undefined,
}));

function localIso(day: string, hour: number) {
  return new Date(
    `${day}T${String(hour).padStart(2, "0")}:15:00`,
  ).toISOString();
}

function DiarySelection() {
  const location = useLocation();
  return <p>Dia recebido: {(location.state as { day: string }).day}</p>;
}

beforeEach(() => {
  state.data = emptyData();
});

describe("resumo da página inicial por data", () => {
  it("atualiza os seis cartões e os registros do dia sem mudar os dados", async () => {
    const user = userEvent.setup();
    const today = todayIsoDate();
    const yesterday = shiftCalendarDay(today, -1);
    const id = () => crypto.randomUUID();
    const data = state.data!;
    data.weights.push(
      {
        id: id(),
        createdAt: localIso(today, 17),
        measuredAt: localIso(today, 17),
        weightKg: 85,
        note: "",
      },
      {
        id: id(),
        createdAt: localIso(yesterday, 17),
        measuredAt: localIso(yesterday, 17),
        weightKg: 80,
        note: "",
      },
    );
    data.activities.push(
      {
        id: id(),
        createdAt: localIso(today, 16),
        occurredAt: localIso(today, 16),
        name: "Caminhada",
        durationMinutes: 35,
        caloriesKcal: null,
      },
      {
        id: id(),
        createdAt: localIso(yesterday, 16),
        occurredAt: localIso(yesterday, 16),
        name: "Passeio",
        durationMinutes: 20,
        caloriesKcal: null,
      },
    );
    data.meals.push({
      id: id(),
      createdAt: localIso(yesterday, 15),
      eatenAt: localIso(yesterday, 15),
      name: "Almoço",
      caloriesKcal: 240,
      foods: [],
      photoAssisted: false,
    });
    data.hydrationEntries.push(
      {
        id: id(),
        createdAt: localIso(today, 14),
        drankAt: localIso(today, 14),
        amountMl: 750,
      },
      {
        id: id(),
        createdAt: localIso(yesterday, 14),
        drankAt: localIso(yesterday, 14),
        amountMl: 300,
      },
    );
    data.medicationLogs.push({
      id: id(),
      createdAt: localIso(yesterday, 13),
      takenAt: localIso(yesterday, 13),
      medicationId: id(),
    });
    data.habitLogs.push({
      id: id(),
      createdAt: localIso(yesterday, 12),
      completedAt: localIso(yesterday, 12),
      habitId: id(),
    });
    const before = JSON.stringify(data);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/diario" element={<DiarySelection />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(
      screen.getByRole("heading", { name: "Resumo de hoje" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Peso no dia").closest("a")).toHaveTextContent(
      "85 kg",
    );
    expect(screen.getByText("Água hoje").closest("a")).toHaveTextContent(
      "750 ml",
    );

    await user.click(screen.getByRole("button", { name: "Dia anterior" }));
    expect(
      screen.getByRole("heading", {
        name: `Resumo de ${formatCalendarDay(yesterday)}`,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Peso no dia").closest("a")).toHaveTextContent(
      "80 kg",
    );
    expect(screen.getByText("Movimento no dia").closest("a")).toHaveTextContent(
      "20 min",
    );
    expect(
      screen.getByText("Alimentação no dia").closest("a"),
    ).toHaveTextContent("240 kcal");
    expect(screen.getByText("Medicação no dia").closest("a")).toHaveTextContent(
      "1 uso",
    );
    expect(screen.getByText("Água no dia").closest("a")).toHaveTextContent(
      "300 ml",
    );
    expect(screen.getByText("Hábitos no dia").closest("a")).toHaveTextContent(
      "1 praticados",
    );
    const records = screen.getByRole("region", { name: "Registros do dia" });
    expect(within(records).getByText("Peso · 80 kg")).toBeInTheDocument();
    expect(within(records).queryByText("Peso · 85 kg")).not.toBeInTheDocument();
    expect(JSON.stringify(data)).toBe(before);

    await user.click(
      screen.getByRole("link", { name: "Ver todos os registros deste dia" }),
    );
    expect(screen.getByText(`Dia recebido: ${yesterday}`)).toBeInTheDocument();
  });

  it("mostra um dia vazio sem carregar valores de outras datas", async () => {
    const user = userEvent.setup();
    const today = todayIsoDate();
    const at = localIso(today, 10);
    state.data!.weights.push({
      id: crypto.randomUUID(),
      createdAt: at,
      measuredAt: at,
      weightKg: 85,
      note: "",
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Dia anterior" }));
    expect(screen.getByText("Peso no dia").closest("a")).toHaveTextContent(
      "Nenhuma medida neste dia",
    );
    expect(screen.getByText("Nenhum registro neste dia.")).toBeInTheDocument();
  });
});
