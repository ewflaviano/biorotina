import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { openDB } from "idb";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import { emptyData, type WeightEntry } from "../domain/data";
import { AppDataProvider } from "../state/AppDataContext";
import { PushProvider } from "../state/PushContext";
import { loadData, saveData } from "../storage/indexedDb";
import { Layout } from "./Layout";
import { ActivityWeekChart, WeightTrend } from "./ProgressCharts";
import { HydrationPage } from "../pages/HydrationPage";
import { DateTimeField } from "./DateTimeField";

beforeEach(async () => {
  const db = await openDB("biorotina", 1);
  await db.clear("app");
  db.close();
});

describe("navegação", () => {
  it("permite chegar às áreas principais e às configurações por links com rótulos", async () => {
    const data = emptyData();
    data.profile.displayName = "Ana";
    await saveData(data);
    const user = userEvent.setup();
    render(
      <AppDataProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<p>Início de teste</p>} />
              <Route path="/peso" element={<p>Área de peso</p>} />
              <Route path="/hidratacao" element={<p>Área de hidratação</p>} />
              <Route path="/mais" element={<p>Outras áreas</p>} />
              <Route
                path="/configuracoes"
                element={<p>Área de configurações</p>}
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </AppDataProvider>,
    );
    expect(
      await screen.findByText("Seu espaço de cuidado, Ana"),
    ).toBeInTheDocument();
    await user.click(screen.getAllByRole("link", { name: "Peso" })[0]);
    expect(await screen.findByText("Área de peso")).toBeInTheDocument();
    await user.click(screen.getAllByRole("link", { name: "Hidratação" })[0]);
    expect(await screen.findByText("Área de hidratação")).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Mais áreas" }));
    expect(await screen.findByText("Outras áreas")).toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Abrir configurações" }));
    expect(
      await screen.findByText("Área de configurações"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mais áreas" })).toHaveClass(
      "active",
    );
  });

  it("permite desfazer exclusão mesmo depois de navegar para outra tela", async () => {
    const data = emptyData();
    const now = new Date().toISOString();
    data.hydrationEntries = [
      { id: crypto.randomUUID(), amountMl: 330, drankAt: now, createdAt: now },
    ];
    await saveData(data);
    const user = userEvent.setup();
    render(
      <AppDataProvider>
        <PushProvider>
          <MemoryRouter initialEntries={["/hidratacao"]}>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<p>Painel de teste</p>} />
                <Route path="/hidratacao" element={<HydrationPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </PushProvider>
      </AppDataProvider>,
    );
    await screen.findByRole("button", { name: /Excluir água de 330 ml/ });
    await user.click(
      screen.getByRole("button", { name: /Excluir água de 330 ml/ }),
    );
    await waitFor(async () =>
      expect((await loadData()).hydrationEntries).toHaveLength(0),
    );
    expect(
      screen.getByText("Registro removido: Água de 330 ml."),
    ).toBeInTheDocument();
    await user.click(screen.getAllByRole("link", { name: "Hoje" })[0]);
    expect(screen.getByText("Painel de teste")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Desfazer" }));
    await waitFor(async () =>
      expect((await loadData()).hydrationEntries).toHaveLength(1),
    );
    expect(
      screen.queryByText("Registro removido: Água de 330 ml."),
    ).not.toBeInTheDocument();
  });
});

describe("visualizações de progresso", () => {
  it("oculta tendência de peso com uma única medida e lida com pesos iguais", () => {
    const now = new Date().toISOString();
    const point = (id: string): WeightEntry => ({
      id,
      createdAt: now,
      measuredAt: now,
      weightKg: 72,
      note: "",
    });
    const { rerender } = render(
      <WeightTrend entries={[point(crypto.randomUUID())]} />,
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    rerender(
      <WeightTrend
        entries={[point(crypto.randomUUID()), point(crypto.randomUUID())]}
      />,
    );
    expect(
      screen.getByRole("img", { name: /Evolução das últimas 2 medidas/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Os valores exatos estão no histórico/),
    ).toBeInTheDocument();
  });

  it("identifica os dias sem registro como zero, sem inventar atividade", () => {
    render(<ActivityWeekChart entries={[]} />);
    expect(screen.getByRole("img", { name: /0 minutos/ })).toBeInTheDocument();
    expect(
      screen.getByText(/Dias vazios indicam apenas ausência de registro/),
    ).toBeInTheDocument();
  });
});

describe("campos de registro", () => {
  it("permite atualizar uma data antiga para o horário atual em um toque", async () => {
    function Probe() {
      const [value, setValue] = useState("2026-01-01T12:00");
      return <DateTimeField id="date-test" value={value} onChange={setValue} />;
    }
    const user = userEvent.setup();
    render(<Probe />);
    await user.click(screen.getByRole("button", { name: "Agora" }));
    const date = (screen.getByLabelText("Data") as HTMLInputElement).value;
    const time = (screen.getByLabelText("Horário (24 h)") as HTMLSelectElement)
      .value;
    expect(
      Math.abs(Date.now() - new Date(`${date}T${time}`).getTime()),
    ).toBeLessThan(60_000);
  });
});
