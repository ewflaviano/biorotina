import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyData, type AppData } from "../domain/data";
import { SettingsPage } from "./SettingsPage";

const mocks = vi.hoisted(() => ({
  useAppData: vi.fn(),
  downloadJson: vi.fn(),
  replaceIfRevision: vi.fn(),
}));

vi.mock("../state/AppDataContext", () => ({ useAppData: mocks.useAppData }));
vi.mock("../sync/download", () => ({ downloadJson: mocks.downloadJson }));
vi.mock("../storage/indexedDb", () => ({
  loadLegacyData: () => Promise.resolve(null),
}));
vi.mock("../sync/DriveBackup", () => ({ DriveBackup: () => null }));
vi.mock("../ai/GeminiSettings", () => ({ GeminiSettings: () => null }));
vi.mock("../components/PushControl", () => ({ PushControl: () => null }));
vi.mock("../analytics/AnalyticsChoice", () => ({
  AnalyticsChoice: () => null,
}));

function setup(data = emptyData(), scope: string | null = null) {
  mocks.useAppData.mockReturnValue({
    data,
    scope,
    mutate: vi.fn(),
    replaceIfRevision: mocks.replaceIfRevision,
  });
  return render(
    <MemoryRouter>
      <SettingsPage />
    </MemoryRouter>,
  );
}

function chooseBackup(data: AppData) {
  const file = new File([JSON.stringify(data)], "exemplo.json", {
    type: "application/json",
  });
  Object.defineProperty(file, "text", {
    value: () => Promise.resolve(JSON.stringify(data)),
  });
  fireEvent.change(document.querySelector("#backup-file")!, {
    target: { files: [file] },
  });
}

describe("comparação na importação manual", () => {
  beforeEach(() => {
    mocks.useAppData.mockReset();
    mocks.downloadJson.mockReset();
    mocks.replaceIfRevision.mockReset();
    mocks.replaceIfRevision.mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(false);
  });

  it("mostra oito categorias e não substitui dados ao cancelar", async () => {
    const local = emptyData();
    local.hydrationEntries.push({
      id: crypto.randomUUID(),
      createdAt: "2026-10-07T12:00:00.000Z",
      drankAt: "2026-10-07T12:00:00.000Z",
      amountMl: 250,
    });
    setup(local);
    chooseBackup(emptyData());

    expect(
      await screen.findByText("Compare antes de importar"),
    ).toBeInTheDocument();
    expect(screen.getByText("Registros de hábitos")).toBeInTheDocument();
    expect(
      screen.getByText(/1 registro exclusivo deste navegador/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Importar este arquivo" }),
    );
    expect(window.confirm).toHaveBeenCalledOnce();
    expect(mocks.replaceIfRevision).not.toHaveBeenCalled();
    expect(mocks.downloadJson).not.toHaveBeenCalled();
  });

  it("exige nova conferência após mudança local e usa a revisão confirmada", async () => {
    const local = emptyData();
    const view = setup(local);
    chooseBackup(emptyData());
    await screen.findByText("Compare antes de importar");

    const changed = {
      ...local,
      revision: 1,
      weights: [
        {
          id: crypto.randomUUID(),
          createdAt: "2026-10-07T12:00:00.000Z",
          measuredAt: "2026-10-07T12:00:00.000Z",
          weightKg: 70,
          note: "",
        },
      ],
    };
    mocks.useAppData.mockReturnValue({
      data: changed,
      scope: null,
      mutate: vi.fn(),
      replaceIfRevision: mocks.replaceIfRevision,
    });
    view.rerender(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("button", { name: "Importar este arquivo" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Conferi a comparação atualizada" }),
    );
    expect(
      screen.getByRole("button", { name: "Importar este arquivo" }),
    ).toBeInTheDocument();

    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Importar este arquivo" }),
    );
    await waitFor(() =>
      expect(mocks.replaceIfRevision).toHaveBeenCalledWith(
        1,
        expect.any(Object),
      ),
    );
    expect(mocks.downloadJson).toHaveBeenCalledOnce();
  });

  it("prepara uma cópia anterior quando só existe um perfil local", async () => {
    const local = emptyData();
    local.profile.displayName = "Exemplo";
    setup(local);
    chooseBackup(emptyData());
    await screen.findByText("Compare antes de importar");
    vi.mocked(window.confirm).mockReturnValue(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Importar este arquivo" }),
    );
    await waitFor(() => expect(mocks.replaceIfRevision).toHaveBeenCalledOnce());
    expect(mocks.downloadJson).toHaveBeenCalledWith(
      local,
      "-antes-da-importacao",
    );
  });

  it("descarta a prévia ao trocar de conta e rejeita arquivo inválido", async () => {
    const view = setup();
    const invalid = new File(["não é JSON"], "invalido.json", {
      type: "application/json",
    });
    Object.defineProperty(invalid, "text", {
      value: () => Promise.resolve("não é JSON"),
    });
    fireEvent.change(document.querySelector("#backup-file")!, {
      target: { files: [invalid] },
    });
    expect(await screen.findByText(/Arquivo incompatível/)).toBeInTheDocument();
    expect(
      screen.queryByText("Compare antes de importar"),
    ).not.toBeInTheDocument();

    chooseBackup(emptyData());
    await screen.findByText("Compare antes de importar");
    mocks.useAppData.mockReturnValue({
      data: emptyData(),
      scope: "outra-conta",
      mutate: vi.fn(),
      replaceIfRevision: mocks.replaceIfRevision,
    });
    view.rerender(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );
    expect(
      screen.queryByText("Compare antes de importar"),
    ).not.toBeInTheDocument();
  });
});
