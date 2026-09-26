import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyData } from "../domain/data";
import { HydrationPage } from "./HydrationPage";

const experiment = vi.hoisted(() => ({ enabled: false, recordUse: vi.fn() }));
const storage = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("../experiments/ExperimentContext", () => ({
  useExperiment: () => ({
    enabled: () => experiment.enabled,
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
