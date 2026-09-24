import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AnalyticsChoice } from "./AnalyticsChoice";
import { AnalyticsConsentBanner } from "./AnalyticsConsentBanner";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("aviso inicial de métricas", () => {
  it("explica os dados e permite recusar sem bloquear o app", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AnalyticsConsentBanner />
        <p>Conteúdo disponível</p>
      </MemoryRouter>,
    );

    expect(screen.getByText("Conteúdo disponível")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Escolha sobre métricas" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "O que é enviado" }));
    expect(
      screen.getByText(/Não enviamos registros de saúde/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacidade" })).toHaveAttribute(
      "href",
      "/privacidade",
    );
    await user.click(screen.getByRole("button", { name: "Recusar" }));
    expect(localStorage.getItem("biorotina.analytics.consent.v1")).toBe(
      "declined",
    );
    expect(
      screen.queryByRole("region", { name: "Escolha sobre métricas" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Conteúdo disponível")).toBeInTheDocument();
  });

  it("sincroniza a escolha do banner com Configurações", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AnalyticsConsentBanner />
        <AnalyticsChoice />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Aceitar" }));
    expect(localStorage.getItem("biorotina.analytics.consent.v1")).toBe(
      "accepted",
    );
    expect(
      screen.getByRole("button", { name: "Ativar métricas" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.queryByRole("region", { name: "Escolha sobre métricas" }),
    ).not.toBeInTheDocument();
  });

  it("não reaparece quando já existe uma escolha", () => {
    localStorage.setItem("biorotina.analytics.consent.v1", "accepted");
    const { rerender } = render(
      <MemoryRouter>
        <AnalyticsConsentBanner />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("region", { name: "Escolha sobre métricas" }),
    ).not.toBeInTheDocument();
    localStorage.setItem("biorotina.analytics.consent.v1", "declined");
    rerender(
      <MemoryRouter>
        <AnalyticsConsentBanner />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("region", { name: "Escolha sobre métricas" }),
    ).not.toBeInTheDocument();
  });
});
