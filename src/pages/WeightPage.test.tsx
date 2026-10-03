import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyData } from "../domain/data";
import { WeightPage } from "./WeightPage";

const experiment = vi.hoisted(() => ({
  enabled: false,
  startAttempt: vi.fn(),
  finish: vi.fn(),
  recordUse: vi.fn(),
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
    recordUse: experiment.recordUse,
  }),
}));
vi.mock("../state/AppDataContext", () => ({
  useAppData: () => ({
    data: {
      ...emptyData(),
      weights: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          weightKg: 70,
          measuredAt: "2026-09-27T12:00:00Z",
          createdAt: "2026-09-27T12:00:00Z",
          note: "",
        },
      ],
    },
    ...storage,
  }),
}));

beforeEach(() => {
  experiment.enabled = false;
  experiment.startAttempt.mockImplementation(() => experiment.finish);
  experiment.recordUse.mockReset();
  storage.mutate.mockReset().mockResolvedValue(undefined);
  storage.removeWithUndo.mockReset().mockResolvedValue(undefined);
});

describe("edição experimental do histórico de peso", () => {
  it("mantém o controle sem ação de edição", () => {
    render(<WeightPage />);
    expect(screen.queryByRole("button", { name: /Editar peso de/ })).toBeNull();
  });

  it("pré-preenche e salva a mesma medida, mantendo foco e sem alterar novos registros", async () => {
    experiment.enabled = true;
    const user = userEvent.setup();
    render(<WeightPage />);
    const edit = screen.getByRole("button", { name: /Editar peso de/ });
    await user.click(edit);
    const editForm = screen.getByRole("form", {
      name: "Editar medida de peso",
    });
    const input = within(editForm).getByLabelText("Peso em kg");
    expect(input).toHaveValue("70");
    expect(input).toHaveFocus();
    expect(experiment.recordUse).toHaveBeenCalledWith("weight-history-edit");
    await user.clear(input);
    await user.type(input, "71,5");
    await user.type(
      within(editForm).getByLabelText(/Observação/),
      " corrigida",
    );
    await user.click(
      within(editForm).getByRole("button", { name: "Salvar alteração" }),
    );
    expect(
      await screen.findByText("Medida atualizada no histórico."),
    ).toBeInTheDocument();
    await waitFor(() => expect(edit).toHaveFocus());
    const data = emptyData();
    data.weights = [
      {
        id: "00000000-0000-4000-8000-000000000002",
        weightKg: 70,
        measuredAt: "2026-09-27T12:00:00Z",
        createdAt: "2026-09-27T12:00:00Z",
        note: "",
      },
    ];
    const updated = storage.mutate.mock.calls[0][0](data);
    expect(updated.weights).toEqual([
      { ...data.weights[0], weightKg: 71.5, note: "corrigida" },
    ]);
    expect(experiment.startAttempt).toHaveBeenCalledWith("weight-history-edit");
    expect(experiment.finish).toHaveBeenCalledWith("success");
  });

  it("preserva o rascunho após falha e restaura foco ao cancelar", async () => {
    experiment.enabled = true;
    storage.mutate.mockRejectedValueOnce(new Error("Falha simulada"));
    const user = userEvent.setup();
    render(<WeightPage />);
    const edit = screen.getByRole("button", { name: /Editar peso de/ });
    await user.click(edit);
    const editForm = screen.getByRole("form", {
      name: "Editar medida de peso",
    });
    const input = within(editForm).getByLabelText("Peso em kg");
    await user.clear(input);
    await user.type(input, "72");
    await user.click(
      within(editForm).getByRole("button", { name: "Salvar alteração" }),
    );
    expect(await within(editForm).findByRole("alert")).toHaveTextContent(
      "Falha simulada",
    );
    expect(input).toHaveValue("72");
    expect(
      screen.queryByText("Medida atualizada no histórico."),
    ).not.toBeInTheDocument();
    await user.click(
      within(editForm).getByRole("button", { name: "Cancelar" }),
    );
    expect(edit).toHaveFocus();
    expect(experiment.finish).toHaveBeenCalledWith("error");
  });
});

const form = () =>
  within(screen.getByRole("region", { name: "Registrar peso" }));
const confirmation = "Medida salva no histórico.";
async function save(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Peso em kg"), "70");
  await user.click(screen.getByRole("button", { name: "Salvar medida" }));
}

describe("confirmação experimental do formulário de peso", () => {
  it("mantém controle sem confirmação e mede a tentativa concluída", async () => {
    const user = userEvent.setup();
    render(<WeightPage />);
    await save(user);
    expect(storage.mutate).toHaveBeenCalledOnce();
    expect(form().queryByRole("status")).not.toBeInTheDocument();
    expect(experiment.startAttempt).toHaveBeenCalledWith(
      "weight-form-confirmation",
    );
    expect(experiment.finish).toHaveBeenCalledWith("success");
  });

  it("aguarda persistência, mantém foco e retira confirmação com gate desligado", async () => {
    experiment.enabled = true;
    let finish!: () => void;
    storage.mutate.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    const view = render(<WeightPage />);
    await save(user);
    const button = screen.getByRole("button", { name: "Salvando…" });
    expect(button).toHaveAttribute("aria-disabled", "true");
    await user.click(button);
    expect(storage.mutate).toHaveBeenCalledOnce();
    expect(experiment.startAttempt).toHaveBeenCalledOnce();
    expect(form().getByRole("status")).toBeEmptyDOMElement();
    expect(experiment.finish).not.toHaveBeenCalled();
    finish();
    expect(await screen.findByText(confirmation)).toHaveAttribute(
      "role",
      "status",
    );
    expect(button).toHaveFocus();
    expect(screen.getByLabelText("Peso em kg")).toHaveValue("");
    expect(experiment.finish).toHaveBeenCalledWith("success");
    experiment.enabled = false;
    view.rerender(<WeightPage />);
    expect(form().queryByRole("status")).not.toBeInTheDocument();
  });

  it("limpa ao editar e não confirma falha após sucesso", async () => {
    experiment.enabled = true;
    const user = userEvent.setup();
    render(<WeightPage />);
    await save(user);
    expect(await screen.findByText(confirmation)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Peso em kg"), "71");
    expect(form().getByRole("status")).toBeEmptyDOMElement();
    storage.mutate.mockRejectedValueOnce(new Error("Falha simulada"));
    await user.click(screen.getByRole("button", { name: "Salvar medida" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Falha simulada",
    );
    expect(form().getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByLabelText("Peso em kg")).toHaveValue("71");
    expect(experiment.finish.mock.calls).toEqual([["success"], ["error"]]);
  });

  it("mede validação recusada sem persistir ou anunciar sucesso", async () => {
    experiment.enabled = true;
    const user = userEvent.setup();
    render(<WeightPage />);
    await user.type(screen.getByLabelText("Peso em kg"), "-1");
    await user.click(screen.getByRole("button", { name: "Salvar medida" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(storage.mutate).not.toHaveBeenCalled();
    expect(experiment.finish).toHaveBeenCalledWith("error");
    expect(form().getByRole("status")).toBeEmptyDOMElement();
  });

  it("limpa sucesso ao editar nota, repetir e excluir", async () => {
    experiment.enabled = true;
    const user = userEvent.setup();
    render(<WeightPage />);
    await save(user);
    await user.type(screen.getByLabelText(/Observação/), "teste");
    expect(screen.queryByText(confirmation)).not.toBeInTheDocument();
    await save(user);
    await user.click(screen.getByRole("button", { name: /Repetir peso/ }));
    expect(screen.queryByText(confirmation)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Peso em kg")).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Salvar medida" }));
    expect(await screen.findByText(confirmation)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Excluir peso/ }));
    await waitFor(() => expect(storage.removeWithUndo).toHaveBeenCalledOnce());
    expect(screen.queryByText(confirmation)).not.toBeInTheDocument();
  });
});
