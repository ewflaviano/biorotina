import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPlanStatus,
  getTrialConfig,
  type PlanStatus,
} from "../billing/client";
import { FoodPage } from "./FoodPage";

const activePlan: PlanStatus = {
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
};

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
  vi.mocked(getPlanStatus).mockResolvedValue(activePlan);
});

describe("opções de foto para assinantes", () => {
  it("esconde as alternativas e usa o plano ativo", async () => {
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
    expect(
      screen.queryByRole("button", { name: "Minha chave Gemini" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Como analisar a foto" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/A foto é enviada/)).toHaveTextContent(
      "à Biorotina e ao Google",
    );
    expect(screen.queryByText(/Conhecer o plano/)).not.toBeInTheDocument();
    expect(screen.queryByText(/O teste grátis exige/)).not.toBeInTheDocument();
  });

  it("mantém a chave como opção quando não há plano ativo", async () => {
    vi.mocked(getPlanStatus).mockResolvedValue({
      ...activePlan,
      active: false,
    });
    render(
      <MemoryRouter>
        <FoodPage />
      </MemoryRouter>,
    );
    expect(
      await screen.findByRole("button", { name: "Minha chave Gemini" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Testar grátis" }),
    ).toBeInTheDocument();
  });
});
