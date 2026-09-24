import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openDB } from "idb";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Layout } from "../components/Layout";
import { emptyData, type AppData } from "../domain/data";
import { AppDataProvider, useAppData } from "../state/AppDataContext";
import { loadData, saveData } from "../storage/indexedDb";
import { DriveBackup } from "./DriveBackup";
import { DriveSyncProvider } from "./DriveSyncContext";
import { downloadJson } from "./download";
import {
  connectGoogle,
  downloadDriveSnapshot,
  forgetGoogleAccount,
  listDriveSnapshots,
  renewGoogle,
  uploadDriveSnapshot,
  type DriveSnapshot,
} from "./google";

vi.mock("./google", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./google")>();
  return {
    ...actual,
    connectGoogle: vi.fn(),
    downloadDriveSnapshot: vi.fn(),
    listDriveSnapshots: vi.fn(),
    preloadGoogleIdentity: vi.fn().mockResolvedValue(undefined),
    renewGoogle: vi.fn(),
    uploadDriveSnapshot: vi.fn(),
  };
});
vi.mock("./download", () => ({ downloadJson: vi.fn() }));

const account = {
  id: "account-1",
  email: "ana@example.com",
  token: "access-token",
  expiresAt: Date.now() + 3_600_000,
};
const snapshots: DriveSnapshot[] = [];

function RecordButton() {
  const { data, loading, mutate } = useAppData();
  return (
    <>
      <button
        type="button"
        disabled={loading}
        onClick={() =>
          void mutate((current) => ({
            ...current,
            hydrationEntries: [
              ...current.hydrationEntries,
              {
                id: crypto.randomUUID(),
                amountMl: 250,
                drankAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
              },
            ],
          }))
        }
      >
        Registrar água
      </button>
      <span>{data.hydrationEntries.length} registros de água</span>
    </>
  );
}

function App() {
  return (
    <AppDataProvider>
      <DriveSyncProvider googleClientId="test-client-id">
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<RecordButton />} />
              <Route path="/configuracoes" element={<DriveBackup />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </DriveSyncProvider>
    </AppDataProvider>
  );
}

beforeEach(async () => {
  const db = await openDB("biorotina", 3);
  await db.clear("app");
  await db.clear("driveSync");
  db.close();
  snapshots.length = 0;
  forgetGoogleAccount();
  vi.mocked(connectGoogle).mockResolvedValue({
    ...account,
    expiresAt: Date.now() + 3_600_000,
  });
  vi.mocked(renewGoogle).mockResolvedValue(null);
  vi.mocked(listDriveSnapshots).mockImplementation(async () => [...snapshots]);
  vi.mocked(uploadDriveSnapshot).mockImplementation(async (_token, data) => {
    const saved = {
      id: `snapshot-${snapshots.length + 1}`,
      createdTime: new Date(Date.now() + snapshots.length).toISOString(),
    };
    snapshots.unshift(saved);
    expect(data.schemaVersion).toBe(4);
    return saved;
  });
  vi.mocked(downloadDriveSnapshot).mockReset();
});

describe("login e sincronização automática", () => {
  it("não exibe registros de uma sessão expirada antes da renovação", async () => {
    const old = emptyData();
    old.hydrationEntries.push({
      id: "old-record",
      amountMl: 250,
      drankAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    await saveData(old, account.id);
    localStorage.setItem(
      "biorotina:google-account",
      JSON.stringify({ ...account, expiresAt: Date.now() - 1 }),
    );
    vi.mocked(renewGoogle).mockImplementation(
      () => new Promise(() => undefined),
    );
    render(<App />);
    await waitFor(() => expect(renewGoogle).toHaveBeenCalled());
    expect(screen.getByText("0 registros de água")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Entrar com Google para sincronizar",
      }),
    ).toBeInTheDocument();
  });

  it("renova em segundo plano uma conta lembrada depois que o token expira", async () => {
    localStorage.setItem(
      "biorotina:google-account",
      JSON.stringify({ ...account, expiresAt: Date.now() - 1 }),
    );
    vi.mocked(renewGoogle).mockResolvedValue({
      ...account,
      expiresAt: Date.now() + 3_600_000,
    });
    render(<App />);
    await waitFor(
      () => expect(renewGoogle).toHaveBeenCalledWith("test-client-id"),
      { timeout: 3_000 },
    );
    expect(
      await screen.findByRole(
        "link",
        { name: "Google Drive: sincronizado" },
        { timeout: 3_000 },
      ),
    ).toBeInTheDocument();
  });

  it("restaura o Drive no primeiro acesso de um navegador vazio", async () => {
    const remote: AppData = {
      ...emptyData(),
      profile: { displayName: "Ana", heightCm: 168 },
    };
    snapshots.push({ id: "remote-1", createdTime: new Date().toISOString() });
    vi.mocked(downloadDriveSnapshot).mockResolvedValue(remote);
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      await screen.findByRole("button", {
        name: "Entrar com Google para sincronizar",
      }),
    );
    await waitFor(async () =>
      expect((await loadData(account.id)).profile.displayName).toBe("Ana"),
    );
    expect(uploadDriveSnapshot).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("link", { name: "Google Drive: sincronizado" }),
    ).toBeInTheDocument();
  });

  it("só copia os dados sem conta após confirmação explícita", async () => {
    const initial = emptyData();
    initial.profile.displayName = "Ana";
    await saveData(initial);
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      await screen.findByRole("button", {
        name: "Entrar com Google para sincronizar",
      }),
    );
    await waitFor(async () =>
      expect((await loadData(account.id)).profile.displayName).toBe(""),
    );
    expect(uploadDriveSnapshot).not.toHaveBeenCalled();
    expect((await loadData()).profile.displayName).toBe("Ana");
    await user.click(
      await screen.findByRole("link", { name: "Google Drive: sincronizado" }),
    );
    const confirmation = vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(
      await screen.findByRole("button", {
        name: "Copiar registros para esta conta",
      }),
    );
    await waitFor(() => expect(uploadDriveSnapshot).toHaveBeenCalledTimes(1));
    expect(confirmation).toHaveBeenCalled();
    confirmation.mockRestore();
    expect((await loadData(account.id)).profile.displayName).toBe("Ana");
    expect((await loadData()).profile.displayName).toBe("Ana");
    await user.click(
      within(
        screen.getByRole("navigation", {
          name: "Navegação principal no celular",
        }),
      ).getByRole("link", { name: "Hoje" }),
    );
    expect(
      await screen.findByRole("link", { name: "Google Drive: sincronizado" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Registrar água" }));
    await waitFor(() => expect(uploadDriveSnapshot).toHaveBeenCalledTimes(2), {
      timeout: 3_000,
    });
    expect((await loadData(account.id)).hydrationEntries).toHaveLength(1);
    expect(
      vi.mocked(uploadDriveSnapshot).mock.calls[1][1].hydrationEntries,
    ).toHaveLength(1);
  });

  it("mantém as duas versões quando a primeira conexão encontra conflito", async () => {
    const local = emptyData();
    local.profile.displayName = "Local";
    const remote: AppData = {
      ...emptyData(),
      profile: { displayName: "Drive", heightCm: null },
    };
    await saveData(local, account.id);
    snapshots.push({ id: "remote-1", createdTime: new Date().toISOString() });
    vi.mocked(downloadDriveSnapshot).mockResolvedValue(remote);
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      await screen.findByRole("button", {
        name: "Entrar com Google para sincronizar",
      }),
    );
    expect(
      await screen.findByText("Há versões diferentes dos seus dados no Drive."),
    ).toBeInTheDocument();
    expect(uploadDriveSnapshot).not.toHaveBeenCalled();
    expect((await loadData(account.id)).profile.displayName).toBe("Local");
    await user.click(screen.getByRole("link", { name: "Ver detalhes" }));
    expect(
      screen.getByRole("group", { name: "Escolher versão dos dados" }),
    ).toBeInTheDocument();
  });

  it("guarda alterações offline e sincroniza quando a internet volta", async () => {
    const initial = emptyData();
    initial.profile.displayName = "Ana";
    await saveData(initial, account.id);
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole("button", {
        name: "Entrar com Google para sincronizar",
      }),
    );
    await waitFor(() => expect(uploadDriveSnapshot).toHaveBeenCalledTimes(1));

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    try {
      await user.click(screen.getByRole("button", { name: "Registrar água" }));
      await waitFor(
        () =>
          expect(
            screen.getByRole("link", {
              name: "Google Drive: alterações pendentes",
            }),
          ).toBeInTheDocument(),
        { timeout: 3_000 },
      );
      expect(uploadDriveSnapshot).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(navigator, "onLine", {
        configurable: true,
        value: true,
      });
    }
    window.dispatchEvent(new Event("online"));
    await waitFor(() => expect(uploadDriveSnapshot).toHaveBeenCalledTimes(2));
  });

  it("não mostra nem envia registros de uma conta ao entrar em outra", async () => {
    const second = {
      id: "account-2",
      email: "bia@example.com",
      token: "access-token-2",
      expiresAt: Date.now() + 3_600_000,
    };
    vi.mocked(connectGoogle)
      .mockResolvedValueOnce(account)
      .mockResolvedValueOnce(second)
      .mockResolvedValueOnce(account);
    vi.mocked(listDriveSnapshots).mockImplementation(async (token) =>
      token === second.token ? [] : [...snapshots],
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole("button", {
        name: "Entrar com Google para sincronizar",
      }),
    );
    await screen.findByRole("link", { name: "Google Drive: sincronizado" });
    await user.click(screen.getByRole("button", { name: "Registrar água" }));
    await waitFor(() => expect(uploadDriveSnapshot).toHaveBeenCalledTimes(1), {
      timeout: 3_000,
    });
    vi.mocked(downloadDriveSnapshot).mockResolvedValue(
      await loadData(account.id),
    );

    await user.click(
      screen.getByRole("link", { name: "Google Drive: sincronizado" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Sair e apagar dados" }),
    );
    await screen.findByRole("button", { name: "Conectar Google Drive" });
    expect((await loadData(account.id)).hydrationEntries).toHaveLength(0);
    await user.click(
      screen.getByRole("button", { name: "Conectar Google Drive" }),
    );
    await screen.findByText(second.email);
    expect((await loadData(second.id)).hydrationEntries).toHaveLength(0);
    expect(uploadDriveSnapshot).toHaveBeenCalledTimes(1);
    await user.click(
      within(
        screen.getByRole("navigation", {
          name: "Navegação principal no celular",
        }),
      ).getByRole("link", { name: "Hoje" }),
    );
    expect(screen.getByText("0 registros de água")).toBeInTheDocument();
    await user.click(
      screen.getByRole("link", { name: "Google Drive: sincronizado" }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Sair e apagar dados" }),
      ).toBeEnabled(),
    );
    await user.click(
      screen.getByRole("button", { name: "Sair e apagar dados" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Conectar Google Drive" }),
    );
    await screen.findByText(account.email);
    await waitFor(async () =>
      expect((await loadData(account.id)).hydrationEntries).toHaveLength(1),
    );
    expect(uploadDriveSnapshot).toHaveBeenCalledTimes(1);
  });

  it("oferece esperar, baixar JSON ou apagar registros sem sincronização", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole("button", {
        name: "Entrar com Google para sincronizar",
      }),
    );
    await screen.findByRole("link", { name: "Google Drive: sincronizado" });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    try {
      await user.click(screen.getByRole("button", { name: "Registrar água" }));
      await waitFor(async () =>
        expect((await loadData(account.id)).hydrationEntries).toHaveLength(1),
      );
      await user.click(
        await screen.findByRole("link", {
          name: "Google Drive: alterações pendentes",
        }),
      );
      await user.click(
        screen.getByRole("button", { name: "Sair e apagar dados" }),
      );
      expect(
        await screen.findByRole("group", { name: "Escolha como sair" }),
      ).toBeInTheDocument();
      await user.click(
        screen.getByRole("button", {
          name: "Esperar conexão e continuar aqui",
        }),
      );
      expect(
        screen.queryByRole("group", { name: "Escolha como sair" }),
      ).not.toBeInTheDocument();
      expect((await loadData(account.id)).hydrationEntries).toHaveLength(1);

      await user.click(
        screen.getByRole("button", { name: "Sair e apagar dados" }),
      );
      const confirmed = await screen.findByRole("button", {
        name: "Conferi os downloads: apagar e sair",
      });
      expect(confirmed).toBeDisabled();
      await user.click(
        screen.getByRole("button", { name: "Baixar JSON: Dados desta conta" }),
      );
      expect(downloadJson).toHaveBeenCalledOnce();
      expect(confirmed).toBeEnabled();
      await user.click(confirmed);
      await screen.findByRole("button", { name: "Conectar Google Drive" });
      expect((await loadData(account.id)).hydrationEntries).toHaveLength(0);
    } finally {
      Object.defineProperty(navigator, "onLine", {
        configurable: true,
        value: true,
      });
    }
  });

  it("permite sair sem backup após avisar sobre alterações pendentes", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole("button", {
        name: "Entrar com Google para sincronizar",
      }),
    );
    await screen.findByRole("link", { name: "Google Drive: sincronizado" });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });
    try {
      await user.click(screen.getByRole("button", { name: "Registrar água" }));
      await screen.findByRole("link", {
        name: "Google Drive: alterações pendentes",
      });
      await user.click(
        screen.getByRole("link", {
          name: "Google Drive: alterações pendentes",
        }),
      );
      await user.click(
        screen.getByRole("button", { name: "Sair e apagar dados" }),
      );
      await screen.findByRole("group", { name: "Escolha como sair" });
      await user.click(
        screen.getByRole("button", { name: "Apagar sem backup e sair" }),
      );
      await screen.findByRole("button", { name: "Conectar Google Drive" });
      expect((await loadData(account.id)).hydrationEntries).toHaveLength(0);
      expect(downloadJson).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(navigator, "onLine", {
        configurable: true,
        value: true,
      });
    }
  });
});
