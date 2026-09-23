import { Bell } from "lucide-react";
import { usePush } from "../state/PushContext";

export function PushControl() {
  const { status, message, scheduleCount, subscribed, enable, disable, test } =
    usePush();
  const active = status === "active";
  return (
    <section className="panel push-control" aria-labelledby="push-title">
      <Bell size={22} className="reminder-icon" aria-hidden="true" />
      <h2 id="push-title">Avisos neste dispositivo</h2>
      <p className="muted">
        {active
          ? "Ativos: o serviço envia avisos mesmo quando a página está fechada."
          : "Ative para receber avisos nos horários escolhidos, mesmo com a página fechada."}
      </p>
      <p className="muted">
        {scheduleCount} horário{scheduleCount === 1 ? "" : "s"} de aviso
        configurado
        {scheduleCount === 1 ? "" : "s"} entre água e medicação.
      </p>
      {status === "unavailable" && (
        <p className="muted">
          Este navegador não oferece Web Push aqui. Use HTTPS; no iPhone,
          adicione a Biorotina à Tela de Início antes de ativar.
        </p>
      )}
      {status === "denied" && (
        <p className="form-error" role="alert">
          O navegador bloqueou as notificações deste site.
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
                disabled={status === "connecting" || status === "unavailable"}
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
              status === "connecting" ||
              scheduleCount === 0
            }
            onClick={enable}
          >
            {status === "connecting" ? "Conectando…" : "Ativar avisos"}
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
