import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyData } from "../domain/data";
import { ActivityPage } from "./ActivityPage";

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

beforeEach(() => {
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

describe("confirmação experimental do formulário de atividades", () => {
  it("mantém o controle sem anúncio e mede a tentativa", async () => {
    const user = userEvent.setup();
    render(<ActivityPage />);
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
    render(<ActivityPage />);
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
    render(<ActivityPage />);
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
