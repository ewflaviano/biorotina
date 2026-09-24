import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { AnalyticsChoice } from "./AnalyticsChoice";

beforeEach(() => localStorage.clear());

describe("escolha de métricas", () => {
  it("começa ativa, permite desativar e reativar a medição", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <AnalyticsChoice />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/Medimos visitas, origem aproximada/),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Desativar métricas" }),
    );
    expect(localStorage.getItem("biorotina.analytics.consent.v1")).toBe(
      "declined",
    );
    expect(
      screen.getByRole("button", { name: "Desativar métricas" }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Ativar métricas" }));
    expect(localStorage.getItem("biorotina.analytics.consent.v1")).toBe(
      "accepted",
    );
    await user.click(
      screen.getByRole("button", { name: "Desativar métricas" }),
    );
    expect(localStorage.getItem("biorotina.analytics.consent.v1")).toBe(
      "declined",
    );
  });
});
