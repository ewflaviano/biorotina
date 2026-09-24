import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPlanStatus, getTrialConfig } from "../billing/client";
import { FoodPage } from "./FoodPage";

vi.mock("../state/AppDataContext", () => ({
  useAppData: () => ({
    data: { meals: [] },
    mutate: vi.fn(),
    removeWithUndo: vi.fn(),
  }),
}));
vi.mock("../sync/DriveSyncContext", () => ({
  useDriveSync: () => ({ account: { id: "account-1", token: "test-token" } }),
}));
vi.mock("../storage/indexedDb", () => ({
  loadGeminiKey: vi.fn().mockResolvedValue(null),
}));
vi.mock("../billing/client", () => ({
  getPlanStatus: vi.fn(),
  getTrialConfig: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(getTrialConfig).mockResolvedValue(true);
  vi.mocked(getPlanStatus).mockResolvedValue({
    active: true,
    cancelled: false,
    renewalActive: true,
    paidThrough: null,
    nextCharge: null,
    usedToday: 0,
    dailyLimit: 10,
    trialEnabled: true,
    trialUsed: 0,
    trialLimit: 5,
  });
});

describe("opções de foto para assinantes", () => {
  it("esconde o teste grátis e seleciona o plano ativo", async () => {
    render(
      <MemoryRouter>
        <FoodPage />
      </MemoryRouter>,
    );
    expect(
      await screen.findByText("Seu plano está ativo: até 10 análises por dia."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Testar grátis" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Meu plano" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByText(/Conhecer o plano/)).not.toBeInTheDocument();
    expect(screen.queryByText(/O teste grátis exige/)).not.toBeInTheDocument();
  });
});
