import { Merge, X } from "lucide-react";
import { useState } from "react";
import { useDriveSync } from "../sync/DriveSyncContext";

export function GuestMergePrompt() {
  const drive = useDriveSync();
  const [dismissedAccount, setDismissedAccount] = useState("");
  const account = drive.account;
  if (
    !account ||
    !drive.canCopyGuest ||
    drive.busy ||
    dismissedAccount === account.id
  )
    return null;

  return (
    <div className="push-prompt-backdrop" role="presentation">
      <section
        className="push-prompt guest-merge-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-merge-title"
      >
        <button
          className="push-prompt-close"
          type="button"
          aria-label="Fechar convite"
          onClick={() => setDismissedAccount(account.id)}
        >
          <X size={20} aria-hidden="true" />
        </button>
        <Merge size={28} className="reminder-icon" aria-hidden="true" />
        <h2 id="guest-merge-title">Juntar seus registros?</h2>
        <p>
          Encontramos registros salvos sem conta neste navegador. Você pode
          juntá-los aos de {account.email} sem substituir os que já estão no
          Drive.
        </p>
        <p className="muted small">
          Confira e confirme antes de enviar. Se preferir, faça isso depois em
          Configurações.
        </p>
        <div className="guest-login-actions">
          <button
            className="button primary"
            type="button"
            onClick={() => void drive.copyGuest()}
          >
            Juntar agora
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => setDismissedAccount(account.id)}
          >
            Decidir depois
          </button>
        </div>
      </section>
    </div>
  );
}
