import { CloudUpload, X } from "lucide-react";
import { useDriveSync } from "../sync/DriveSyncContext";

export function DrivePermissionPrompt() {
  const drive = useDriveSync();
  if (
    !drive.drivePermissionPrompt ||
    !drive.account ||
    drive.account.driveAuthorized !== false
  )
    return null;

  return (
    <div className="push-prompt-backdrop" role="presentation">
      <section
        className="push-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="drive-permission-title"
      >
        <button
          className="push-prompt-close"
          type="button"
          aria-label="Fechar convite"
          onClick={drive.dismissDrivePermissionPrompt}
        >
          <X size={20} aria-hidden="true" />
        </button>
        <CloudUpload size={28} className="reminder-icon" aria-hidden="true" />
        <h2 id="drive-permission-title">Guardar sua rotina no Drive?</h2>
        <p>
          Você já entrou com Google. Agora pode permitir que a Biorotina salve
          seus registros na área privada do seu Drive e os sincronize entre
          dispositivos.
        </p>
        <p className="muted small">
          Essa permissão é opcional. Sem ela, seus registros continuam apenas
          neste navegador.
        </p>
        <div className="guest-login-actions">
          <button
            className="button primary"
            type="button"
            disabled={drive.busy}
            onClick={() => void drive.authorizeDrive()}
          >
            {drive.busy ? "Conectando…" : "Ativar sincronização"}
          </button>
          <button
            className="button secondary"
            type="button"
            disabled={drive.busy}
            onClick={drive.dismissDrivePermissionPrompt}
          >
            Agora não
          </button>
        </div>
        {drive.error && (
          <p className="drive-error" role="alert">
            {drive.error}
          </p>
        )}
      </section>
    </div>
  );
}
