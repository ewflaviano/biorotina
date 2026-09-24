import { CloudUpload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { todayIsoDate, totalRecords } from "../domain/data";
import { useAppData } from "../state/AppDataContext";
import { useDriveSync } from "../sync/DriveSyncContext";

const preferenceKey = "biorotina:guest-login-prompt";

function preference(): string | null {
  try {
    return window.localStorage.getItem(preferenceKey);
  } catch {
    return null;
  }
}

function savePreference(value: string) {
  try {
    window.localStorage.setItem(preferenceKey, value);
  } catch {
    // The invitation is optional; saving records never depends on this setting.
  }
}

export function GuestLoginPrompt() {
  const { data, scope, loading } = useAppData();
  const drive = useDriveSync();
  const recordCount = totalRecords(data);
  const previous = useRef<number | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (loading || scope !== null || drive.account) {
      previous.current = null;
      const timer = window.setTimeout(() => setOpen(false), 0);
      return () => window.clearTimeout(timer);
    }
    if (previous.current === null) {
      previous.current = recordCount;
      return;
    }
    const added = recordCount > previous.current;
    previous.current = recordCount;
    if (!added || !drive.available || drive.busy) return;
    const saved = preference();
    if (saved !== "never" && saved !== todayIsoDate()) {
      const timer = window.setTimeout(() => setOpen(true), 0);
      return () => window.clearTimeout(timer);
    }
  }, [recordCount, scope, loading, drive.account, drive.available, drive.busy]);

  function dismiss() {
    savePreference(todayIsoDate());
    setOpen(false);
  }

  function never() {
    savePreference("never");
    setOpen(false);
  }

  function connect() {
    dismiss();
    void drive.connect();
  }

  if (!open || loading || scope !== null || drive.account) return null;
  return (
    <div className="push-prompt-backdrop" role="presentation">
      <section
        className="push-prompt guest-login-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="guest-login-title"
        aria-describedby="guest-login-description"
      >
        <button
          className="push-prompt-close"
          type="button"
          aria-label="Fechar convite"
          onClick={dismiss}
        >
          <X size={20} aria-hidden="true" />
        </button>
        <CloudUpload size={28} className="reminder-icon" aria-hidden="true" />
        <h2 id="guest-login-title">Leve sua rotina com você</h2>
        <p id="guest-login-description">
          Seu registro foi salvo neste navegador. Entre com Google para
          sincronizar seus dados entre dispositivos e acessar as opções de
          análise de refeições por foto.
        </p>
        <p className="muted small">
          Depois de entrar, você pode juntar estes registros aos da sua conta em
          Configurações. O app continua funcionando sem login.
        </p>
        <div className="guest-login-actions">
          <button className="button primary" type="button" onClick={connect}>
            Entrar com Google
          </button>
          <button className="button secondary" type="button" onClick={dismiss}>
            Agora não
          </button>
          <button className="guest-login-never" type="button" onClick={never}>
            Não mostrar novamente
          </button>
        </div>
      </section>
    </div>
  );
}
