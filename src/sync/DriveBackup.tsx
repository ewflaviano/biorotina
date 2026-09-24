import { CloudDownload, CloudUpload, LogOut, RefreshCw } from "lucide-react";
import { dateTimePt, totalRecords } from "../domain/data";
import { useDriveSync } from "./DriveSyncContext";

export function DriveBackup() {
  const drive = useDriveSync();

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
              onClick={drive.disconnect}
            >
              <LogOut size={17} aria-hidden="true" /> Desconectar
            </button>
          </div>
          <p className="muted small">
            {drive.latest
              ? `Backup mais recente: ${dateTimePt(drive.latest.createdTime)}.`
              : "Nenhum backup encontrado nesta conta."}
          </p>
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
