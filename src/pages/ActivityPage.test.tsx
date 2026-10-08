import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { emptyData, todayIsoDate, type AppData } from "../domain/data";
import { formatCalendarDay, shiftCalendarDay } from "../domain/dailyRecords";
import { ActivityPage } from "./ActivityPage";

const experiment = vi.hoisted(() => ({
  enabled: false,
  startAttempt: vi.fn(),
  finish: vi.fn(),
}));
const state = vi.hoisted(() => ({ data: null as AppData | null }));
const storage = vi.hoisted(() => ({
  mutate: vi.fn(),
  removeWithUndo: vi.fn(),
}));
vi.mock("../experiments/ExperimentContext", () => ({
  useExperimentExposure: vi.fn(),
  useExperiment: () => ({
    enabled: () => experiment.enabled,
    startAttempt: experiment.startAttempt,
  }),
}));
vi.mock("../state/AppDataContext", () => ({
  useAppData: () => ({
    data: state.data,
    ...storage,
  }),
}));

beforeEach(() => {
  state.data = emptyData();
  experiment.enabled = false;
  experiment.startAttempt
    .mockReset()
    .mockImplementation(() => experiment.finish);
  experiment.finish.mockReset();
  storage.mutate.mockReset().mockResolvedValue(undefined);
  storage.removeWithUndo.mockReset().mockResolvedValue(undefined);
});

async function fillActivity(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Atividade"), "Caminhada");
  await user.type(screen.getByLabelText("Duração em minutos"), "20");
}
const form = () => within(document.querySelector("form")!);
const history = () =>
  within(screen.getByRole("region", { name: /^Histórico de / }));
const dailyTotal = () =>
  within(screen.getByText("Total do dia").closest(".panel")!);

function renderActivity(day?: string) {
  return render(
    <MemoryRouter
      initialEntries={[
        { pathname: "/atividades", state: day ? { day } : null },
      ]}
    >
      <ActivityPage />
    </MemoryRouter>,
  );
}

function addActivity(
  day: string,
  hour: number,
  name: string,
  durationMinutes: number,
) {
  const occurredAt = new Date(
    `${day}T${String(hour).padStart(2, "0")}:15:00`,
  ).toISOString();
  state.data!.activities.push({
    id: crypto.randomUUID(),
    createdAt: occurredAt,
    occurredAt,
    name,
    durationMinutes,
    caloriesKcal: null,
  });
}

describe("confirmação experimental do formulário de atividades", () => {
  it("mantém o controle sem anúncio e mede a tentativa", async () => {
    const user = userEvent.setup();
    renderActivity();
    await fillActivity(user);
    await user.click(screen.getByRole("button", { name: "Salvar atividade" }));
    expect(storage.mutate).toHaveBeenCalledOnce();
    expect(form().queryByRole("status")).not.toBeInTheDocument();
    expect(experiment.startAttempt).toHaveBeenCalledWith(
      "activity-form-confirmation",
    );
    expect(experiment.finish).toHaveBeenCalledWith("success");
  });

  it("confirma após persistir, mantém foco e impede repetição enquanto salva", async () => {
    experiment.enabled = true;
    let complete!: () => void;
    storage.mutate.mockReturnValue(
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
    );
    const user = userEvent.setup();
    renderActivity();
    await fillActivity(user);
    await user.click(screen.getByRole("button", { name: "Salvar atividade" }));
    const button = screen.getByRole("button", { name: "Salvando…" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveFocus();
    await user.click(button);
    expect(storage.mutate).toHaveBeenCalledOnce();
    expect(form().getByRole("status")).toBeEmptyDOMElement();
    complete();
    expect(
      await screen.findByText("Atividade salva no histórico."),
    ).toHaveAttribute("role", "status");
    expect(button).toHaveFocus();
    expect(experiment.finish).toHaveBeenCalledWith("success");
    await user.type(screen.getByLabelText("Atividade"), "Corrida");
    expect(
      screen.queryByText("Atividade salva no histórico."),
    ).not.toBeInTheDocument();
  });

  it("não anuncia sucesso na validação nem após falha de persistência", async () => {
    experiment.enabled = true;
    const user = userEvent.setup();
    renderActivity();
    await fillActivity(user);
    await user.clear(screen.getByLabelText("Duração em minutos"));
    await user.type(screen.getByLabelText("Duração em minutos"), "2000");
    await user.click(screen.getByRole("button", { name: "Salvar atividade" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(storage.mutate).not.toHaveBeenCalled();
    expect(form().getByRole("status")).toBeEmptyDOMElement();
    await user.clear(screen.getByLabelText("Duração em minutos"));
    await user.type(screen.getByLabelText("Duração em minutos"), "20");
    storage.mutate.mockRejectedValueOnce(new Error("Falha simulada"));
    await user.click(screen.getByRole("button", { name: "Salvar atividade" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha simulada",
    );
    expect(form().getByRole("status")).toBeEmptyDOMElement();
    expect(experiment.finish.mock.calls).toEqual([["error"], ["error"]]);
  });
});

describe("histórico de atividades por dia", () => {
  it("começa em hoje e combina dia e busca sem alterar registros", async () => {
    const user = userEvent.setup();
    const today = todayIsoDate();
    const yesterday = shiftCalendarDay(today, -1);
    addActivity(today, 6, "Corrída", 35);
    addActivity(today, 5, "Alongamento", 20);
    addActivity(yesterday, 6, "Caminhada", 40);
    const before = JSON.stringify(state.data);

    renderActivity();
    expect(
      screen.getByRole("heading", {
        name: `Histórico de ${formatCalendarDay(today)}`,
      }),
    ).toBeInTheDocument();
    expect(history().getByRole("status")).toHaveTextContent(
      "2 atividades · 55 min exibidos",
    );
    expect(dailyTotal().getByText("min").closest("strong")).toHaveTextContent(
      "55 min",
    );
    expect(
      dailyTotal().getByText(
        `2 atividades registradas em ${formatCalendarDay(today)}.`,
      ),
    ).toBeInTheDocument();
    expect(history().getByText("Corrída")).toBeInTheDocument();
    expect(history().queryByText("Caminhada")).not.toBeInTheDocument();

    const search = screen.getByRole("searchbox", {
      name: "Buscar atividade neste dia",
    });
    await user.type(search, "CORRIDA");
    expect(history().getByText("Corrída")).toBeInTheDocument();
    expect(history().queryByText("Alongamento")).not.toBeInTheDocument();
    expect(
      history().getByText("1 atividade · 35 min exibidos"),
    ).toBeInTheDocument();
    expect(dailyTotal().getByText("min").closest("strong")).toHaveTextContent(
      "55 min",
    );
    await user.click(screen.getByRole("button", { name: "Limpar busca" }));
    await user.click(screen.getByRole("button", { name: "Dia anterior" }));
    expect(history().getByText("Caminhada")).toBeInTheDocument();
    expect(history().queryByText("Corrída")).not.toBeInTheDocument();
    expect(
      history().getByText("1 atividade · 40 min exibidos"),
    ).toBeInTheDocument();
    expect(dailyTotal().getByText("min").closest("strong")).toHaveTextContent(
      "40 min",
    );
    expect(
      dailyTotal().getByText(
        `1 atividade registrada em ${formatCalendarDay(yesterday)}.`,
      ),
    ).toBeInTheDocument();
    expect(JSON.stringify(state.data)).toBe(before);
    expect(storage.mutate).not.toHaveBeenCalled();
  });

  it("recebe a data escolhida na home e orienta quando o dia está vazio", async () => {
    const user = userEvent.setup();
    const today = todayIsoDate();
    const yesterday = shiftCalendarDay(today, -1);
    addActivity(today, 6, "Caminhada", 20);
    renderActivity(yesterday);
    expect(
      screen.getByRole("heading", {
        name: `Histórico de ${formatCalendarDay(yesterday)}`,
      }),
    ).toBeInTheDocument();
    expect(
      history().getByText(/Nenhuma atividade registrada neste dia/),
    ).toBeInTheDocument();
    expect(dailyTotal().getByText("min").closest("strong")).toHaveTextContent(
      "0 min",
    );
    await user.click(screen.getByRole("button", { name: "Ir para hoje" }));
    expect(history().getByText("Caminhada")).toBeInTheDocument();
    expect(dailyTotal().getByText("min").closest("strong")).toHaveTextContent(
      "20 min",
    );
  });

  it("mostra o dia salvo e limpa a busca ao registrar atividade retroativa", async () => {
    const user = userEvent.setup();
    const yesterday = shiftCalendarDay(todayIsoDate(), -1);
    addActivity(todayIsoDate(), 6, "Passeio", 10);
    storage.mutate.mockImplementationOnce(
      async (update: (current: AppData) => AppData) => {
        state.data = update(state.data!);
      },
    );
    renderActivity();
    await user.type(
      screen.getByRole("searchbox", { name: "Buscar atividade neste dia" }),
      "Passeio",
    );
    await fillActivity(user);
    const date = screen.getByLabelText("Data");
    await user.clear(date);
    await user.type(date, yesterday.split("-").reverse().join(""));
    await user.click(screen.getByRole("button", { name: "Salvar atividade" }));
    expect(
      await screen.findByRole("heading", {
        name: `Histórico de ${formatCalendarDay(yesterday)}`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "Buscar atividade neste dia" }),
    ).toHaveValue("");
    expect(history().getByText("Caminhada")).toBeInTheDocument();
    expect(history().queryByText("Passeio")).not.toBeInTheDocument();
    expect(dailyTotal().getByText("min").closest("strong")).toHaveTextContent(
      "20 min",
    );
  });
});
