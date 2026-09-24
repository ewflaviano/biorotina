import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openDB } from "idb";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GeminiSettings } from "./GeminiSettings";
import { loadGeminiKey, saveGeminiKey } from "../storage/indexedDb";
import { getPlanStatus } from "../billing/client";

let account: { id: string; token: string } | null = null;
vi.mock("../sync/DriveSyncContext", () => ({
  useDriveSync: () => ({ account }),
}));
vi.mock("../billing/client", () => ({ getPlanStatus: vi.fn() }));

beforeEach(async () => {
  account = null;
  vi.mocked(getPlanStatus).mockReset();
  const db = await openDB("biorotina", 3);
  await db.clear("geminiKey");
  db.close();
});

describe("configuração da chave Gemini", () => {
  it("salva, oculta e remove a chave localmente", async () => {
    const user = userEvent.setup();
    render(<GeminiSettings />);
    expect(screen.getByText(/Nenhuma chave configurada/)).toBeInTheDocument();
    await user.type(
      screen.getByLabelText("Sua chave Gemini"),
      "chave-para-teste",
    );
    await user.click(screen.getByRole("button", { name: "Salvar chave" }));
    await waitFor(async () =>
      expect(await loadGeminiKey()).toBe("chave-para-teste"),
    );
    expect(screen.getByLabelText("Substituir chave Gemini")).toHaveValue("");
    expect(screen.queryByText("chave-para-teste")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remover chave" }));
    await waitFor(async () => expect(await loadGeminiKey()).toBeNull());
    expect(getPlanStatus).not.toHaveBeenCalled();
  });

  it("não oferece cadastrar chave para plano ativo e permite remover a existente", async () => {
    await saveGeminiKey("chave-anterior");
    account = { id: "conta-paga", token: "token-teste" };
    vi.mocked(getPlanStatus).mockResolvedValue({
      active: true,
      cancelled: false,
      renewalActive: true,
      paidThrough: "2026-10-24",
      nextCharge: "2026-10-24",
      usedToday: 3,
      dailyLimit: 10,
      checkoutUrl: null,
      trialEnabled: true,
      trialUsed: 0,
      trialLimit: 5,
    });
    const user = userEvent.setup();
    render(<GeminiSettings />);
    expect(screen.queryByLabelText("Sua chave Gemini")).toBeNull();
    expect(
      await screen.findByText(
        "Seu plano ativo analisa fotos sem usar esta chave.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Salvar chave" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Remover chave" }));
    await waitFor(async () => expect(await loadGeminiKey()).toBeNull());
    expect(
      screen.queryByText("Chave Gemini guardada neste aparelho"),
    ).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Chave removida");
  });
});
