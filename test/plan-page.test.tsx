import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlanPage } from "../src/pages/PlanPage";

const connect = vi.fn(async () => undefined);
let account: { token: string; email: string } | null = null;
vi.mock("../src/sync/DriveSyncContext", () => ({
  useDriveSync: () => ({
    account,
    available: true,
    busy: false,
    error: "",
    connect,
  }),
}));

beforeEach(() => {
  account = null;
  connect.mockClear();
  vi.restoreAllMocks();
});

function mockSessionAndApi(payload: unknown, status = 200) {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      Response.json({ accessToken: "fresh-session-token" }),
    )
    .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status }));
}

describe("assinatura sem conta conectada", () => {
  it("pede login Google antes do checkout e deixa a chave pessoal disponível", async () => {
    render(
      <MemoryRouter>
        <PlanPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("R$ 8,99")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Assinar/ })).toBeNull();
    expect(screen.queryByLabelText(/CPF/)).toBeNull();
    expect(
      screen.getByRole("link", { name: "Configurar chave Gemini" }),
    ).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Entrar com Google" }));
    expect(connect).toHaveBeenCalledOnce();
  });
  it("mostra nenhum plano ativo após consulta bem-sucedida, sem datas vazias", async () => {
    account = { token: "google-token", email: "pessoa@example.com" };
    mockSessionAndApi({
      active: false,
      cancelled: false,
      renewalActive: false,
      paidThrough: null,
      nextCharge: null,
      usedToday: 0,
      dailyLimit: 10,
      checkoutUrl: null,
    });
    render(
      <MemoryRouter>
        <PlanPage />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText("Nenhum plano ativo nesta conta."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Disponível até")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Assinar por R$ 8,99/mês" }),
    ).toBeInTheDocument();
  });
  it("não oferece chave pessoal a quem já tem plano ativo", async () => {
    account = { token: "google-token", email: "pessoa@example.com" };
    mockSessionAndApi({
      active: true,
      cancelled: false,
      renewalActive: true,
      paidThrough: "2026-10-24",
      nextCharge: "2026-10-24",
      usedToday: 2,
      dailyLimit: 10,
      checkoutUrl: null,
    });
    render(
      <MemoryRouter>
        <PlanPage />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("link", { name: "Configurar chave Gemini" }),
    ).toBeNull();
    expect(
      await screen.findByText(
        "Plano ativo. Você pode analisar fotos de refeições.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Configurar chave Gemini" }),
    ).toBeNull();
  });
  it("explica quando o serviço ainda não foi publicado sem mostrar erro técnico", async () => {
    account = { token: "google-token", email: "pessoa@example.com" };
    mockSessionAndApi({ message: "Not Found" }, 404);
    render(
      <MemoryRouter>
        <PlanPage />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText(
        "O plano de IA ainda não está disponível. Volte em breve.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Disponível até")).toBeNull();
    expect(screen.queryByText("Failed to fetch")).toBeNull();
    expect(screen.queryByRole("button", { name: /Assinar por/ })).toBeNull();
  });
});
