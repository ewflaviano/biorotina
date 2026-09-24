import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { PlanPage } from "../src/pages/PlanPage";

const connect = vi.fn(async () => undefined);
vi.mock("../src/sync/DriveSyncContext", () => ({
  useDriveSync: () => ({
    account: null,
    available: true,
    busy: false,
    error: "",
    connect,
  }),
}));

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
});
