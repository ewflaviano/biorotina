import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openDB } from "idb";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FoodPage } from "../src/pages/FoodPage";
import { AppDataProvider, useAppData } from "../src/state/AppDataContext";
import { loadData, saveGeminiKey } from "../src/storage/indexedDb";
import { analyzeMealImage, prepareMealImage } from "../src/ai/gemini";

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
  useDriveSync: () => ({ account: null }),
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
});

describe("refeição por foto", () => {
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
});
