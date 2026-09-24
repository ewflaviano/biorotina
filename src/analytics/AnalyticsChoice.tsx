import { useState } from "react";
import { Link } from "react-router-dom";
import {
  getAnalyticsPreference,
  setAnalyticsPreference,
  type AnalyticsPreference,
} from "./visits";

export function AnalyticsChoice() {
  const [preference, setPreference] = useState<AnalyticsPreference>(
    getAnalyticsPreference,
  );
  const [message, setMessage] = useState("");

  function choose(value: "accepted" | "declined") {
    void setAnalyticsPreference(value).catch(() => undefined);
    setPreference(getAnalyticsPreference());
    setMessage(
      value === "accepted"
        ? "Métricas de acesso ativadas neste navegador."
        : "Métricas de acesso desativadas neste navegador.",
    );
  }

  return (
    <div className="analytics-choice">
      <p className="muted">
        Medimos visitas, origem aproximada, região e tipo de dispositivo para
        entender o uso do app. O Google Analytics usa identificadores do
        navegador. Não usamos essas métricas para anúncios e nunca enviamos
        peso, alimentação, medicamentos, perfil ou registros de saúde. Você pode
        desativar a coleta aqui a qualquer momento.
      </p>
      <div className="backup-actions">
        <button
          className={`button ${preference === "accepted" ? "primary" : "secondary"}`}
          type="button"
          aria-pressed={preference === "accepted"}
          onClick={() => choose("accepted")}
        >
          Ativar métricas
        </button>
        <button
          className={`button ${preference === "declined" ? "primary" : "secondary"}`}
          type="button"
          aria-pressed={preference === "declined"}
          onClick={() => choose("declined")}
        >
          Desativar métricas
        </button>
      </div>
      <p className="muted small">
        <Link to="/privacidade">Entenda como usamos seus dados</Link>
      </p>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
