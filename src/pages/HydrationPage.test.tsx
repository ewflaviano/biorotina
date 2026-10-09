import { MemoryRouter } from "react-router-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyData } from "../domain/data";
import { HydrationPage } from "./HydrationPage";

const experiment = vi.hoisted(() => ({
  enabled: false,
  formEnabled: false,
  startAttempt: vi.fn(),
  finish: vi.fn(),
  recordUse: vi.fn(),
}));
const storage = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("../experiments/ExperimentContext", () => ({
  useExperimentExposure: vi.fn(),
  useExperiment: () => ({
    enabled: (key: string) =>
      key === "hydration-form-confirmation"
        ? experiment.formEnabled
        : experiment.enabled,
    startAttempt: experiment.startAttempt,
    recordUse: experiment.recordUse,
  }),
}));
vi.mock("../state/AppDataContext", () => ({
  useAppData: () => ({
    data: {
      ...emptyData(),
      hydrationEntries: [
        {
          id: "00000000-0000-4000-8000-000000000001",
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
  experiment.startAttempt.mockImplementation(() => experiment.finish);
  experiment.recordUse.mockReset();
  storage.mutate.mockReset().mockResolvedValue(undefined);
});

describe("atalho experimental no histórico de água vazio", () => {
  it("não aparece no controle", () => {
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/", state: { day: "2026-09-27" } }]}
      >
        <HydrationPage />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: /Ver água de/ })).toBeNull();
  });

  it("abre o último dia anterior com água e foca o seletor", async () => {
    experiment.enabled = true;
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/", state: { day: "2026-09-27" } }]}
      >
        <HydrationPage />
      </MemoryRouter>,
    );
    await user.click(
      screen.getByRole("button", {
        name: "Ver água de 25 de setembro de 2026",
      }),
    );
    expect(
      within(screen.getByRole("region", { name: /Histórico de/ })).getByText(
        "200 ml",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Data do histórico de água")).toHaveFocus();
    expect(experiment.recordUse).toHaveBeenCalledWith(
      "hydration-history-last-day-shortcut",
    );
  });

  it("não aparece quando há somente um dia posterior", () => {
    experiment.enabled = true;
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/", state: { day: "2026-09-24" } }]}
      >
        <HydrationPage />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: /Ver água de/ })).toBeNull();
  });
});

describe("edição de uma entrada de água", () => {
  it("abre o registro, permite cancelar e mantém o foco na ação", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/", state: { day: "2026-09-25" } }]}
      >
        <HydrationPage />
      </MemoryRouter>,
    );
    const edit = screen.getByRole("button", { name: /Editar água de 200 ml/ });
    await user.click(edit);
    const form = screen.getByRole("form", { name: "Editar registro de água" });
    expect(within(form).getByLabelText("Quantidade em ml")).toHaveValue("200");
    expect(within(form).getByLabelText("Quantidade em ml")).toHaveFocus();
    await user.click(within(form).getByRole("button", { name: "Cancelar" }));
    expect(
      screen.queryByRole("form", { name: "Editar registro de água" }),
    ).not.toBeInTheDocument();
    expect(edit).toHaveFocus();
    expect(storage.mutate).not.toHaveBeenCalled();
  });

  it("salva volume alterado sem criar outro registro", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/", state: { day: "2026-09-25" } }]}
      >
        <HydrationPage />
      </MemoryRouter>,
    );
    const edit = screen.getByRole("button", { name: /Editar água de 200 ml/ });
    await user.click(edit);
    const form = screen.getByRole("form", { name: "Editar registro de água" });
    const amount = within(form).getByLabelText("Quantidade em ml");
    await user.clear(amount);
    await user.type(amount, "350");
    await user.click(
      within(form).getByRole("button", { name: "Salvar alteração" }),
    );
    expect(
      await screen.findByText("Registro de água atualizado."),
    ).toBeInTheDocument();
    await waitFor(() => expect(edit).toHaveFocus());
    expect(storage.mutate).toHaveBeenCalledOnce();
    const data = emptyData();
    data.hydrationEntries = [
      {
        id: "00000000-0000-4000-8000-000000000001",
        amountMl: 200,
        drankAt: "2026-09-25T12:00:00Z",
        createdAt: "2026-09-25T12:00:00Z",
      },
    ];
    const updated = storage.mutate.mock.calls[0][0](data);
    expect(updated.hydrationEntries).toEqual([
      { ...data.hydrationEntries[0], amountMl: 350 },
    ]);
  });

  it("mantém o rascunho quando o volume é inválido ou o registro mudou", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/", state: { day: "2026-09-25" } }]}
      >
        <HydrationPage />
      </MemoryRouter>,
    );
    await user.click(
      screen.getByRole("button", { name: /Editar água de 200 ml/ }),
    );
    const form = screen.getByRole("form", { name: "Editar registro de água" });
    const amount = within(form).getByLabelText("Quantidade em ml");
    await user.clear(amount);
    await user.type(amount, "10001");
    await user.click(
      within(form).getByRole("button", { name: "Salvar alteração" }),
    );
    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "Confira a quantidade",
    );
    expect(storage.mutate).not.toHaveBeenCalled();
    await user.clear(amount);
    await user.type(amount, "300");
    storage.mutate.mockRejectedValueOnce(new Error("Este registro mudou."));
    await user.click(
      within(form).getByRole("button", { name: "Salvar alteração" }),
    );
    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "Este registro mudou.",
    );
    expect(amount).toHaveValue("300");
  });

  it("recusa uma data digitada que não existe", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/", state: { day: "2026-09-25" } }]}
      >
        <HydrationPage />
      </MemoryRouter>,
    );
    await user.click(
      screen.getByRole("button", { name: /Editar água de 200 ml/ }),
    );
    const form = screen.getByRole("form", { name: "Editar registro de água" });
    const date = within(form).getByLabelText("Data");
    await user.clear(date);
    await user.type(date, "32132026");
    await user.tab();
    await user.click(
      within(form).getByRole("button", { name: "Salvar alteração" }),
    );
    expect(await within(form).findByRole("alert")).toHaveTextContent(
      "Informe uma data válida.",
    );
    expect(storage.mutate).not.toHaveBeenCalled();
  });
});

describe("confirmação experimental dos atalhos de água", () => {
  it("preserva o comportamento comum quando o gate está desligado", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/", state: { day: "2026-09-25" } }]}
      >
        <HydrationPage />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "200 ml" }));
    expect(storage.mutate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(experiment.finish).toHaveBeenCalledWith("success");
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
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/", state: { day: "2026-09-25" } }]}
      >
        <HydrationPage />
      </MemoryRouter>,
    );
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
    expect(experiment.startAttempt).toHaveBeenCalledWith(
      "hydration-quick-confirmation",
    );
  });

  it("confirma repetição do histórico e limpa o sucesso anterior se a próxima gravação falhar", async () => {
    experiment.enabled = true;
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/", state: { day: "2026-09-25" } }]}
      >
        <HydrationPage />
      </MemoryRouter>,
    );
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
    expect(experiment.finish.mock.calls).toEqual([["success"], ["error"]]);
  });
});

describe("confirmação experimental do formulário de água", () => {
  it("mantém o formulário sem confirmação quando só o experimento dos atalhos está ativo", async () => {
    experiment.enabled = true;
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/", state: { day: "2026-09-25" } }]}
      >
        <HydrationPage />
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText("Quantidade em ml"), "300");
    await user.click(screen.getByRole("button", { name: "Salvar água" }));
    expect(storage.mutate).toHaveBeenCalledOnce();
    expect(
      screen.queryByText("Água salva no histórico."),
    ).not.toBeInTheDocument();
    expect(experiment.finish).toHaveBeenCalledWith("success");
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
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/", state: { day: "2026-09-25" } }]}
      >
        <HydrationPage />
      </MemoryRouter>,
    );
    const amount = screen.getByLabelText("Quantidade em ml");
    await user.type(amount, "300");
    const save = screen.getByRole("button", { name: "Salvar água" });
    await user.click(save);
    expect(save).toBeDisabled();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(experiment.finish).not.toHaveBeenCalled();
    finish();
    expect(await screen.findByText("Água salva no histórico.")).toHaveAttribute(
      "role",
      "status",
    );
    expect(save).toHaveFocus();
    expect(amount).toHaveValue("");
    expect(experiment.startAttempt).toHaveBeenCalledWith(
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
    expect(experiment.finish.mock.calls).toEqual([["success"], ["error"]]);
  });

  it("não confirma quantidade inválida nem habilita a confirmação dos atalhos", async () => {
    experiment.formEnabled = true;
    const user = userEvent.setup();
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/", state: { day: "2026-09-25" } }]}
      >
        <HydrationPage />
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText("Quantidade em ml"), "-1");
    await user.click(screen.getByRole("button", { name: "Salvar água" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(storage.mutate).not.toHaveBeenCalled();
    expect(experiment.finish).toHaveBeenCalledWith("error");
    await user.click(screen.getByRole("button", { name: "200 ml" }));
    expect(storage.mutate).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(experiment.finish.mock.calls).toEqual([["error"], ["success"]]);
  });
});
