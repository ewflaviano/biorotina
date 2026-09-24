import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openDB } from "idb";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FoodPage } from "../src/pages/FoodPage";
import { AppDataProvider, useAppData } from "../src/state/AppDataContext";
import { loadData, saveGeminiKey } from "../src/storage/indexedDb";
import { analyzeMealImage, prepareMealImage } from "../src/ai/gemini";
import {
  analyzeWithPlan,
  getPlanStatus,
  getTrialConfig,
} from "../src/billing/client";

let driveAccount: { id: string; token: string } | null = null;

vi.mock("../src/ai/gemini", () => ({
  prepareMealImage: vi.fn(async () => ({
    dataUrl: "data:image/jpeg;base64,Zm9v",
    base64: "Zm9v",
  })),
  analyzeMealImage: vi.fn(async () => ({
    description: "Almoço",
    foods: [
      { name: "Arroz", amount: "100 g", caloriesKcal: 130 },
      { name: "Feijão", amount: "80 g", caloriesKcal: 90 },
    ],
  })),
}));

vi.mock("../src/sync/DriveSyncContext", () => ({
  useDriveSync: () => ({ account: driveAccount }),
}));
vi.mock("../src/billing/client", () => ({
  analyzeWithPlan: vi.fn(),
  getPlanStatus: vi.fn(),
  getTrialConfig: vi.fn(),
}));

function Ready() {
  return useAppData().loading ? null : <span data-testid="ready" />;
}

beforeEach(async () => {
  const db = await openDB("biorotina", 3);
  await db.clear("app");
  await db.clear("geminiKey");
  db.close();
  vi.clearAllMocks();
  driveAccount = null;
  vi.mocked(getTrialConfig).mockResolvedValue(false);
});

describe("refeição por foto", () => {
  it("oferece plano ou chave antes de abrir a câmera sem login nem chave", async () => {
    const user = userEvent.setup();
    render(
      <AppDataProvider>
        <MemoryRouter>
          <Ready />
          <FoodPage />
        </MemoryRouter>
      </AppDataProvider>,
    );
    await screen.findByTestId("ready");
    await user.click(screen.getByText("Tirar foto"));
    expect(
      await screen.findByRole("dialog", { name: "Análise de fotos" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver plano" })).toHaveAttribute(
      "href",
      "/assinatura",
    );
    expect(
      screen.getByRole("link", { name: "Usar minha chave" }),
    ).toHaveAttribute("href", "/configuracoes");
    await user.click(
      screen.getByRole("button", { name: "Continuar sem foto" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Descrição")).toHaveFocus();
    const photoToggle = screen.getByRole("button", {
      name: "Preencher com uma foto",
    });
    expect(photoToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Tirar foto")).not.toBeInTheDocument();
    await user.click(photoToggle);
    expect(photoToggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Tirar foto")).toBeInTheDocument();
    expect(getTrialConfig).not.toHaveBeenCalled();
  });

  it("só analisa após confirmação, permite corrigir e salva sem a foto ou a chave", async () => {
    await saveGeminiKey("chave-pessoal");
    const user = userEvent.setup();
    render(
      <AppDataProvider>
        <MemoryRouter>
          <Ready />
          <FoodPage />
        </MemoryRouter>
      </AppDataProvider>,
    );
    await screen.findByTestId("ready");
    expect(getTrialConfig).not.toHaveBeenCalled();
    await user.click(screen.getByText("Tirar foto"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.upload(
      screen.getByLabelText("Escolher imagem"),
      new File(["foto"], "prato.jpg", { type: "image/jpeg" }),
    );
    expect(prepareMealImage).toHaveBeenCalledOnce();
    expect(analyzeMealImage).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Analisar foto" }));
    expect(await screen.findByLabelText("Alimento 1")).toHaveValue("Arroz");
    expect(screen.getByLabelText(/Calorias consumidas/)).toHaveValue("220");
    await user.clear(screen.getByLabelText("Alimento 1"));
    await user.type(screen.getByLabelText("Alimento 1"), "Arroz integral");
    await user.clear(screen.getByLabelText(/Calorias consumidas/));
    await user.type(screen.getByLabelText(/Calorias consumidas/), "210");
    await user.click(screen.getByRole("button", { name: "Salvar refeição" }));

    await waitFor(async () => expect((await loadData()).meals).toHaveLength(1));
    const saved = (await loadData()).meals[0];
    expect(saved).toMatchObject({
      name: "Almoço",
      caloriesKcal: 210,
      photoAssisted: true,
    });
    expect(saved.foods[0]).toEqual({
      name: "Arroz integral",
      amount: "100 g",
      caloriesKcal: 130,
    });
    expect(saved.foods).toHaveLength(2);
    expect(JSON.stringify(saved)).not.toContain("chave-pessoal");
    expect(JSON.stringify(saved)).not.toContain("Zm9v");
  });

  it("permite a quinta análise grátis e oferece plano ou chave na seguinte", async () => {
    driveAccount = { id: "conta-1", token: "google-token" };
    vi.mocked(getTrialConfig).mockResolvedValue(true);
    let used = 4;
    vi.mocked(getPlanStatus).mockImplementation(async () => ({
      active: false,
      cancelled: false,
      renewalActive: false,
      paidThrough: null,
      nextCharge: null,
      usedToday: 0,
      dailyLimit: 10,
      checkoutUrl: null,
      trialEnabled: true,
      trialUsed: used,
      trialLimit: 5,
    }));
    vi.mocked(analyzeWithPlan).mockImplementation(async () => {
      used += 1;
      return {
        description: "Almoço",
        foods: [{ name: "Arroz", amount: "100 g", caloriesKcal: 130 }],
      };
    });
    const user = userEvent.setup();
    render(
      <AppDataProvider>
        <MemoryRouter>
          <Ready />
          <FoodPage />
        </MemoryRouter>
      </AppDataProvider>,
    );
    await screen.findByTestId("ready");
    await screen.findByRole("button", { name: "Testar grátis" });
    expect(getTrialConfig).toHaveBeenCalledOnce();
    await user.click(screen.getByText("Tirar foto"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.upload(
      screen.getByLabelText("Escolher imagem"),
      new File(["foto"], "prato.jpg", { type: "image/jpeg" }),
    );
    await user.click(screen.getByRole("button", { name: "Analisar foto" }));
    await waitFor(() => expect(analyzeWithPlan).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByText(/0 restantes/)).toBeInTheDocument(),
    );
    await user.click(screen.getByText("Tirar foto"));
    expect(
      await screen.findByRole("dialog", { name: "Suas fotos grátis acabaram" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver plano" })).toHaveAttribute(
      "href",
      "/assinatura",
    );
    expect(
      screen.getByRole("link", { name: "Usar minha chave" }),
    ).toHaveAttribute("href", "/configuracoes");
    expect(analyzeWithPlan).toHaveBeenCalledTimes(1);
  });
});
