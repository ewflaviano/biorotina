import { fireEvent, render, screen, within } from "@testing-library/react";
import { openDB } from "idb";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyData, toLocalDateTime } from "../domain/data";
import { AppDataProvider, useAppData } from "../state/AppDataContext";
import { DriveSyncProvider } from "../sync/DriveSyncContext";
import { saveData } from "../storage/indexedDb";
import { FoodPage } from "./FoodPage";

const experiment = vi.hoisted(() => ({
  enabled: false,
  recordUse: vi.fn(),
}));
vi.mock("../experiments/ExperimentContext", () => ({
  useExperimentExposure: vi.fn(),
  useExperiment: () => ({
    enabled: () => experiment.enabled,
    recordUse: experiment.recordUse,
  }),
}));

function ReadyMarker() {
  const { loading } = useAppData();
  return loading ? null : <span data-testid="data-ready" hidden />;
}

async function renderFoodPage() {
  render(
    <AppDataProvider>
      <DriveSyncProvider>
        <ReadyMarker />
        <MemoryRouter>
          <FoodPage />
        </MemoryRouter>
      </DriveSyncProvider>
    </AppDataProvider>,
  );
  await screen.findByTestId("data-ready");
}

beforeEach(async () => {
  experiment.enabled = false;
  experiment.recordUse.mockReset();
  const db = await openDB("biorotina", 3);
  await db.clear("app");
  db.close();

  const data = emptyData();
  const now = new Date().toISOString();
  const past = "2026-01-01T12:00:00.000Z";
  data.meals = [
    {
      id: crypto.randomUUID(),
      name: "Antiga",
      caloriesKcal: 5000,
      foods: [],
      photoAssisted: false,
      eatenAt: past,
      createdAt: past,
    },
    {
      id: crypto.randomUUID(),
      name: "Almoço",
      caloriesKcal: 230,
      foods: [],
      photoAssisted: false,
      eatenAt: now,
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      name: "Lanche",
      caloriesKcal: null,
      foods: [],
      photoAssisted: false,
      eatenAt: now,
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      name: "Café",
      caloriesKcal: 0,
      foods: [],
      photoAssisted: false,
      eatenAt: now,
      createdAt: now,
    },
  ];
  await saveData(data);
});

describe("resumo experimental das refeições", () => {
  it("preserva o resumo histórico no grupo de controle", async () => {
    await renderFoodPage();
    const card = screen.getByText("Refeições registradas").closest(".panel");
    expect(card).toHaveTextContent("4");
    expect(card).toHaveTextContent("5.230 kcal informadas em 3 refeições.");
  });

  it("soma apenas o dia selecionado e distingue zero de calorias ausentes", async () => {
    experiment.enabled = true;
    await renderFoodPage();
    const card = screen.getByText(/Calorias de /).closest(".panel");
    expect(card).toHaveTextContent("230 kcal");
    expect(card).toHaveTextContent(
      "3 refeições registradas neste dia. 2 com calorias informadas.",
    );

    fireEvent.change(screen.getByLabelText("Data do histórico de refeições"), {
      target: {
        value: toLocalDateTime("2026-01-01T12:00:00.000Z").slice(0, 10),
      },
    });
    expect(
      within(card as HTMLElement).getByText(/Calorias de /),
    ).toHaveTextContent("1 de janeiro de 2026");
    expect(card).toHaveTextContent("5.000 kcal");
    expect(card).toHaveTextContent(
      "1 refeição registrada neste dia. 1 com calorias informadas.",
    );
    expect(experiment.recordUse).toHaveBeenCalledWith("food-daily-calories");
  });
});
