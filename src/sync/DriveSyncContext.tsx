import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { totalRecords, type AppData } from "../domain/data";
import { useAppData } from "../state/AppDataContext";
import { loadData, loadDriveSync, saveDriveSync } from "../storage/indexedDb";
import { decideSync } from "./decision";
import { downloadJson } from "./download";
import {
  connectGoogle,
  contentHash,
  currentGoogleAccount,
  disconnectGoogle,
  downloadDriveSnapshot,
  listDriveSnapshots,
  preloadGoogleIdentity,
  rememberGoogleAccount,
  uploadDriveSnapshot,
  type DriveSnapshot,
  type GoogleAccount,
} from "./google";

function hasLocalContent(data: AppData): boolean {
  return (
    totalRecords(data) > 0 ||
    Boolean(data.profile.displayName || data.profile.heightCm) ||
    data.hydrationReminderTimes.length > 0
  );
}

interface Conflict {
  remote: DriveSnapshot;
  remoteData: AppData;
  localHash: string;
}

export type DriveSyncStatus =
  "disconnected" | "syncing" | "synced" | "pending" | "conflict" | "error";

interface DriveSyncValue {
  available: boolean;
  account: GoogleAccount | null;
  latest: DriveSnapshot | null;
  conflict: Conflict | null;
  status: DriveSyncStatus;
  busy: boolean;
  message: string;
  error: string;
  connect: () => Promise<void>;
  disconnect: () => void;
  sync: () => Promise<void>;
  resolveWithLocal: () => Promise<void>;
  resolveWithDrive: () => Promise<void>;
}

const Context = createContext<DriveSyncValue | null>(null);

export function DriveSyncProvider({
  children,
  googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim(),
}: {
  children: ReactNode;
  googleClientId?: string;
}) {
  const { data, replaceIfRevision } = useAppData();
  const [account, setAccount] = useState<GoogleAccount | null>(
    currentGoogleAccount,
  );
  const accountRef = useRef(account);
  const [latest, setLatest] = useState<DriveSnapshot | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [status, setStatus] = useState<DriveSyncStatus>(
    account ? "pending" : "disconnected",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [settledRevision, setSettledRevision] = useState<number | null>(null);
  const running = useRef(false);
  const rerun = useRef(false);
  const previousRevision = useRef(data.revision);

  useEffect(() => {
    if (googleClientId) void preloadGoogleIdentity().catch(() => undefined);
  }, [googleClientId]);

  const syncAccount = useCallback(
    async (connected: GoogleAccount): Promise<void> => {
      if (running.current) {
        rerun.current = true;
        return;
      }
      running.current = true;
      setBusy(true);
      setStatus("syncing");
      setError("");
      setConflict(null);
      try {
        do {
          rerun.current = false;
          if (navigator.onLine === false) {
            setStatus("pending");
            setMessage(
              "Sem internet. Suas alterações estão salvas neste navegador e serão sincronizadas quando a conexão voltar.",
            );
            return;
          }
          if (!currentGoogleAccount()) {
            accountRef.current = null;
            setAccount(null);
            throw new Error(
              "A conexão com o Google expirou. Conecte novamente para sincronizar.",
            );
          }
          const snapshots = await listDriveSnapshots(connected.token);
          const remote = snapshots[0] ?? null;
          setLatest(remote);
          const local = await loadData();
          const localHash = await contentHash(local);
          const previous = await loadDriveSync(connected.id);
          const remoteData =
            remote && previous?.snapshotId !== remote.id
              ? await downloadDriveSnapshot(connected.token, remote)
              : null;
          const remoteHash = remoteData ? await contentHash(remoteData) : null;
          const decision = decideSync({
            remoteId: remote?.id ?? null,
            remoteHash,
            localHash,
            localHasContent: hasLocalContent(local),
            previous,
          });

          if (decision === "nothing") {
            setStatus("synced");
            setMessage(
              "Conta conectada. Seus novos registros serão sincronizados automaticamente.",
            );
          } else if (decision === "upload") {
            const saved = await uploadDriveSnapshot(connected.token, local);
            await saveDriveSync(connected.id, {
              snapshotId: saved.id,
              contentHash: localHash,
            });
            setLatest(saved);
            setStatus("synced");
            setMessage("Dados sincronizados com seu Google Drive.");
          } else if (decision === "synced") {
            setStatus("synced");
            setMessage("Seus dados estão sincronizados.");
          } else {
            if (!remote || !remoteData || !remoteHash)
              throw new Error("Backup do Drive incompleto.");
            if (decision === "mark-synced") {
              await saveDriveSync(connected.id, {
                snapshotId: remote.id,
                contentHash: localHash,
              });
              setStatus("synced");
              setMessage("Seus dados estão sincronizados.");
            } else if (decision === "restore") {
              await replaceIfRevision(local.revision, remoteData);
              await saveDriveSync(connected.id, {
                snapshotId: remote.id,
                contentHash: remoteHash,
              });
              setStatus("synced");
              setMessage("Dados atualizados a partir do seu Google Drive.");
            } else {
              setConflict({ remote, remoteData, localHash });
              setStatus("conflict");
              setMessage(
                "Há versões diferentes neste navegador e no Drive. Escolha qual manter em Configurações.",
              );
              return;
            }
          }
          setSettledRevision(
            decision === "restore" ? local.revision + 1 : local.revision,
          );
          if (
            (await contentHash(await loadData())) !== localHash &&
            decision !== "restore"
          )
            rerun.current = true;
        } while (rerun.current && accountRef.current?.id === connected.id);
      } catch (cause) {
        const description =
          cause instanceof Error
            ? cause.message
            : "Não foi possível sincronizar com o Google Drive.";
        if (description.includes("Conecte novamente")) {
          accountRef.current = null;
          setAccount(null);
        }
        setError(description);
        setStatus("error");
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [replaceIfRevision],
  );

  const sync = useCallback(async () => {
    if (accountRef.current) await syncAccount(accountRef.current);
  }, [syncAccount]);

  const connect = useCallback(async () => {
    if (!googleClientId || running.current) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const connected = await connectGoogle(googleClientId);
      rememberGoogleAccount(connected);
      accountRef.current = connected;
      setAccount(connected);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível conectar ao Google.",
      );
      setStatus("error");
      setBusy(false);
      return;
    }
    setBusy(false);
    if (accountRef.current) await syncAccount(accountRef.current);
  }, [googleClientId, syncAccount]);

  const disconnect = useCallback(() => {
    if (!accountRef.current || running.current) return;
    disconnectGoogle(accountRef.current);
    accountRef.current = null;
    setAccount(null);
    setLatest(null);
    setConflict(null);
    setError("");
    setMessage("");
    setStatus("disconnected");
  }, []);

  useEffect(() => {
    if (previousRevision.current === data.revision) return;
    previousRevision.current = data.revision;
    if (!account) return;
    const timer = window.setTimeout(() => void sync(), 1_200);
    return () => window.clearTimeout(timer);
  }, [account, data.revision, sync]);

  useEffect(() => {
    if (!account) return;
    const resume = () => void sync();
    const visible = () => {
      if (document.visibilityState === "visible") resume();
    };
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [account, sync]);

  useEffect(() => {
    if (account) void sync();
    // A session restored in memory needs one initial comparison.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolveWithLocal = useCallback(async () => {
    const connected = accountRef.current;
    if (!connected || !conflict || running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const current = await loadData();
      const currentHash = await contentHash(current);
      const remote = (await listDriveSnapshots(connected.token))[0];
      if (
        currentHash !== conflict.localHash ||
        remote?.id !== conflict.remote.id
      )
        throw new Error(
          "Os dados mudaram. Sincronize novamente para comparar as versões.",
        );
      const saved = await uploadDriveSnapshot(connected.token, current);
      await saveDriveSync(connected.id, {
        snapshotId: saved.id,
        contentHash: currentHash,
      });
      setLatest(saved);
      setConflict(null);
      setStatus("synced");
      setSettledRevision(current.revision);
      setMessage(
        "Esta versão foi salva no Drive. O backup anterior continua disponível.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar esta versão.",
      );
      setStatus("error");
    } finally {
      running.current = false;
      setBusy(false);
      if (rerun.current) void syncAccount(connected);
    }
  }, [conflict, syncAccount]);

  const resolveWithDrive = useCallback(async () => {
    const connected = accountRef.current;
    if (!connected || !conflict || running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      const current = await loadData();
      const currentHash = await contentHash(current);
      const remote = (await listDriveSnapshots(connected.token))[0];
      if (
        currentHash !== conflict.localHash ||
        remote?.id !== conflict.remote.id
      )
        throw new Error(
          "Os dados mudaram. Sincronize novamente para comparar as versões.",
        );
      if (
        !window.confirm(
          `O backup do Drive tem ${totalRecords(conflict.remoteData)} registros. Ele substituirá os ${totalRecords(current)} registros deste navegador. Uma cópia dos dados locais será baixada antes. Continuar?`,
        )
      )
        return;
      downloadJson(current, "-antes-do-drive");
      await replaceIfRevision(current.revision, conflict.remoteData);
      await saveDriveSync(connected.id, {
        snapshotId: conflict.remote.id,
        contentHash: await contentHash(conflict.remoteData),
      });
      setConflict(null);
      setStatus("synced");
      setSettledRevision(current.revision + 1);
      setMessage(
        "Backup do Drive restaurado. A versão local anterior foi baixada em JSON.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível restaurar o backup.",
      );
      setStatus("error");
    } finally {
      running.current = false;
      setBusy(false);
      if (rerun.current) void syncAccount(connected);
    }
  }, [conflict, replaceIfRevision, syncAccount]);

  const visibleStatus: DriveSyncStatus =
    account && status === "synced" && data.revision !== settledRevision
      ? "pending"
      : status;

  return (
    <Context.Provider
      value={{
        available: Boolean(googleClientId),
        account,
        latest,
        conflict,
        status: visibleStatus,
        busy,
        message,
        error,
        connect,
        disconnect,
        sync,
        resolveWithLocal,
        resolveWithDrive,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useDriveSync(): DriveSyncValue {
  const value = useContext(Context);
  if (!value) throw new Error("DriveSyncProvider ausente");
  return value;
}
