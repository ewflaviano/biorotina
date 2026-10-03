import { MemoryRouter } from "react-router-dom";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyData } from "../domain/data";
import { HabitsPage } from "./HabitsPage";

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
