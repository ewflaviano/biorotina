import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
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
          Este navegador não oferece avisos neste modo. Confira se você está
          usando HTTPS e uma versão recente do sistema.
        </p>
      )}
      {status === "install_required" && (
        <div className="push-install-guide">
          <p>
            No iPhone, os avisos só podem ser ativados ao abrir a Biorotina pelo
            ícone da Tela de Início. Adicione o site pelo menu Compartilhar do
            Firefox ou do Safari e abra o ícone criado. Depois, volte aqui para
            ativar os avisos.
          </p>
          <Link className="button secondary" to="/instalar">
            Ver como adicionar
          </Link>
        </div>
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
