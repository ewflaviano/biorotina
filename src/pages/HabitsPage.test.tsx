import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyData, type AppData } from "../domain/data";
import { HabitsPage } from "./HabitsPage";

const experiment = vi.hoisted(() => ({
  enabled: false,
  startAttempt: vi.fn(),
  finish: vi.fn(),
  recordUse: vi.fn(),
}));
const storage = vi.hoisted(() => ({
  data: null as AppData | null,
  mutate: vi.fn(),
  removeWithUndo: vi.fn(),
}));
vi.mock("../experiments/ExperimentContext", () => ({
  useExperimentExposure: vi.fn(),
  useExperiment: () => ({
    enabled: () => experiment.enabled,
    startAttempt: experiment.startAttempt,
    recordUse: experiment.recordUse,
  }),
}));
vi.mock("../state/AppDataContext", () => ({
  useAppData: () => ({
    ...storage,
    data: storage.data ?? emptyData(),
  }),
}));
vi.mock("../components/PushActivationPrompt", () => ({
  PushActivationPrompt: () => null,
}));

beforeEach(() => {
  storage.data = null;
  experiment.enabled = false;
  experiment.startAttempt
    .mockReset()
    .mockImplementation(() => experiment.finish);
  experiment.finish.mockReset();
  experiment.recordUse.mockReset();
  storage.mutate.mockReset().mockResolvedValue(undefined);
  storage.removeWithUndo.mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

const form = () => within(document.querySelector("form")!);

describe("confirmação experimental do formulário de hábitos", () => {
  it("mantém o controle sem anúncio e mede a tentativa", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HabitsPage />
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText("Nome"), "Ler");
    await user.click(screen.getByRole("button", { name: "Salvar hábito" }));
    expect(storage.mutate).toHaveBeenCalledOnce();
    expect(form().queryByRole("status")).not.toBeInTheDocument();
    expect(experiment.startAttempt).toHaveBeenCalledWith(
      "habit-form-confirmation",
    );
    expect(experiment.finish).toHaveBeenCalledWith("success");
  });

  it("confirma após persistir, preserva foco e impede repetição", async () => {
    experiment.enabled = true;
    let complete!: () => void;
    storage.mutate.mockReturnValue(
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
    );
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HabitsPage />
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText("Nome"), "Ler");
    await user.click(screen.getByRole("button", { name: "Salvar hábito" }));
    const button = screen.getByRole("button", { name: "Salvando…" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveFocus();
    await user.click(button);
    expect(storage.mutate).toHaveBeenCalledOnce();
    expect(form().getByRole("status")).toBeEmptyDOMElement();
    complete();
    expect(await screen.findByText("Hábito salvo na lista.")).toHaveAttribute(
      "role",
      "status",
    );
    expect(button).toHaveFocus();
    await user.type(screen.getByLabelText("Nome"), "Correr");
    expect(
      screen.queryByText("Hábito salvo na lista."),
    ).not.toBeInTheDocument();
  });

  it("não confirma após validação ou falha de persistência", async () => {
    experiment.enabled = true;
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <HabitsPage />
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText("Nome"), " ");
    await user.click(screen.getByRole("button", { name: "Salvar hábito" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Dê um nome ao hábito.",
    );
    expect(storage.mutate).not.toHaveBeenCalled();
    expect(form().getByRole("status")).toBeEmptyDOMElement();
    await user.clear(screen.getByLabelText("Nome"));
    await user.type(screen.getByLabelText("Nome"), "Ler");
    storage.mutate.mockRejectedValueOnce(new Error("Falha simulada"));
    await user.click(screen.getByRole("button", { name: "Salvar hábito" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha simulada",
    );
    expect(form().getByRole("status")).toBeEmptyDOMElement();
    expect(experiment.finish.mock.calls).toEqual([["error"], ["error"]]);
  });
});

describe("visão semanal integrada ao histórico", () => {
  it("seleciona o dia, limpa a busca e leva o foco ao histórico", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 4, 12));
    const data = emptyData();
    const habitId = crypto.randomUUID();
    data.habits.push({
      id: habitId,
      name: "Leitura",
      createdAt: new Date(2026, 8, 28, 12).toISOString(),
      reminderTimes: [],
      reminderWeekdays: [0, 1, 2, 3, 4, 5, 6],
    });
    data.habitLogs.push({
      id: crypto.randomUUID(),
      habitId,
      completedAt: new Date(2026, 9, 2, 12).toISOString(),
      createdAt: new Date(2026, 9, 2, 12).toISOString(),
    });
    storage.data = data;
    render(
      <MemoryRouter>
        <HabitsPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Buscar hábito neste dia"), {
      target: { value: "outro" },
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: /Leitura, sexta-feira, 2 de outubro de 2026: 1 registro/,
      }),
    );

    expect(
      screen.getByRole("heading", {
        name: "Histórico de 2 de outubro de 2026",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Buscar hábito neste dia")).toHaveValue("");
    expect(document.getElementById("habit-history-section")).toHaveFocus();
    expect(
      within(document.getElementById("habit-history-section")!).getByText(
        "Leitura",
      ),
    ).toBeInTheDocument();
  });
});

describe("limpeza experimental da busca vazia no histórico", () => {
  function renderWithLog() {
    const data = emptyData();
    const habitId = crypto.randomUUID();
    data.habits.push({
      id: habitId,
      name: "Leitura",
      createdAt: "2026-10-02T12:00:00Z",
      reminderTimes: [],
      reminderWeekdays: [0, 1, 2, 3, 4, 5, 6],
    });
    data.habitLogs.push({
      id: crypto.randomUUID(),
      habitId,
      completedAt: "2026-10-02T12:00:00Z",
      createdAt: "2026-10-02T12:00:00Z",
    });
    storage.data = data;
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/", state: { day: "2026-10-02" } }]}
      >
        <HabitsPage />
      </MemoryRouter>,
    );
  }

  it("mantém o controle sem ação junto ao estado vazio", () => {
    renderWithLog();
    fireEvent.change(screen.getByLabelText("Buscar hábito neste dia"), {
      target: { value: "outro" },
    });
    expect(
      screen.getByText(/Nenhum hábito corresponde à busca/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Limpar busca e ver registros" }),
    ).not.toBeInTheDocument();
  });

  it("limpa a busca, restaura os registros e foca o campo", async () => {
    experiment.enabled = true;
    const user = userEvent.setup();
    renderWithLog();
    await user.type(screen.getByLabelText("Buscar hábito neste dia"), "outro");
    await user.click(
      screen.getByRole("button", { name: "Limpar busca e ver registros" }),
    );
    expect(screen.getByLabelText("Buscar hábito neste dia")).toHaveValue("");
    expect(screen.getByLabelText("Buscar hábito neste dia")).toHaveFocus();
    expect(
      within(document.getElementById("habit-history-section")!).getByText(
        "Leitura",
      ),
    ).toBeInTheDocument();
    expect(experiment.recordUse).toHaveBeenCalledWith(
      "habit-history-clear-search",
    );
  });
});
