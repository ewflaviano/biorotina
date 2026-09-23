import { useEffect, useState } from "react";
import { CloudDownload, CloudUpload, RefreshCw, LogOut } from "lucide-react";
import { dateTimePt, totalRecords, type AppData } from "../domain/data";
import { loadData, loadDriveSync, saveDriveSync } from "../storage/indexedDb";
import { useAppData } from "../state/AppDataContext";
import { downloadJson } from "./download";
import { decideSync } from "./decision";
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

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();

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

export function DriveBackup({
  onRestore,
}: {
  onRestore: (data: AppData) => void;
}) {
  const { data, replaceIfRevision } = useAppData();
  const [account, setAccount] = useState<GoogleAccount | null>(
    currentGoogleAccount,
  );
  const [latest, setLatest] = useState<DriveSnapshot | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [localPending, setLocalPending] = useState(false);

  useEffect(() => {
    if (clientId) void preloadGoogleIdentity().catch(() => undefined);
  }, []);

  useEffect(() => {
    const connected = currentGoogleAccount();
    if (!connected) return;
    let active = true;
    void listDriveSnapshots(connected.token)
      .then((snapshots) => {
        if (active) setLatest(snapshots[0] ?? null);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível consultar o Google Drive.",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!account || !latest) return;
    let active = true;
    void Promise.all([loadDriveSync(account.id), contentHash(data)])
      .then(([previous, hash]) => {
        if (active)
          setLocalPending(
            previous?.snapshotId === latest.id && previous.contentHash !== hash,
          );
      })
      .catch(() => {
        if (active) setLocalPending(false);
      });
    return () => {
      active = false;
    };
  }, [account, data, latest]);

  function showError(cause: unknown) {
    setError(
      cause instanceof Error
        ? cause.message
        : "Não foi possível sincronizar com o Google Drive.",
    );
  }

  async function connect() {
    if (!clientId) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const connected = await connectGoogle(clientId);
      const snapshots = await listDriveSnapshots(connected.token);
      rememberGoogleAccount(connected);
      setAccount(connected);
      setLatest(snapshots[0] ?? null);
      setConflict(null);
      setMessage(
        snapshots.length
          ? "Conta conectada. Toque em Sincronizar agora para comparar seus dados."
          : "Conta conectada. Você ainda não tem um backup da Biorotina no Drive.",
      );
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }

  async function sync() {
    if (!account) return;
    setBusy(true);
    setError("");
    setMessage("");
    setConflict(null);
    try {
      const snapshots = await listDriveSnapshots(account.token);
      const remote = snapshots[0] ?? null;
      setLatest(remote);
      const local = await loadData();
      const localHash = await contentHash(local);
      const previous = await loadDriveSync(account.id);

      const remoteData =
        remote && previous?.snapshotId !== remote.id
          ? await downloadDriveSnapshot(account.token, remote)
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
        setMessage(
          "Nada para sincronizar ainda. Seus novos registros ficam neste navegador.",
        );
        return;
      }
      if (decision === "upload") {
        const saved = await uploadDriveSnapshot(account.token, local);
        await saveDriveSync(account.id, {
          snapshotId: saved.id,
          contentHash: localHash,
        });
        setLatest(saved);
        setMessage("Backup criado no seu Google Drive.");
        return;
      }
      if (decision === "synced") {
        setMessage("Seus dados já estão sincronizados.");
        return;
      }
      if (!remote || !remoteData || !remoteHash)
        throw new Error("Backup do Drive incompleto.");
      if (decision === "mark-synced") {
        await saveDriveSync(account.id, {
          snapshotId: remote.id,
          contentHash: localHash,
        });
        setMessage("Seus dados já estão sincronizados.");
        return;
      }
      if (decision === "restore") {
        await replaceIfRevision(local.revision, remoteData);
        onRestore(remoteData);
        await saveDriveSync(account.id, {
          snapshotId: remote.id,
          contentHash: remoteHash,
        });
        setMessage("Dados atualizados a partir do seu Google Drive.");
        return;
      }
      setConflict({ remote, remoteData, localHash });
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }

  async function resolveWithLocal() {
    if (!account || !conflict) return;
    setBusy(true);
    setError("");
    try {
      const current = await loadData();
      const currentHash = await contentHash(current);
      const remote = (await listDriveSnapshots(account.token))[0];
      if (
        currentHash !== conflict.localHash ||
        remote?.id !== conflict.remote.id
      )
        throw new Error(
          "Os dados mudaram. Toque em Sincronizar agora para comparar novamente.",
        );
      const saved = await uploadDriveSnapshot(account.token, current);
      await saveDriveSync(account.id, {
        snapshotId: saved.id,
        contentHash: currentHash,
      });
      setLatest(saved);
      setConflict(null);
      setMessage(
        "Esta versão foi salva no Drive. O backup anterior continua disponível.",
      );
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }

  async function resolveWithDrive() {
    if (!account || !conflict) return;
    setBusy(true);
    setError("");
    try {
      const current = await loadData();
      const currentHash = await contentHash(current);
      const remote = (await listDriveSnapshots(account.token))[0];
      if (
        currentHash !== conflict.localHash ||
        remote?.id !== conflict.remote.id
      )
        throw new Error(
          "Os dados mudaram. Toque em Sincronizar agora para comparar novamente.",
        );
      const confirmed = window.confirm(
        `O backup do Drive tem ${totalRecords(conflict.remoteData)} registros. Ele substituirá os ${totalRecords(current)} registros deste navegador. Uma cópia dos dados locais será baixada antes. Continuar?`,
      );
      if (!confirmed) return;
      downloadJson(current, "-antes-do-drive");
      await replaceIfRevision(current.revision, conflict.remoteData);
      onRestore(conflict.remoteData);
      await saveDriveSync(account.id, {
        snapshotId: conflict.remote.id,
        contentHash: await contentHash(conflict.remoteData),
      });
      setConflict(null);
      setMessage(
        "Backup do Drive restaurado. A versão local anterior foi baixada em JSON.",
      );
    } catch (cause) {
      showError(cause);
    } finally {
      setBusy(false);
    }
  }

  if (!clientId)
    return (
      <p className="muted">
        A sincronização com o Google Drive ainda não foi configurada nesta
        instalação. Seus dados continuam salvos neste navegador e podem ser
        exportados em JSON.
      </p>
    );

  return (
    <div className="drive-backup">
      {!account ? (
        <>
          <p className="muted">
            Conecte sua conta para guardar uma cópia na área privada da
            Biorotina no seu Drive. O uso do app continua livre, sem login.
          </p>
          <button
            className="button primary"
            type="button"
            onClick={connect}
            disabled={busy}
          >
            {busy ? "Conectando…" : "Conectar Google Drive"}
          </button>
        </>
      ) : (
        <>
          <div className="drive-account">
            <div>
              <strong>Conta conectada</strong>
              <span>{account.email}</span>
            </div>
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={() => {
                disconnectGoogle(account);
                setAccount(null);
                setLatest(null);
                setConflict(null);
                setMessage("");
              }}
            >
              <LogOut size={17} aria-hidden="true" /> Desconectar
            </button>
          </div>
          <p className="muted small">
            {latest
              ? `Backup mais recente: ${dateTimePt(latest.createdTime)}.`
              : "Nenhum backup encontrado nesta conta."}
          </p>
          {localPending && (
            <p className="drive-pending">
              Há alterações neste navegador aguardando sincronização.
            </p>
          )}
          <button
            className="button primary"
            type="button"
            onClick={sync}
            disabled={busy}
          >
            <RefreshCw size={17} aria-hidden="true" />
            {busy ? "Sincronizando…" : "Sincronizar agora"}
          </button>
          {conflict && (
            <div
              className="drive-conflict"
              role="group"
              aria-label="Escolher versão dos dados"
            >
              <strong>Existem duas versões dos seus dados</strong>
              <p>
                Este navegador e o Drive têm alterações diferentes. O backup do
                Drive tem {totalRecords(conflict.remoteData)} registros, salvo
                em {dateTimePt(conflict.remote.createdTime)}. Escolha qual
                versão usar.
              </p>
              <div className="backup-actions">
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy}
                  onClick={resolveWithLocal}
                >
                  <CloudUpload size={17} aria-hidden="true" /> Salvar esta
                  versão no Drive
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy}
                  onClick={resolveWithDrive}
                >
                  <CloudDownload size={17} aria-hidden="true" /> Usar backup do
                  Drive
                </button>
              </div>
              <small>
                Nenhuma versão é apagada do Drive. Ao restaurar, você também
                recebe um JSON da versão local.
              </small>
            </div>
          )}
        </>
      )}
      {message && (
        <p className="drive-status" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="drive-error" role="alert">
          {error}
        </p>
      )}
      <p className="muted small">
        Os registros vão diretamente deste navegador para seu Drive. A Biorotina
        não guarda seus dados de saúde no servidor. O backup no Drive é um JSON
        legível.
      </p>
    </div>
  );
}
