import { CloudDownload, CloudUpload, Merge, X } from "lucide-react";
import { useState } from "react";
import { totalRecords } from "../domain/data";
import { useAppData } from "../state/AppDataContext";
import { useDriveSync } from "../sync/DriveSyncContext";

export function SyncConflictPrompt() {
  const drive = useDriveSync();
  const { data } = useAppData();
  const [dismissed, setDismissed] = useState("");
  const conflict = drive.conflict;
  if (!conflict || drive.status !== "conflict") return null;
  const key = `${conflict.remote.id}:${conflict.localHash}`;
  if (dismissed === key) return null;

  return (
    <div className="push-prompt-backdrop" role="presentation">
      <section
        className="push-prompt sync-conflict-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-conflict-title"
        aria-describedby="sync-conflict-description"
      >
        <button
          className="push-prompt-close"
          type="button"
          aria-label="Decidir depois"
          onClick={() => setDismissed(key)}
        >
          <X size={20} aria-hidden="true" />
        </button>
        <Merge size={28} className="reminder-icon" aria-hidden="true" />
        <h2 id="sync-conflict-title">Como guardar seus registros?</h2>
        <p id="sync-conflict-description">
          Há {totalRecords(data)} registros neste navegador e{" "}
          {totalRecords(conflict.remoteData)} no Drive. As duas versões são
          diferentes.
        </p>
        <p className="muted small">
          Juntar adiciona os registros com IDs diferentes. Se o mesmo registro
          mudou nas duas versões, prevalece a deste navegador; o backup antigo
          do Drive continua disponível.
        </p>
        <div className="sync-conflict-actions">
          <button
            className="button primary"
            type="button"
            disabled={drive.busy}
            onClick={() => void drive.resolveWithMerged()}
          >
            <Merge size={17} aria-hidden="true" /> Juntar registros
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={drive.busy}
            onClick={() => void drive.resolveWithLocal()}
          >
            <CloudUpload size={17} aria-hidden="true" /> Manter este navegador
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={drive.busy}
            onClick={() => void drive.resolveWithDrive()}
          >
            <CloudDownload size={17} aria-hidden="true" /> Usar o Drive
          </button>
          <button
            className="guest-login-never"
            type="button"
            onClick={() => setDismissed(key)}
          >
            Decidir depois em Configurações
          </button>
        </div>
      </section>
    </div>
  );
}
