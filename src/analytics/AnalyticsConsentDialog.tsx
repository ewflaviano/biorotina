import { ShieldCheck } from "lucide-react";
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { setAnalyticsPreference } from "./visits";

export function AnalyticsConsentDialog({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const declineRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    declineRef.current?.focus();
    return () => {
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else dialog.removeAttribute("open");
    };
  }, []);

  function choose(value: "accepted" | "declined") {
    // The choice is saved before the optional Firebase request starts.
    void setAnalyticsPreference(value).catch(() => undefined);
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="analytics-dialog"
      aria-labelledby="analytics-dialog-title"
      aria-describedby="analytics-dialog-description"
      onCancel={onClose}
    >
      <span className="consent-icon">
        <ShieldCheck size={24} aria-hidden="true" />
      </span>
      <span className="eyebrow">Cookies opcionais</span>
      <h2 id="analytics-dialog-title">Podemos medir as visitas ao app?</h2>
      <p id="analytics-dialog-description">
        Com sua permissão, o Google Analytics usa identificadores do navegador
        para medir visitas, origem aproximada e tipo de dispositivo. Seus
        registros de saúde nunca entram nessas métricas.
      </p>
      <div className="consent-actions">
        <button
          className="button primary"
          type="button"
          onClick={() => choose("accepted")}
        >
          Permitir métricas
        </button>
        <button
          ref={declineRef}
          className="button secondary"
          type="button"
          onClick={() => choose("declined")}
        >
          Não permitir
        </button>
      </div>
      <div className="consent-footer">
        <Link to="/privacidade" onClick={onClose}>
          Entenda como usamos seus dados
        </Link>
        <button type="button" onClick={onClose}>
          Agora não
        </button>
      </div>
    </dialog>
  );
}
