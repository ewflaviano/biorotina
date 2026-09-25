import {
  cleanup,
  configure,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { openDB } from "idb";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setAnalyticsPreference } from "../analytics/visits";
import { Layout } from "../components/Layout";
import { emptyData, todayIsoDate, type AppData } from "../domain/data";
import { AppDataProvider, useAppData } from "../state/AppDataContext";
import { loadData, saveData } from "../storage/indexedDb";
import { DriveBackup } from "./DriveBackup";
import { DriveSyncProvider } from "./DriveSyncContext";
import { downloadJson } from "./download";
import {
  authorizeGoogleDrive,
  connectGoogle,
  downloadDriveSnapshot,
  forgetGoogleAccount,
  listDriveSnapshots,
  reconnectGoogle,
  renewGoogle,
  uploadDriveSnapshot,
  GoogleReconnectRequiredError,
  type DriveSnapshot,
} from "./google";

vi.mock("./google", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./google")>();
  return {
    ...actual,
    authorizeGoogleDrive: vi.fn(),
    connectGoogle: vi.fn(),
    downloadDriveSnapshot: vi.fn(),
    listDriveSnapshots: vi.fn(),
    preloadGoogleIdentity: vi.fn().mockResolvedValue(undefined),
    reconnectGoogle: vi.fn(),
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

// IndexedDB and React effects can take longer on shared CI runners.
configure({ asyncUtilTimeout: 5_000 });
vi.setConfig({ testTimeout: 15_000 });

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

afterEach(() => {
  cleanup();
});

beforeEach(async () => {
  vi.clearAllMocks();
  const db = await openDB("biorotina", 3);
  await db.clear("app");
  await db.clear("driveSync");
  db.close();
  snapshots.length = 0;
  localStorage.clear();
  // This suite tests Drive, not the first-visit analytics consent dialog.
  await setAnalyticsPreference("declined");
  forgetGoogleAccount();
  vi.mocked(connectGoogle).mockResolvedValue({
    ...account,
    expiresAt: Date.now() + 3_600_000,
  });
  vi.mocked(authorizeGoogleDrive).mockResolvedValue({
    ...account,
    driveAuthorized: true,
    expiresAt: Date.now() + 3_600_000,
  });
  vi.mocked(renewGoogle).mockResolvedValue(null);
  vi.mocked(reconnectGoogle).mockResolvedValue({
    ...account,
    expiresAt: Date.now() + 3_600_000,
  });
  vi.mocked(listDriveSnapshots).mockImplementation(async () => [...snapshots]);
  vi.mocked(uploadDriveSnapshot).mockImplementation(async (_token, data) => {
    const saved = {
      id: `snapshot-${snapshots.length + 1}`,
      createdTime: new Date(Date.now() + snapshots.length).toISOString(),
    };
    snapshots.unshift(saved);
    expect(data.schemaVersion).toBe(6);
    return saved;
  });
  vi.mocked(downloadDriveSnapshot).mockReset();
});

describe("login e sincronização automática", () => {
  it("entra sem Drive, oferece autorização adicional e só sincroniza após permitir", async () => {
    vi.mocked(connectGoogle).mockResolvedValue({
      ...account,
      driveAuthorized: false,
    });
    const user = userEvent.setup();
    render(<App />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Registrar água" }),
      ).toBeEnabled(),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Entrar com Google para sincronizar",
      }),
    );
    await waitFor(() => expect(connectGoogle).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByRole("dialog", {
        name: "Guardar sua rotina no Drive?",
      }),
    ).toBeInTheDocument();
    expect(listDriveSnapshots).not.toHaveBeenCalled();
    expect(uploadDriveSnapshot).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Google Drive: ativação opcional" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Ativar sincronização" }),
    );
    await waitFor(() =>
      expect(authorizeGoogleDrive).toHaveBeenCalledWith(
        "test-client-id",
        expect.objectContaining({ id: account.id, driveAuthorized: false }),
      ),
    );
    await waitFor(() => expect(listDriveSnapshots).toHaveBeenCalled());
    expect(
      await screen.findByRole("link", { name: "Google Drive: sincronizado" }),
    ).toBeInTheDocument();
  });

  it("permite adiar a autorização do Drive sem perder a conta", async () => {
    vi.mocked(connectGoogle).mockResolvedValue({
      ...account,
      driveAuthorized: false,
    });
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole("button", {
        name: "Entrar com Google para sincronizar",
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Agora não" }));
    expect(
      screen.queryByRole("dialog", { name: "Guardar sua rotina no Drive?" }),
    ).not.toBeInTheDocument();
    expect(listDriveSnapshots).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Registrar água" }));
    await screen.findByText("1 registros de água");
    expect(listDriveSnapshots).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("link", { name: "Google Drive: ativação opcional" }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Ativar sincronização no Drive",
      }),
    );
    await waitFor(() => expect(listDriveSnapshots).toHaveBeenCalled());
  });

  it("mantém o login e os dados locais quando o Drive é recusado", async () => {
    vi.mocked(connectGoogle).mockResolvedValue({
      ...account,
      driveAuthorized: false,
    });
    vi.mocked(authorizeGoogleDrive).mockRejectedValue(
      new Error("Autorize o acesso à área privada de backups do Drive."),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      await screen.findByRole("button", {
        name: "Entrar com Google para sincronizar",
      }),
    );
    await user.click(
      await screen.findByRole("button", {
        name: "Ativar sincronização",
      }),
    );
    expect(
      await screen.findByRole("link", {
        name: "Google Drive: ativação opcional",
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Agora não" }));
    await user.click(screen.getByRole("button", { name: "Registrar água" }));
    await screen.findByText("1 registros de água");
    expect((await loadData(account.id)).hydrationEntries).toHaveLength(1);
  });
  it("convida após o primeiro registro local, adia até outro dia e respeita nunca mais", async () => {
    const user = userEvent.setup();
    render(<App />);
    const record = await screen.findByRole("button", {
      name: "Registrar água",
    });
    await waitFor(() => expect(record).toBeEnabled());
    await user.click(record);
    expect(
      await screen.findByRole("dialog", { name: "Leve sua rotina com você" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Agora não" }));
    expect(localStorage.getItem("biorotina:guest-login-prompt")).toBe(
      todayIsoDate(),
    );
    await user.click(record);
    expect(
      screen.queryByRole("dialog", { name: "Leve sua rotina com você" }),
    ).not.toBeInTheDocument();

    localStorage.setItem("biorotina:guest-login-prompt", "2000-01-01");
    await user.click(record);
    expect(
      await screen.findByRole("dialog", { name: "Leve sua rotina com você" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Não mostrar novamente" }),
    );
    expect(localStorage.getItem("biorotina:guest-login-prompt")).toBe("never");
    await user.click(record);
    expect(
      screen.queryByRole("dialog", { name: "Leve sua rotina com você" }),
    ).not.toBeInTheDocument();
  });

  it("não mostra convite para registros já existentes ao abrir o app", async () => {
    const guest = emptyData();
    guest.hydrationEntries.push({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      drankAt: new Date().toISOString(),
      amountMl: 200,
    });
    await saveData(guest);
    render(<App />);
    expect(await screen.findByText("1 registros de água")).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Leve sua rotina com você" }),
    ).not.toBeInTheDocument();
  });

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
        name: "Reconectar Google para sincronizar",
      }),
    ).toBeInTheDocument();
  });

  it("mantém os registros locais quando o Drive pede reconexão", async () => {
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
    vi.mocked(listDriveSnapshots).mockRejectedValueOnce(
      new GoogleReconnectRequiredError(
        "A conexão com o Google expirou. Conecte novamente.",
      ),
    );
    window.dispatchEvent(new Event("focus"));

    const reconnect = await screen.findByRole("button", {
      name: "Reconectar Google para sincronizar",
    });
    expect(screen.getByText("1 registros de água")).toBeInTheDocument();
    expect((await loadData(account.id)).hydrationEntries).toHaveLength(1);
    expect(localStorage.getItem("biorotina:google-account")).toContain(
      account.id,
    );

    await user.click(reconnect);
    await screen.findByRole("link", { name: "Google Drive: sincronizado" });
    expect(reconnectGoogle).toHaveBeenCalledWith(
      "test-client-id",
      expect.objectContaining({ id: account.id }),
    );
    expect((await loadData(account.id)).hydrationEntries).toHaveLength(1);
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

  it("reconecta após falha da renovação silenciosa sem pedir Drive novamente", async () => {
    const saved = emptyData();
    saved.hydrationEntries.push({
      id: crypto.randomUUID(),
      amountMl: 250,
      drankAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    await saveData(saved, account.id);
    localStorage.setItem(
      "biorotina:google-account",
      JSON.stringify({ ...account, expiresAt: Date.now() - 1 }),
    );
    vi.mocked(renewGoogle).mockRejectedValue(new Error("Popup indisponível"));
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => expect(renewGoogle).toHaveBeenCalled());
    expect(screen.getByText("0 registros de água")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Reconectar Google para sincronizar",
      }),
    );

    expect(await screen.findByText("1 registros de água")).toBeInTheDocument();
    expect(reconnectGoogle).toHaveBeenCalledWith("test-client-id", undefined);
    expect(
      screen.queryByRole("dialog", { name: "Guardar sua rotina no Drive?" }),
    ).not.toBeInTheDocument();
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

  it("recebe um registro novo de outro aparelho sem pedir para juntar", async () => {
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
    await screen.findByRole("link", { name: "Google Drive: sincronizado" });

    const phoneData = await loadData(account.id);
    phoneData.hydrationEntries.push({
      id: crypto.randomUUID(),
      amountMl: 300,
      drankAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    snapshots.unshift({
      id: "phone-backup",
      createdTime: new Date().toISOString(),
    });
    vi.mocked(downloadDriveSnapshot).mockResolvedValue(phoneData);
    window.dispatchEvent(new Event("focus"));

    await waitFor(async () =>
      expect((await loadData(account.id)).hydrationEntries).toHaveLength(2),
    );
    expect(
      screen.queryByRole("dialog", { name: "Como guardar seus registros?" }),
    ).not.toBeInTheDocument();
    expect(uploadDriveSnapshot).toHaveBeenCalledTimes(1);
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
    await screen.findByRole("link", { name: "Google Drive: sincronizado" });
    await waitFor(async () =>
      expect((await loadData(account.id)).profile.displayName).toBe(""),
    );
    expect(uploadDriveSnapshot).not.toHaveBeenCalled();
    expect((await loadData()).profile.displayName).toBe("Ana");
    expect(
      await screen.findByRole("dialog", { name: "Juntar seus registros?" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Decidir depois" }));
    await user.click(
      await screen.findByRole("link", { name: "Google Drive: sincronizado" }),
    );
    const confirmation = vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(
      await screen.findByRole("button", {
        name: "Juntar registros sem conta",
      }),
    );
    await waitFor(() => expect(uploadDriveSnapshot).toHaveBeenCalledTimes(1));
    expect(confirmation).toHaveBeenCalled();
    confirmation.mockRestore();
    expect((await loadData(account.id)).profile.displayName).toBe("Ana");
    expect((await loadData()).profile.displayName).toBe("Ana");
    await user.click(
      within(screen.getByRole("banner")).getByRole("link", {
        name: "Biorotina: início",
      }),
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

  it("oferece juntar local e Drive e mantém a versão local de IDs divergentes", async () => {
    const local = emptyData();
    const id = crypto.randomUUID();
    local.hydrationEntries.push({
      id,
      createdAt: new Date().toISOString(),
      drankAt: new Date().toISOString(),
      amountMl: 200,
    });
    const remote = emptyData();
    remote.hydrationEntries.push(
      { ...local.hydrationEntries[0], amountMl: 500 },
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        drankAt: new Date().toISOString(),
        amountMl: 300,
      },
    );
    await saveData(local, account.id);
    snapshots.push({ id: "remote-1", createdTime: new Date().toISOString() });
    vi.mocked(downloadDriveSnapshot).mockResolvedValue(remote);
    const confirmation = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      await screen.findByRole("button", {
        name: "Entrar com Google para sincronizar",
      }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Juntar registros" }),
    );
    await waitFor(() => expect(uploadDriveSnapshot).toHaveBeenCalledTimes(1));
    expect(confirmation).toHaveBeenCalledWith(
      expect.stringContaining("1 registros com o mesmo identificador"),
    );
    confirmation.mockRestore();
    const combined = await loadData(account.id);
    expect(combined.hydrationEntries).toHaveLength(2);
    expect(
      combined.hydrationEntries.find((entry) => entry.id === id)?.amountMl,
    ).toBe(200);
    expect(snapshots.map(({ id: snapshotId }) => snapshotId)).toContain(
      "remote-1",
    );
  });

  it("permite juntar registros sem conta a uma conta que já tem dados no Drive", async () => {
    const guest = emptyData();
    guest.hydrationEntries.push({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      drankAt: new Date().toISOString(),
      amountMl: 200,
    });
    await saveData(guest);
    const remote = emptyData();
    remote.hydrationEntries.push({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      drankAt: new Date().toISOString(),
      amountMl: 300,
    });
    snapshots.push({ id: "remote-1", createdTime: new Date().toISOString() });
    vi.mocked(downloadDriveSnapshot).mockResolvedValue(remote);
    const confirmation = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      await screen.findByRole("button", {
        name: "Entrar com Google para sincronizar",
      }),
    );
    await user.click(
      await screen.findByRole("link", { name: "Google Drive: sincronizado" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Juntar registros sem conta" }),
    );
    await waitFor(() => expect(uploadDriveSnapshot).toHaveBeenCalledTimes(1));
    confirmation.mockRestore();
    expect((await loadData(account.id)).hydrationEntries).toHaveLength(2);
    expect((await loadData()).hydrationEntries).toHaveLength(1);
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
      screen.getByRole("button", { name: "Sair e apagar dados desta conta" }),
    );
    await screen.findByRole("button", { name: "Entrar com Google" });
    expect((await loadData(account.id)).hydrationEntries).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Entrar com Google" }));
    await screen.findByText(second.email);
    expect((await loadData(second.id)).hydrationEntries).toHaveLength(0);
    expect(uploadDriveSnapshot).toHaveBeenCalledTimes(1);
    await user.click(
      within(screen.getByRole("banner")).getByRole("link", {
        name: "Biorotina: início",
      }),
    );
    expect(screen.getByText("0 registros de água")).toBeInTheDocument();
    await user.click(
      screen.getByRole("link", { name: "Google Drive: sincronizado" }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Sair e apagar dados desta conta" }),
      ).toBeEnabled(),
    );
    await user.click(
      screen.getByRole("button", { name: "Sair e apagar dados desta conta" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Entrar com Google" }),
    );
    await screen.findByText(account.email);
    await waitFor(async () =>
      expect((await loadData(account.id)).hydrationEntries).toHaveLength(1),
    );
    expect(uploadDriveSnapshot).toHaveBeenCalledTimes(1);
  });

  it("oferece esperar, baixar JSON ou apagar registros sem sincronização", async () => {
    const anotherAccount = emptyData();
    anotherAccount.profile.displayName = "Outra conta";
    await saveData(anotherAccount, "account-2");
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
        screen.getByRole("button", { name: "Sair e apagar dados desta conta" }),
      );
      expect(
        await screen.findByRole("group", { name: "Escolha como sair" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/Dados de outra conta/),
      ).not.toBeInTheDocument();
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
        screen.getByRole("button", { name: "Sair e apagar dados desta conta" }),
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
      await screen.findByRole("button", { name: "Entrar com Google" });
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
        screen.getByRole("button", { name: "Sair e apagar dados desta conta" }),
      );
      await screen.findByRole("group", { name: "Escolha como sair" });
      await user.click(
        screen.getByRole("button", { name: "Apagar sem backup e sair" }),
      );
      await screen.findByRole("button", { name: "Entrar com Google" });
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
