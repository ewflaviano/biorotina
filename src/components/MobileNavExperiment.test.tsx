import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openDB } from "idb";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useExperimentExposure } from "../experiments/ExperimentContext";
import { MorePage } from "../pages/MorePage";
import { AppDataProvider } from "../state/AppDataContext";
import { DriveSyncProvider } from "../sync/DriveSyncContext";
import { Layout } from "./Layout";

const experimentState = vi.hoisted(() => ({ enabled: false }));
const recordUse = vi.hoisted(() => vi.fn());

vi.mock("../experiments/ExperimentContext", () => ({
  useExperiment: () => ({
    enabled: (key: string) =>
      key === "mobile-nav-meal-priority" && experimentState.enabled,
    recordUse,
  }),
  useExperimentExposure: vi.fn(),
}));

beforeEach(async () => {
  experimentState.enabled = false;
  recordUse.mockClear();
  vi.mocked(useExperimentExposure).mockClear();
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const db = await openDB("biorotina", 3);
  await db.clear("app");
  db.close();
});

function renderNavigation() {
  return render(
    <AppDataProvider>
      <DriveSyncProvider>
        <MemoryRouter initialEntries={["/mais"]}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/mais" element={<MorePage />} />
              <Route path="/peso" element={<p>Página de medidas</p>} />
              <Route path="/alimentacao" element={<p>Página de refeições</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </DriveSyncProvider>
    </AppDataProvider>,
  );
}

describe("experimento da barra móvel", () => {
  it("mantém Medidas na barra e Alimentação em Mais no controle", async () => {
    const user = userEvent.setup();
    renderNavigation();
    await screen.findByRole("heading", { name: "Mais áreas" });
    const nav = screen.getByRole("navigation", {
      name: "Navegação principal no celular",
    });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Hoje", "Medidas", "Atividade", "Água", "Mais"]);
    expect(
      within(
        screen.getByRole("navigation", { name: "Outras áreas" }),
      ).getByRole("link", { name: /^Alimentação/ }),
    ).toBeInTheDocument();
    await user.click(within(nav).getByRole("link", { name: "Medidas" }));
    expect(await screen.findByText("Página de medidas")).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Medidas" })).toHaveClass(
      "active",
    );
  });

  it("mostra Refeição na barra e Medidas em Mais na variante", async () => {
    experimentState.enabled = true;
    const user = userEvent.setup();
    renderNavigation();
    await screen.findByRole("heading", { name: "Mais áreas" });
    const nav = screen.getByRole("navigation", {
      name: "Navegação principal no celular",
    });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Hoje", "Atividade", "Refeição", "Água", "Mais"]);
    const more = screen.getByRole("navigation", { name: "Outras áreas" });
    expect(
      within(more).queryByRole("link", { name: /^Alimentação/ }),
    ).toBeNull();
    await user.click(within(more).getByRole("link", { name: /^Medidas/ }));
    expect(await screen.findByText("Página de medidas")).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Mais" })).toHaveClass(
      "active",
    );
    await user.click(within(nav).getByRole("link", { name: "Refeição" }));
    expect(await screen.findByText("Página de refeições")).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Refeição" })).toHaveClass(
      "active",
    );
    expect(vi.mocked(useExperimentExposure)).toHaveBeenCalledWith(
      "mobile-nav-meal-priority",
      true,
    );
  });
});
