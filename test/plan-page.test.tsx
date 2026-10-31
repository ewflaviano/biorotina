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
    await userEvent.setup().click(screen.getByText("Opções avançadas"));
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
  it("mostra o teste ativo antes da oferta de assinatura sem dizer que falta um plano", async () => {
    account = { token: "google-token", email: "pessoa@example.com" };
    mockSessionAndApi({
      active: false,
      cancelled: false,
      renewalActive: false,
      paidThrough: null,
      nextCharge: null,
      usedToday: 0,
      dailyLimit: 10,
      trialEnabled: true,
      trialUsed: 2,
      trialLimit: 5,
      trialPeriodDays: 14,
      trialEndsAt: "2026-11-15T15:00:00Z",
      trialExpired: false,
    });
    render(
      <MemoryRouter>
        <PlanPage />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText(
        "Você tem um teste grátis de IA disponível nesta conta.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Nenhum plano ativo nesta conta."),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/3 disponíveis hoje/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Usar meu teste grátis" }),
    ).toHaveAttribute("href", "/alimentacao");
    expect(
      screen
        .getByRole("heading", { level: 2, name: "Seu acesso à IA" })
        .compareDocumentPosition(
          screen.getByRole("heading", {
            name: "Mais facilidade no seu diário",
          }),
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
  it.each([false, true])(
    "explica o fim da cota ou do período sem confundir os dois (vencido: %s)",
    async (expired) => {
      account = { token: "google-token", email: "pessoa@example.com" };
      mockSessionAndApi({
        active: false,
        cancelled: false,
        renewalActive: false,
        paidThrough: null,
        nextCharge: null,
        usedToday: 0,
        dailyLimit: 10,
        trialEnabled: true,
        trialUsed: 5,
        trialLimit: 5,
        trialPeriodDays: 14,
        trialEndsAt: "2026-11-15T15:00:00Z",
        trialExpired: expired,
      });
      render(
        <MemoryRouter>
          <PlanPage />
        </MemoryRouter>,
      );
      expect(
        await screen.findByText(
          expired
            ? "Seu teste grátis terminou. Seu diário manual continua gratuito."
            : "Você usou as análises grátis de hoje. Elas renovam à meia-noite de Brasília.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText("Nenhum plano ativo nesta conta."),
      ).not.toBeInTheDocument();
      expect(
        screen.getByRole("link", {
          name: expired
            ? "Continuar com meu diário gratuito"
            : "Continuar registrando grátis",
        }),
      ).toHaveAttribute("href", "/alimentacao");
      expect(
        screen.getByText("Opções avançadas").closest("details"),
      ).not.toHaveAttribute("open");
    },
  );
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
