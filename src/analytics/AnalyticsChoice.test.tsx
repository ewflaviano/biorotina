import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { AnalyticsChoice } from "./AnalyticsChoice";

beforeEach(() => localStorage.clear());

describe("escolha de métricas", () => {
  it("começa desativada e permite recusar ou retirar uma permissão", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AnalyticsChoice />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(
        "Não enviamos métricas ao Google Analytics sem sua escolha.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Não permitir" }));
    expect(localStorage.getItem("biorotina.analytics.consent.v1")).toBe(
      "declined",
    );
    expect(
      screen.getByRole("button", { name: "Não permitir" }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Permitir métricas" }));
    expect(localStorage.getItem("biorotina.analytics.consent.v1")).toBe(
      "accepted",
    );
    await user.click(screen.getByRole("button", { name: "Não permitir" }));
    expect(localStorage.getItem("biorotina.analytics.consent.v1")).toBe(
      "declined",
    );
  });
});
