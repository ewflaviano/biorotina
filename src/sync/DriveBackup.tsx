import {
  CloudDownload,
  CloudUpload,
  Download,
  LogOut,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { dateTimePt, totalRecords } from "../domain/data";
import { useAppData } from "../state/AppDataContext";
import {
  loadData,
  loadLegacyData,
  loadOtherAccountData,
} from "../storage/indexedDb";
import { downloadJson } from "./download";
import { useDriveSync } from "./DriveSyncContext";

type ExitBackup = {
  id: string;
  label: string;
  suffix: string;
  data: Awaited<ReturnType<typeof loadData>>;
};

function containsRecords(data: ExitBackup["data"]): boolean {
  return (
    totalRecords(data) > 0 ||
    Boolean(
      data.profile.displayName ||
      data.profile.heightCm ||
      data.hydrationReminderTimes.length,
    )
  );
}

export function DriveBackup() {
  const drive = useDriveSync();
  const { data } = useAppData();
  const [exitBackups, setExitBackups] = useState<ExitBackup[] | null>(null);
  const [downloaded, setDownloaded] = useState<string[]>([]);
  const [exitError, setExitError] = useState("");

  async function startSignOut() {
    setExitError("");
    try {
      const guest = await loadData(null);
      const legacy = await loadLegacyData();
      const otherAccounts = drive.account
        ? await loadOtherAccountData(drive.account.id)
        : [];
      const backups: ExitBackup[] = [
        { id: "account", label: "Dados desta conta", suffix: "-conta", data },
        {
          id: "guest",
          label: "Dados sem conta",
          suffix: "-sem-conta",
          data: guest,
        },
        ...(legacy
          ? [
              {
                id: "legacy",
                label: "Registros antigos",
                suffix: "-antigos",
                data: legacy,
              },
            ]
          : []),
        ...otherAccounts.map((other, index) => ({
          id: `other-${index}`,
          label: `Dados de outra conta ${index + 1}`,
          suffix: `-outra-conta-${index + 1}`,
          data: other,
        })),
      ].filter((entry) => containsRecords(entry.data));
      if (
        drive.status === "synced" &&
        backups.every((entry) => entry.id === "account")
      ) {
        await drive.disconnect();
      } else {
        setDownloaded([]);
        setExitBackups(backups);
      }
    } catch {
      setExitError(
        "Não foi possível conferir os dados locais. Tente novamente.",
      );
    }
  }

  if (!drive.available)
    return (
      <p className="muted">
        A conexão com o Google Drive não está disponível agora. Seus registros
        continuam neste navegador. Você pode baixar uma cópia na seção “Cópia
        dos dados”.
      </p>
    );

  return (
    <div className="drive-backup">
      {!drive.account ? (
        <>
          <p className="muted">
            Conecte sua conta para guardar uma cópia na área privada da
            Biorotina no seu Drive. O uso do app continua livre, sem login.
          </p>
          <button
            className="button primary"
            type="button"
            onClick={() => void drive.connect()}
            disabled={drive.busy}
          >
            {drive.busy ? "Conectando…" : "Conectar Google Drive"}
          </button>
        </>
      ) : (
        <>
          <div className="drive-account">
            <div>
              <strong>Conta conectada</strong>
              <span>{drive.account.email}</span>
            </div>
            <button
              className="button secondary"
              type="button"
              disabled={drive.busy}
              onClick={() => void startSignOut()}
            >
              <LogOut size={17} aria-hidden="true" /> Sair e apagar dados
            </button>
          </div>
          {exitBackups && (
            <div
              className="drive-exit-choices"
              role="group"
              aria-label="Escolha como sair"
            >
              <strong>
                Há dados neste navegador que podem não estar no Drive
              </strong>
              <p>
                Escolha como sair. O app removerá os registros locais, a chave
                Gemini e a sessão Google deste navegador.
              </p>
              <button
                type="button"
                className="button secondary"
                onClick={() => setExitBackups(null)}
              >
                Esperar conexão e continuar aqui
              </button>
              {exitBackups.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    downloadJson(entry.data, entry.suffix);
                    setDownloaded((current) => [
                      ...new Set([...current, entry.id]),
                    ]);
                  }}
                >
                  <Download size={17} aria-hidden="true" /> Baixar JSON:{" "}
                  {entry.label}
                </button>
              ))}
              {exitBackups.length > 0 && (
                <button
                  type="button"
                  className="button primary"
                  disabled={exitBackups.some(
                    (entry) => !downloaded.includes(entry.id),
                  )}
                  onClick={() => void drive.disconnect(true)}
                >
                  Conferi os downloads: apagar e sair
                </button>
              )}
              <button
                type="button"
                className="entry-action danger"
                onClick={() => void drive.disconnect(true)}
              >
                Apagar sem backup e sair
              </button>
            </div>
          )}
          {exitError && (
            <p className="drive-error" role="alert">
              {exitError}
            </p>
          )}
          <p className="muted small">
            {drive.latest
              ? `Backup mais recente: ${dateTimePt(drive.latest.createdTime)}.`
              : "Nenhum backup encontrado nesta conta."}
          </p>
          {drive.canCopyGuest && (
            <div className="drive-guest-copy">
              <p>
                Há registros salvos neste navegador sem conta. Você pode
                juntá-los aos dados de {drive.account.email} sem apagar os
                registros que já estão no Drive.
              </p>
              <button
                className="button secondary"
                type="button"
                disabled={drive.busy}
                onClick={() => void drive.copyGuest()}
              >
                Juntar registros sem conta
              </button>
            </div>
          )}
          {drive.status === "pending" && (
            <p className="drive-pending">
              Há alterações neste navegador aguardando sincronização.
            </p>
          )}
          <button
            className="button primary"
            type="button"
            onClick={() => void drive.sync()}
            disabled={drive.busy}
          >
            <RefreshCw size={17} aria-hidden="true" />
            {drive.busy ? "Sincronizando…" : "Sincronizar agora"}
          </button>
          {drive.conflict && (
            <div
              className="drive-conflict"
              role="group"
              aria-label="Escolher versão dos dados"
            >
              <strong>Existem duas versões dos seus dados</strong>
              <p>
                Este navegador e o Drive têm alterações diferentes. O backup do
                Drive tem {totalRecords(drive.conflict.remoteData)} registros,
                salvo em {dateTimePt(drive.conflict.remote.createdTime)}.
                Escolha qual versão usar.
              </p>
              <div className="backup-actions">
                <button
                  className="button primary"
                  type="button"
                  disabled={drive.busy}
                  onClick={() => void drive.resolveWithMerged()}
                >
                  Juntar registros
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={drive.busy}
                  onClick={() => void drive.resolveWithLocal()}
                >
                  <CloudUpload size={17} aria-hidden="true" /> Salvar esta
                  versão no Drive
                </button>
                <button
                  className="button secondary"
                  type="button"
                  disabled={drive.busy}
                  onClick={() => void drive.resolveWithDrive()}
                >
                  <CloudDownload size={17} aria-hidden="true" /> Usar backup do
                  Drive
                </button>
              </div>
              <small>
                Nenhuma versão é apagada do Drive. Ao restaurar, você também
                baixa uma cópia dos dados deste navegador.
              </small>
            </div>
          )}
        </>
      )}
      {drive.message && (
        <p className="drive-status" role="status">
          {drive.message}
        </p>
      )}
      {drive.error && (
        <p className="drive-error" role="alert">
          {drive.error}
        </p>
      )}
      <p className="muted small">
        Após conectar, o app sincroniza automaticamente ao registrar ou corrigir
        dados, quando está aberto e com internet. Se o acesso Google expirar,
        conecte novamente. Os registros vão diretamente deste navegador para seu
        Drive; a Biorotina não guarda dados de saúde no servidor. Quem tiver
        acesso à sua conta Google poderá ler essa cópia.
      </p>
    </div>
  );
}
