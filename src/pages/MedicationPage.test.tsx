import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyData } from "../domain/data";
import { MedicationPage } from "./MedicationPage";

const experiment = vi.hoisted(() => ({
  enabled: false,
  startAttempt: vi.fn(),
  finish: vi.fn(),
}));
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
    data: emptyData(),
    ...storage,
  }),
}));
vi.mock("../components/PushActivationPrompt", () => ({
  PushActivationPrompt: () => null,
}));

beforeEach(() => {
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
    render(<MedicationPage />);
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
    render(<MedicationPage />);
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
    render(<MedicationPage />);
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
