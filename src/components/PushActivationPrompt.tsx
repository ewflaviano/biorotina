import { Bell, Info, X } from "lucide-react";
import { usePush } from "../state/PushContext";

export function PushActivationPrompt({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { enable, status } = usePush();
  if (!open) return null;
  const activate = async () => {
    await enable();
    onClose();
  };
  return (
    <div className="push-prompt-backdrop" role="presentation">
      <section
        className="push-prompt"
        role="dialog"
        aria-modal="true"
        aria-labelledby="push-prompt-title"
      >
        <button
          className="push-prompt-close"
          type="button"
          onClick={onClose}
          aria-label="Fechar"
        >
          <X size={20} aria-hidden="true" />
        </button>
        <Bell size={28} className="reminder-icon" aria-hidden="true" />
        <h2 id="push-prompt-title">Quer receber este lembrete?</h2>
        <p>
          Ative os avisos neste dispositivo para ser lembrado nos horários que
          você acabou de salvar.
        </p>
        <p className="muted">
          <Info size={15} aria-hidden="true" /> Os detalhes e o controle para
          desligar ficam em Configurações.
        </p>
        <div className="push-actions">
          <button
            className="button primary"
            type="button"
            onClick={activate}
            disabled={status === "connecting"}
          >
            Ativar avisos
          </button>
          <button className="button secondary" type="button" onClick={onClose}>
            Agora não
          </button>
        </div>
      </section>
    </div>
  );
}
