import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { AnalyticsConsentDialog } from "./AnalyticsConsentDialog";

function ConsentFlow() {
  const [open, setOpen] = useState(true);
  return open ? (
    <AnalyticsConsentDialog onClose={() => setOpen(false)} />
  ) : null;
}

afterEach(() => localStorage.clear());

describe("first visit analytics choice", () => {
  it("saves refusal and closes the dialog", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ConsentFlow />
      </MemoryRouter>,
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "registros de saúde nunca entram",
    );
    await user.click(screen.getByRole("button", { name: "Não permitir" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem("biorotina.analytics.consent.v1")).toBe(
      "declined",
    );
  });

  it("saves acceptance before closing, without waiting for the SDK", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ConsentFlow />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Permitir métricas" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem("biorotina.analytics.consent.v1")).toBe(
      "accepted",
    );
  });

  it("allows postponing without recording consent", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ConsentFlow />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Agora não" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem("biorotina.analytics.consent.v1")).toBeNull();
  });
});
