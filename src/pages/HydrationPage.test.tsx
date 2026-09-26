import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyData } from "../domain/data";
import { HydrationPage } from "./HydrationPage";

const experiment = vi.hoisted(() => ({
  enabled: false,
  formEnabled: false,
  recordUse: vi.fn(),
}));
const storage = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("../experiments/ExperimentContext", () => ({
  useExperiment: () => ({
    enabled: (key: string) =>
      key === "hydration-form-confirmation"
        ? experiment.formEnabled
        : experiment.enabled,
    recordUse: experiment.recordUse,
  }),
}));
vi.mock("../state/AppDataContext", () => ({
  useAppData: () => ({
    data: {
      ...emptyData(),
      hydrationEntries: [
        {
          id: "test-water",
          amountMl: 200,
          drankAt: "2026-09-25T12:00:00Z",
          createdAt: "2026-09-25T12:00:00Z",
        },
      ],
    },
    mutate: storage.mutate,
  }),
}));
vi.mock("../components/PushActivationPrompt", () => ({
  PushActivationPrompt: () => null,
}));

beforeEach(() => {
  experiment.enabled = false;
  experiment.formEnabled = false;
  storage.mutate.mockReset().mockResolvedValue(undefined);
});

describe("confirmação experimental dos atalhos de água", () => {
  it("preserva o comportamento comum quando o gate está desligado", async () => {
    const user = userEvent.setup();
    render(<HydrationPage />);
    await user.click(screen.getByRole("button", { name: "200 ml" }));
    expect(storage.mutate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(experiment.recordUse).not.toHaveBeenCalled();
  });

  it("só confirma após persistir e mantém o foco no atalho", async () => {
    experiment.enabled = true;
    let finish!: () => void;
    storage.mutate.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<HydrationPage />);
    const button = screen.getByRole("button", { name: "200 ml" });
    await user.click(button);
    expect(
      screen.queryByText("Água registrada. Seu total foi atualizado."),
    ).not.toBeInTheDocument();
    expect(button).toBeDisabled();
    finish();
    expect(
      await screen.findByText("Água registrada. Seu total foi atualizado."),
    ).toHaveAttribute("role", "status");
    expect(button).toHaveFocus();
    expect(experiment.recordUse).toHaveBeenCalledWith(
      "hydration-quick-confirmation",
    );
  });

  it("confirma repetição do histórico e limpa o sucesso anterior se a próxima gravação falhar", async () => {
    experiment.enabled = true;
    const user = userEvent.setup();
    render(<HydrationPage />);
    await user.click(
      screen.getByRole("button", { name: "Repetir 200 ml de água" }),
    );
    expect(
      await screen.findByText("Água registrada novamente com o horário atual."),
    ).toHaveAttribute("role", "status");
    storage.mutate.mockRejectedValueOnce(
      new Error("simulated storage failure"),
    );
    await user.click(screen.getByRole("button", { name: "200 ml" }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Não foi possível salvar",
      ),
    );
    expect(screen.queryByText(/Água registrada/)).not.toBeInTheDocument();
    expect(experiment.recordUse).toHaveBeenCalledTimes(1);
  });
});

describe("confirmação experimental do formulário de água", () => {
  it("mantém o formulário sem confirmação quando só o experimento dos atalhos está ativo", async () => {
    experiment.enabled = true;
    const user = userEvent.setup();
    render(<HydrationPage />);
    await user.type(screen.getByLabelText("Quantidade em ml"), "300");
    await user.click(screen.getByRole("button", { name: "Salvar água" }));
    expect(storage.mutate).toHaveBeenCalledOnce();
    expect(
      screen.queryByText("Água salva no histórico."),
    ).not.toBeInTheDocument();
    expect(experiment.recordUse).not.toHaveBeenCalled();
  });

  it("confirma somente após persistir, mantém o foco e limpa ao editar", async () => {
    experiment.formEnabled = true;
    let finish!: () => void;
    storage.mutate.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<HydrationPage />);
    const amount = screen.getByLabelText("Quantidade em ml");
    await user.type(amount, "300");
    const save = screen.getByRole("button", { name: "Salvar água" });
    await user.click(save);
    expect(save).toBeDisabled();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(experiment.recordUse).not.toHaveBeenCalled();
    finish();
    expect(await screen.findByText("Água salva no histórico.")).toHaveAttribute(
      "role",
      "status",
    );
    expect(save).toHaveFocus();
    expect(amount).toHaveValue("");
    expect(experiment.recordUse).toHaveBeenCalledWith(
      "hydration-form-confirmation",
    );
    await user.type(amount, "250");
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    storage.mutate.mockRejectedValueOnce(new Error("Falha simulada"));
    await user.click(save);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha simulada",
    );
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(amount).toHaveValue("250");
    expect(experiment.recordUse).toHaveBeenCalledTimes(1);
  });

  it("não confirma quantidade inválida nem habilita a confirmação dos atalhos", async () => {
    experiment.formEnabled = true;
    const user = userEvent.setup();
    render(<HydrationPage />);
    await user.type(screen.getByLabelText("Quantidade em ml"), "-1");
    await user.click(screen.getByRole("button", { name: "Salvar água" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(storage.mutate).not.toHaveBeenCalled();
    expect(experiment.recordUse).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "200 ml" }));
    expect(storage.mutate).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(experiment.recordUse).not.toHaveBeenCalled();
  });
});
