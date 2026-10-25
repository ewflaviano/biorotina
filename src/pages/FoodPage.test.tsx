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
import type { MealEntry } from "../domain/data";

const historyState = vi.hoisted(() => ({ meals: [] as MealEntry[] }));
const experimentState = vi.hoisted(() => ({
  enabled: false,
  recordUse: vi.fn(),
}));
const sync = vi.hoisted(() => ({ ready: true }));

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
    data: { meals: historyState.meals },
    mutate: vi.fn(),
    removeWithUndo: vi.fn(),
  }),
}));
vi.mock("../experiments/ExperimentContext", () => ({
  useExperimentExposure: vi.fn(),
  useExperiment: () => ({
    enabled: () => experimentState.enabled,
    recordUse: experimentState.recordUse,
  }),
}));
vi.mock("../sync/DriveSyncContext", () => ({
  useDriveSync: () => ({
    account: { id: "account-1", token: "test-token" },
    initialSyncReady: sync.ready,
  }),
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
  sync.ready = true;
  historyState.meals = [];
  experimentState.enabled = false;
  experimentState.recordUse.mockReset();
  vi.mocked(getTrialConfig).mockResolvedValue(true);
  vi.mocked(getPlanStatus).mockResolvedValue(activePlan);
  vi.mocked(prepareMealImage).mockResolvedValue({
    dataUrl: "data:image/jpeg;base64,AA==",
    base64: "AA==",
  });
});

it("mantém a refeição preenchível e aguarda o Drive para liberar o cadastro", () => {
  experimentState.enabled = true;
  sync.ready = false;
  const { rerender } = render(
    <MemoryRouter>
      <FoodPage />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("button", { name: "Salvar refeição" }),
  ).toBeDisabled();
  expect(
    screen.getByText(/Conferindo seus registros no Drive/),
  ).toBeInTheDocument();
  sync.ready = true;
  rerender(
    <MemoryRouter>
      <FoodPage />
    </MemoryRouter>,
  );
  expect(screen.getByRole("button", { name: "Salvar refeição" })).toBeEnabled();
});

it("restaura a lista e o foco ao limpar uma busca sem resultados na variante", () => {
  experimentState.enabled = true;
  const now = new Date().toISOString();
  historyState.meals = [
    {
      id: "meal-test",
      name: "Refeição sintética",
      eatenAt: now,
      createdAt: now,
      caloriesKcal: null,
      foods: [],
      photoAssisted: false,
    },
  ];
  render(
    <MemoryRouter>
      <FoodPage />
    </MemoryRouter>,
  );
  const search = screen.getByRole("searchbox", {
    name: "Buscar refeição neste dia",
  });
  fireEvent.change(search, { target: { value: "sem-correspondência" } });
  expect(screen.queryByRole("button", { name: "Limpar busca" })).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Limpar busca e ver registros" }),
  );
  expect(search).toHaveValue("");
  expect(search).toHaveFocus();
  expect(screen.getByText("Refeição sintética")).toBeInTheDocument();
  expect(experimentState.recordUse).toHaveBeenCalledWith(
    "food-history-clear-search",
  );
});

describe("atalho experimental no histórico vazio de refeições", () => {
  function renderOnEmptyDay() {
    historyState.meals = [
      {
        id: "meal-test",
        name: "Refeição sintética",
        eatenAt: "2026-10-02T12:00:00Z",
        createdAt: "2026-10-02T12:00:00Z",
        caloriesKcal: null,
        foods: [],
        photoAssisted: false,
      },
    ];
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/", state: { day: "2026-10-03" } }]}
      >
        <FoodPage />
      </MemoryRouter>,
    );
  }

  it("mantém o controle sem atalho", () => {
    renderOnEmptyDay();
    expect(
      screen.queryByRole("button", { name: /Ver refeições de/ }),
    ).not.toBeInTheDocument();
  });

  it("abre o último dia anterior com refeição e foca a data", () => {
    experimentState.enabled = true;
    renderOnEmptyDay();
    fireEvent.click(screen.getByRole("button", { name: /Ver refeições de/ }));
    expect(screen.getByLabelText("Data do histórico de refeições")).toHaveValue(
      "2026-10-02",
    );
    expect(
      screen.getByLabelText("Data do histórico de refeições"),
    ).toHaveFocus();
    expect(screen.getByText("Refeição sintética")).toBeInTheDocument();
    expect(experimentState.recordUse).toHaveBeenCalledWith(
      "food-history-last-day-shortcut",
    );
  });

  it("não oferece o atalho enquanto há busca ativa", () => {
    experimentState.enabled = true;
    renderOnEmptyDay();
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Buscar refeição neste dia" }),
      { target: { value: "outra" } },
    );
    expect(
      screen.queryByRole("button", { name: /Ver refeições de/ }),
    ).not.toBeInTheDocument();
  });
});

describe("atalho experimental ao próximo dia com refeição", () => {
  function renderOnEmptyDay() {
    historyState.meals = [
      {
        id: "meal-next-test",
        name: "Refeição posterior sintética",
        eatenAt: "2026-10-04T12:00:00Z",
        createdAt: "2026-10-04T12:00:00Z",
        caloriesKcal: null,
        foods: [],
        photoAssisted: false,
      },
    ];
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/", state: { day: "2026-10-03" } }]}
      >
        <FoodPage />
      </MemoryRouter>,
    );
  }

  it("mantém o controle sem atalho", () => {
    renderOnEmptyDay();
    expect(
      screen.queryByRole("button", { name: /Ver refeições de/ }),
    ).not.toBeInTheDocument();
  });

  it("abre o primeiro dia posterior com refeição e foca a data", () => {
    experimentState.enabled = true;
    renderOnEmptyDay();
    fireEvent.click(screen.getByRole("button", { name: /Ver refeições de/ }));
    expect(screen.getByLabelText("Data do histórico de refeições")).toHaveValue(
      "2026-10-04",
    );
    expect(
      screen.getByLabelText("Data do histórico de refeições"),
    ).toHaveFocus();
    expect(
      screen.getByText("Refeição posterior sintética"),
    ).toBeInTheDocument();
    expect(experimentState.recordUse).toHaveBeenCalledWith(
      "food-history-next-day-shortcut",
    );
  });

  it("não oferece o atalho enquanto há busca ativa", () => {
    experimentState.enabled = true;
    renderOnEmptyDay();
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Buscar refeição neste dia" }),
      { target: { value: "outra" } },
    );
    expect(
      screen.queryByRole("button", { name: /Ver refeições de/ }),
    ).not.toBeInTheDocument();
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

  it("mostra a falha da análise perto da foto e permite tentar outra", async () => {
    vi.mocked(analyzeWithPlan).mockRejectedValueOnce(
      new Error("Não identificamos uma refeição nesta foto."),
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
    await screen.findByRole("button", { name: "Analisar foto" });
    fireEvent.click(screen.getByRole("button", { name: "Analisar foto" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Não identificamos uma refeição nesta foto.",
    );
    expect(alert.closest(".meal-photo-box")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Analisar foto" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Remover foto" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

it("preenche pela descrição somente no experimento e permite revisar", async () => {
  experimentState.enabled = true;
  vi.mocked(analyzeWithPlan).mockResolvedValueOnce({
    description: "Arroz e feijão",
    foods: [{ name: "Arroz", amount: "3 colheres", caloriesKcal: 150 }],
  });
  render(
    <MemoryRouter>
      <FoodPage />
    </MemoryRouter>,
  );
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: "Descrever refeição" }));
  expect(
    screen.getByRole("button", { name: "Analisar descrição" }),
  ).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Descrição do prato"), {
    target: { value: "3 colheres de arroz e feijão" },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Analisar descrição" }));
  });
  expect(analyzeWithPlan).toHaveBeenLastCalledWith(
    "test-token",
    "3 colheres de arroz e feijão",
  );
  expect(screen.getByDisplayValue("Arroz e feijão")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Salvar refeição" })).toBeEnabled();
});

it("mantém descrição oculta no controle", async () => {
  render(
    <MemoryRouter>
      <FoodPage />
    </MemoryRouter>,
  );
  await act(async () => {});
  expect(
    screen.queryByRole("button", { name: "Descrever refeição" }),
  ).not.toBeInTheDocument();
});
