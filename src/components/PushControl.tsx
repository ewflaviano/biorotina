import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { usePush } from "../state/PushContext";

export function PushControl() {
  const { status, message, scheduleCount, subscribed, enable, disable, test } =
    usePush();
  const active = status === "active";
  const activationLabel =
    status === "connecting"
      ? "Conectando…"
      : status === "install_required"
        ? "Abra pelo ícone para ativar"
        : status === "unavailable"
          ? "Avisos indisponíveis neste navegador"
          : status === "denied"
            ? "Permissão de avisos bloqueada"
            : scheduleCount === 0
              ? "Escolha um horário primeiro"
              : "Ativar avisos";
  return (
    <section className="panel push-control" aria-labelledby="push-title">
      <Bell size={22} className="reminder-icon" aria-hidden="true" />
      <h2 id="push-title">Avisos neste dispositivo</h2>
      <p className="muted">
        {active
          ? "Avisos ativados. Você pode recebê-los mesmo com a página fechada."
          : "Ative para receber avisos nos horários escolhidos, mesmo com a página fechada."}
      </p>
      <p className="muted">
        {scheduleCount} horário{scheduleCount === 1 ? "" : "s"} de aviso
        configurado
        {scheduleCount === 1 ? "" : "s"} entre água e medicação.
      </p>
      {scheduleCount === 0 && (
        <p className="push-setup-hint" id="push-setup-hint">
          Para ativar os avisos, escolha primeiro um horário de lembrete em{" "}
          <Link to="/hidratacao">Hidratação</Link> ou em um medicamento. Depois,
          volte a este botão.
        </p>
      )}
      {status === "unavailable" && (
        <p className="muted">
          Este navegador não permite avisos aqui. Veja como instalar a Biorotina
          no celular para receber lembretes.
          <Link to="/instalar"> Ver passo a passo</Link>
        </p>
      )}
      {status === "install_required" && (
        <div className="push-install-guide">
          <p>
            No iPhone, os avisos só podem ser ativados quando a Biorotina abre
            como app pela Tela de Início. Esta janela ainda está no navegador.
            Abra biorotina.app.br no Safari, toque em Compartilhar → Adicionar à
            Tela de Início e mantenha “Abrir como App” ativado, se aparecer.
            Depois, abra pelo novo ícone, sem a barra de endereço, e volte aqui.
          </p>
          <Link className="button secondary" to="/instalar">
            Ver passo a passo
          </Link>
        </div>
      )}
      {status === "denied" && (
        <p className="form-error" role="alert">
          As notificações foram bloqueadas neste dispositivo. No iPhone, abra
          Ajustes → Notificações → Biorotina e permita os avisos. Depois, volte
          ao app.
        </p>
      )}
      <div className="push-actions">
        {subscribed ? (
          <>
            {active ? (
              <button className="button secondary" type="button" onClick={test}>
                Enviar teste
              </button>
            ) : (
              <button
                className="button primary"
                type="button"
                onClick={enable}
                disabled={
                  status === "connecting" ||
                  status === "unavailable" ||
                  status === "install_required"
                }
              >
                Tentar novamente
              </button>
            )}
            <button
              className="button secondary"
              type="button"
              onClick={disable}
            >
              Desativar avisos
            </button>
          </>
        ) : (
          <button
            className="button primary"
            type="button"
            disabled={
              status === "unavailable" ||
              status === "install_required" ||
              status === "denied" ||
              status === "connecting" ||
              scheduleCount === 0
            }
            aria-describedby={
              scheduleCount === 0 ? "push-setup-hint" : undefined
            }
            onClick={enable}
          >
            {activationLabel}
          </button>
        )}
      </div>
      {message && (
        <p className="push-message" role="status">
          {message}
        </p>
      )}
      <small>
        O aviso é genérico: não mostra nome de medicamento, dose ou seus
        registros na tela bloqueada. Você pode desligar a qualquer momento.
      </small>
    </section>
  );
}
