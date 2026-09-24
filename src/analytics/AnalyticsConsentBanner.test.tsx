import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AnalyticsChoice } from "./AnalyticsChoice";
import { AnalyticsConsentBanner } from "./AnalyticsConsentBanner";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("aviso inicial de métricas", () => {
  it("abre um diálogo visível, explica os dados e permite recusar", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AnalyticsConsentBanner />
        <p>Conteúdo disponível</p>
      </MemoryRouter>,
    );

    expect(screen.getByText("Conteúdo disponível")).toBeInTheDocument();
    const dialog = screen.getByRole("dialog", {
      name: /Podemos usar métricas de visitas/,
    });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
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
      screen.queryByRole("dialog", { name: /Podemos usar métricas/ }),
    ).not.toBeInTheDocument();
    expect(document.body.style.overflow).toBe("");
    expect(screen.getByText("Conteúdo disponível")).toBeInTheDocument();
  });

  it("sincroniza a escolha do diálogo com Configurações", async () => {
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
      screen.queryByRole("dialog", { name: /Podemos usar métricas/ }),
    ).not.toBeInTheDocument();
  });

  it("permite ler a privacidade sem registrar uma escolha", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AnalyticsConsentBanner />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "O que é enviado" }));
    await user.click(screen.getByRole("link", { name: "Privacidade" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem("biorotina.analytics.consent.v1")).toBeNull();
  });

  it("não reaparece quando já existe uma escolha", () => {
    localStorage.setItem("biorotina.analytics.consent.v1", "accepted");
    const { rerender } = render(
      <MemoryRouter>
        <AnalyticsConsentBanner />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("dialog", { name: /Podemos usar métricas/ }),
    ).not.toBeInTheDocument();
    localStorage.setItem("biorotina.analytics.consent.v1", "declined");
    rerender(
      <MemoryRouter>
        <AnalyticsConsentBanner />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("dialog", { name: /Podemos usar métricas/ }),
    ).not.toBeInTheDocument();
  });
});
