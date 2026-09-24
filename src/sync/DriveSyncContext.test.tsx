import { render, screen, waitFor } from "@testing-library/react";
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

const account = {
  id: "account-1",
  email: "ana@example.com",
  token: "access-token",
  expiresAt: Date.now() + 3_600_000,
};
const snapshots: DriveSnapshot[] = [];

function RecordButton() {
  const { loading, mutate } = useAppData();
  return (
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
      expect((await loadData()).profile.displayName).toBe("Ana"),
    );
    expect(uploadDriveSnapshot).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("link", { name: "Google Drive: sincronizado" }),
    ).toBeInTheDocument();
  });

  it("conecta pelo topo, salva os dados atuais e envia uma nova entrada", async () => {
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
    await waitFor(() => expect(uploadDriveSnapshot).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByRole("link", { name: "Google Drive: sincronizado" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Registrar água" }));
    await waitFor(() => expect(uploadDriveSnapshot).toHaveBeenCalledTimes(2), {
      timeout: 3_000,
    });
    expect((await loadData()).hydrationEntries).toHaveLength(1);
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
    await saveData(local);
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
    expect((await loadData()).profile.displayName).toBe("Local");
    await user.click(screen.getByRole("link", { name: "Ver detalhes" }));
    expect(
      screen.getByRole("group", { name: "Escolher versão dos dados" }),
    ).toBeInTheDocument();
  });

  it("guarda alterações offline e sincroniza quando a internet volta", async () => {
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
});
