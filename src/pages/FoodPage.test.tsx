import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyzeWithPlan,
  getPlanStatus,
  getTrialConfig,
  type PlanStatus,
} from "../billing/client";
import { prepareMealImage } from "../ai/gemini";
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
  analyzeWithPlan: vi.fn(),
  getPlanStatus: vi.fn(),
  getTrialConfig: vi.fn(),
}));
vi.mock("../ai/gemini", () => ({
  analyzeMealImage: vi.fn(),
  prepareMealImage: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(getTrialConfig).mockResolvedValue(true);
  vi.mocked(getPlanStatus).mockResolvedValue(activePlan);
  vi.mocked(prepareMealImage).mockResolvedValue({
    dataUrl: "data:image/jpeg;base64,AA==",
    base64: "AA==",
  });
});

describe("opções de foto para assinantes", () => {
  it("não oferece chave enquanto ainda consulta a assinatura", async () => {
    let finishPlanCheck!: (value: PlanStatus) => void;
    vi.mocked(getPlanStatus).mockReturnValue(
      new Promise((resolve) => {
        finishPlanCheck = resolve;
      }),
    );
    render(
      <MemoryRouter>
        <FoodPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Consultando seu plano…")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Minha chave Gemini" }),
    ).not.toBeInTheDocument();
    await act(async () => {
      finishPlanCheck(activePlan);
    });
    expect(
      screen.queryByText("Consultando seu plano…"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Seu plano está ativo: até 10 análises por dia."),
    ).toBeInTheDocument();
  });

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

  it("mostra preparação e análise da foto sem ocultar a revisão", async () => {
    let finishPreparation!: (value: {
      dataUrl: string;
      base64: string;
    }) => void;
    vi.mocked(prepareMealImage).mockReturnValue(
      new Promise((resolve) => {
        finishPreparation = resolve;
      }),
    );
    let finishAnalysis!: (value: {
      description: string;
      foods: { name: string; amount: string; caloriesKcal: number }[];
    }) => void;
    vi.mocked(analyzeWithPlan).mockReturnValue(
      new Promise((resolve) => {
        finishAnalysis = resolve;
      }),
    );
    render(
      <MemoryRouter>
        <FoodPage />
      </MemoryRouter>,
    );
    await screen.findByText("Seu plano está ativo: até 10 análises por dia.");

    fireEvent.change(document.getElementById("meal-gallery")!, {
      target: {
        files: [new File(["photo"], "meal.jpg", { type: "image/jpeg" })],
      },
    });
    expect(screen.getByText("Preparando foto…")).toBeInTheDocument();
    await act(async () => {
      finishPreparation({
        dataUrl: "data:image/jpeg;base64,AA==",
        base64: "AA==",
      });
    });
    expect(screen.queryByText("Preparando foto…")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Analisar foto" }));
    expect(
      screen.getByRole("button", { name: "Analisando foto…" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Você poderá revisar a sugestão antes de salvar/),
    ).toBeInTheDocument();
    await act(async () => {
      finishAnalysis({
        description: "Arroz com feijão",
        foods: [{ name: "Arroz", amount: "1 xícara", caloriesKcal: 200 }],
      });
    });
    expect(screen.getByDisplayValue("Arroz com feijão")).toBeInTheDocument();
    expect(screen.getByText("Alimentos sugeridos")).toBeInTheDocument();
    expect(screen.queryByText(/Você poderá revisar/)).not.toBeInTheDocument();
  });
});
