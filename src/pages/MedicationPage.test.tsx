import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyData, type AppData } from "../domain/data";
import { MedicationPage } from "./MedicationPage";

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
  experiment.recordUse.mockReset();
  experiment.enabled = false;
  experiment.startAttempt
    .mockReset()
    .mockImplementation(() => experiment.finish);
  experiment.finish.mockReset();
  storage.mutate.mockReset().mockResolvedValue(undefined);
  storage.removeWithUndo.mockReset().mockResolvedValue(undefined);
});

const form = () => within(document.querySelector("form")!);
async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nome"), "Teste");
  await user.type(screen.getByLabelText("Dose"), "1");
}

describe("confirmação experimental do formulário de medicamentos", () => {
  it("mantém o controle sem anúncio e mede a tentativa", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MedicationPage />
      </MemoryRouter>,
    );
    await fill(user);
    await user.click(
      screen.getByRole("button", { name: "Salvar medicamento" }),
    );
    expect(storage.mutate).toHaveBeenCalledOnce();
    expect(form().queryByRole("status")).not.toBeInTheDocument();
    expect(experiment.startAttempt).toHaveBeenCalledWith(
      "medication-form-confirmation",
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
        <MedicationPage />
      </MemoryRouter>,
    );
    await fill(user);
    await user.click(
      screen.getByRole("button", { name: "Salvar medicamento" }),
    );
    const button = screen.getByRole("button", { name: "Salvando…" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveFocus();
    await user.click(button);
    expect(storage.mutate).toHaveBeenCalledOnce();
    expect(form().getByRole("status")).toBeEmptyDOMElement();
    complete();
    expect(
      await screen.findByText("Medicamento salvo na lista."),
    ).toHaveAttribute("role", "status");
    expect(button).toHaveFocus();
    await user.type(screen.getByLabelText("Nome"), "Novo");
    expect(
      screen.queryByText("Medicamento salvo na lista."),
    ).not.toBeInTheDocument();
  });

  it("não confirma validação recusada nem falha de persistência", async () => {
    experiment.enabled = true;
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <MedicationPage />
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText("Nome"), "Teste");
    await user.type(screen.getByLabelText("Dose"), "-1");
    await user.click(
      screen.getByRole("button", { name: "Salvar medicamento" }),
    );
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(storage.mutate).not.toHaveBeenCalled();
    expect(form().getByRole("status")).toBeEmptyDOMElement();
    await user.clear(screen.getByLabelText("Dose"));
    await user.type(screen.getByLabelText("Dose"), "1");
    storage.mutate.mockRejectedValueOnce(new Error("Falha simulada"));
    await user.click(
      screen.getByRole("button", { name: "Salvar medicamento" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha simulada",
    );
    expect(form().getByRole("status")).toBeEmptyDOMElement();
    expect(experiment.finish.mock.calls).toEqual([["error"], ["error"]]);
  });
});

describe("limpeza experimental da busca vazia de medicamentos", () => {
  function renderWithLog() {
    const data = emptyData();
    const medicationId = crypto.randomUUID();
    data.medications.push({
      id: medicationId,
      name: "Exemplo",
      dose: 1,
      unit: "mg",
      reminderTimes: [],
      reminderWeekdays: [0, 1, 2, 3, 4, 5, 6],
      createdAt: "2026-10-02T12:00:00Z",
    });
    data.medicationLogs.push({
      id: crypto.randomUUID(),
      medicationId,
      takenAt: "2026-10-02T12:00:00Z",
      createdAt: "2026-10-02T12:00:00Z",
    });
    storage.data = data;
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/", state: { day: "2026-10-02" } }]}
      >
        <MedicationPage />
      </MemoryRouter>,
    );
  }

  it("mantém o controle sem ação no estado vazio", () => {
    renderWithLog();
    fireEvent.change(screen.getByLabelText("Buscar medicamento neste dia"), {
      target: { value: "outro" },
    });
    expect(
      screen.getByText(/Nenhum medicamento corresponde à busca/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Limpar busca e ver registros" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Limpar busca" }),
    ).toBeInTheDocument();
  });

  it("limpa a busca, restaura os usos e foca o campo", async () => {
    experiment.enabled = true;
    const user = userEvent.setup();
    renderWithLog();
    await user.type(
      screen.getByLabelText("Buscar medicamento neste dia"),
      "outro",
    );
    expect(
      screen.queryByRole("button", { name: "Limpar busca" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Limpar busca e ver registros" }),
    );
    expect(screen.getByLabelText("Buscar medicamento neste dia")).toHaveValue(
      "",
    );
    expect(screen.getByLabelText("Buscar medicamento neste dia")).toHaveFocus();
    expect(
      within(
        screen.getByRole("region", { name: /Histórico de uso de/ }),
      ).getByText("Exemplo"),
    ).toBeInTheDocument();
    expect(experiment.recordUse).toHaveBeenCalledWith(
      "medication-history-clear-search",
    );
  });
});
