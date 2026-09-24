import { Download, Smartphone, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import {
  canInstallDirectly,
  dismissInstallPrompt,
  installDirectly,
  isInstalled,
  isMobileViewport,
  subscribeToInstall,
  wasInstallPromptDismissed,
} from "../install/install";

export function InstallButton() {
  const canInstall = useSyncExternalStore(
    subscribeToInstall,
    canInstallDirectly,
    () => false,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if ((!canInstall && !message) || isInstalled()) return null;
  return (
    <>
      {canInstall && (
        <button
          className="button primary"
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const installed = await installDirectly();
            setMessage(
              installed
                ? "Pronto! O navegador adicionará a Biorotina."
                : "Use o menu do navegador para adicionar à tela inicial.",
            );
            setBusy(false);
          }}
        >
          <Download size={18} aria-hidden="true" /> Instalar Biorotina
        </button>
      )}
      {message && (
        <p role="status" className="small muted">
          {message}
        </p>
      )}
    </>
  );
}

export function InstallPrompt({
  enabled,
  delayMs,
}: {
  enabled: boolean;
  delayMs: number;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (
      !enabled ||
      !isMobileViewport() ||
      isInstalled() ||
      wasInstallPromptDismissed()
    )
      return;
    const timer = window.setTimeout(() => setVisible(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [enabled, delayMs]);

  useEffect(() => {
    const hide = () => setVisible(false);
    window.addEventListener("appinstalled", hide);
    return () => window.removeEventListener("appinstalled", hide);
  }, []);

  if (!visible) return null;
  return (
    <aside className="install-prompt" aria-label="Instalar Biorotina">
      <span className="list-icon">
        <Smartphone size={20} aria-hidden="true" />
      </span>
      <div className="install-prompt-copy">
        <strong>Biorotina na sua tela inicial</strong>
        <span>Acesse sua rotina com um toque, como um app.</span>
        <InstallButton />
        <Link
          to="/instalar"
          onClick={() => {
            dismissInstallPrompt();
            setVisible(false);
          }}
        >
          Ver passo a passo
        </Link>
      </div>
      <button
        className="install-dismiss"
        type="button"
        aria-label="Dispensar convite para instalar"
        onClick={() => {
          dismissInstallPrompt();
          setVisible(false);
        }}
      >
        <X size={18} aria-hidden="true" />
      </button>
    </aside>
  );
}
