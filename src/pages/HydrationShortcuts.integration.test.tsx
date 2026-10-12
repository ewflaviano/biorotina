import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openDB } from "idb";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { emptyData } from "../domain/data";
import { AppDataProvider } from "../state/AppDataContext";
import { loadData, saveData, saveDataIfRevision } from "../storage/indexedDb";
import { HydrationPage } from "./HydrationPage";

const flags = vi.hoisted(() => ({ enabled: true, ready: true }));
vi.mock("../experiments/ExperimentContext", () => ({
  useExperimentExposure: vi.fn(),
  useExperiment: () => ({
    enabled: (key: string) =>
      key === "hydration-custom-shortcuts" && flags.enabled,
    recordUse: vi.fn(),
    startAttempt: () => vi.fn(),
  }),
}));
vi.mock("../sync/DriveSyncContext", () => ({
  useOptionalDriveSync: () => ({ initialSyncReady: flags.ready }),
}));
vi.mock("../components/PushActivationPrompt", () => ({
  PushActivationPrompt: () => null,
}));
vi.mock("../storage/indexedDb", async (original) => {
  const actual = await original<typeof import("../storage/indexedDb")>();
  return { ...actual, saveDataIfRevision: vi.fn(actual.saveDataIfRevision) };
});

function app() {
  return (
    <AppDataProvider>
      <MemoryRouter>
        <HydrationPage />
      </MemoryRouter>
    </AppDataProvider>
  );
}

beforeEach(async () => {
  const db = await openDB("biorotina", 3);
  await db.clear("app");
  db.close();
  flags.enabled = true;
  flags.ready = true;
  vi.mocked(saveDataIfRevision).mockClear();
});

it("persiste os três atalhos sem criar água e registra exatamente um volume escolhido após reabrir", async () => {
  const user = userEvent.setup();
  const view = render(app());
  await user.click(
    await screen.findByRole("button", { name: "Editar atalhos" }),
  );
  expect(screen.getByLabelText("Atalho 1 (ml)")).toHaveFocus();
  for (const [index, value] of [350, 400, 600].entries()) {
    const input = screen.getByLabelText(`Atalho ${index + 1} (ml)`);
    await user.clear(input);
    await user.type(input, String(value));
  }
  await user.click(screen.getByRole("button", { name: "Salvar atalhos" }));
  expect(
    await screen.findByRole("button", { name: "350 ml" }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Editar atalhos" }),
    ).toHaveFocus(),
  );
  expect((await loadData()).hydrationEntries).toEqual([]);
  expect((await loadData()).hydrationQuickAmounts).toEqual([350, 400, 600]);
  view.unmount();
  render(app());
  await user.click(await screen.findByRole("button", { name: "350 ml" }));
  await waitFor(async () =>
    expect((await loadData()).hydrationEntries).toHaveLength(1),
  );
  expect((await loadData()).hydrationEntries[0].amountMl).toBe(350);
});

it("cancela alterações e restaura os padrões sem alterar registros", async () => {
  const data = emptyData();
  data.hydrationQuickAmounts = [350, 400, 600];
  await saveData(data);
  const user = userEvent.setup();
  render(app());
  await user.click(
    await screen.findByRole("button", { name: "Editar atalhos" }),
  );
  await user.clear(screen.getByLabelText("Atalho 1 (ml)"));
  await user.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(screen.getByRole("button", { name: "350 ml" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Editar atalhos" })).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Editar atalhos" }));
  await user.click(
    screen.getByRole("button", { name: "Restaurar 200, 250 e 500 ml" }),
  );
  expect(
    await screen.findByRole("button", { name: "200 ml" }),
  ).toBeInTheDocument();
  expect((await loadData()).hydrationQuickAmounts).toEqual([200, 250, 500]);
  expect((await loadData()).hydrationEntries).toEqual([]);
});

it("mantém volumes anteriores e o rascunho quando a gravação falha", async () => {
  const user = userEvent.setup();
  render(app());
  await user.click(
    await screen.findByRole("button", { name: "Editar atalhos" }),
  );
  const input = screen.getByLabelText("Atalho 1 (ml)");
  await user.clear(input);
  await user.type(input, "350");
  vi.mocked(saveDataIfRevision).mockRejectedValueOnce(
    new Error("falha simulada"),
  );
  await user.click(screen.getByRole("button", { name: "Salvar atalhos" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Não foi possível salvar os atalhos",
  );
  expect(screen.getByRole("button", { name: "200 ml" })).toBeInTheDocument();
  expect(input).toHaveValue("350");
  expect((await loadData()).hydrationQuickAmounts).toBeNull();
});

it("rejeita campos vazios junto ao campo com foco e aguarda a primeira conciliação", async () => {
  flags.ready = false;
  const user = userEvent.setup();
  const view = render(app());
  await user.click(
    await screen.findByRole("button", { name: "Editar atalhos" }),
  );
  const form = screen.getByRole("form", { name: "Editar atalhos de água" });
  expect(
    within(form).getByRole("button", { name: "Salvar atalhos" }),
  ).toBeDisabled();
  expect(
    within(form).getByRole("button", { name: "Restaurar 200, 250 e 500 ml" }),
  ).toBeDisabled();
  flags.ready = true;
  view.rerender(app());
  await user.clear(screen.getByLabelText("Atalho 2 (ml)"));
  await user.click(screen.getByRole("button", { name: "Salvar atalhos" }));
  expect(screen.getByLabelText("Atalho 2 (ml)")).toHaveFocus();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Informe um volume inteiro",
  );
  expect(saveDataIfRevision).not.toHaveBeenCalled();
});

it("mantém o controle com gate desligado e preserva a preferência no armazenamento", async () => {
  flags.enabled = false;
  const data = emptyData();
  data.hydrationQuickAmounts = [350, 400, 600];
  await saveData(data);
  render(app());
  expect(
    await screen.findByRole("button", { name: "200 ml" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Editar atalhos" })).toBeNull();
  expect((await loadData()).hydrationQuickAmounts).toEqual([350, 400, 600]);
});
