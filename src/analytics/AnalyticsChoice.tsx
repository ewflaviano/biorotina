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
      getAnalyticsPreference() === "unset"
        ? "Não foi possível guardar sua escolha neste navegador. As métricas continuam desativadas."
        : value === "accepted"
          ? "Sua escolha foi salva. Você permitiu as métricas de acesso."
          : "Sua escolha foi salva. As métricas estão desativadas neste navegador.",
    );
  }

  return (
    <div className="analytics-choice">
      <p className="muted">
        Se você permitir, medimos visitas, origem aproximada, região e tipo de
        dispositivo para entender o uso do app. O Google Analytics usa
        identificadores do navegador. Nunca enviamos peso, alimentação,
        medicamentos, perfil ou registros de saúde para essas métricas.
      </p>
      <div className="backup-actions">
        <button
          className={`button ${preference === "accepted" ? "primary" : "secondary"}`}
          type="button"
          aria-pressed={preference === "accepted"}
          onClick={() => choose("accepted")}
        >
          Permitir métricas
        </button>
        <button
          className={`button ${preference === "declined" ? "primary" : "secondary"}`}
          type="button"
          aria-pressed={preference === "declined"}
          onClick={() => choose("declined")}
        >
          Não permitir
        </button>
      </div>
      {preference === "unset" && (
        <p className="muted small">
          Não enviamos métricas ao Google Analytics sem sua escolha.
        </p>
      )}
      <p className="muted small">
        <Link to="/privacidade">Entenda como usamos seus dados</Link>
      </p>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
