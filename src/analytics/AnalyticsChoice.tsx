import { useState } from "react";
import { Link } from "react-router-dom";
import { getAnalyticsPreference, setAnalyticsPreference } from "./visits";
import { InfoDisclosure } from "../components/InfoDisclosure";
import { useAnalyticsPreference } from "./useAnalyticsPreference";

export function AnalyticsChoice() {
  const preference = useAnalyticsPreference();
  const [message, setMessage] = useState("");

  function choose(value: "accepted" | "declined") {
    void setAnalyticsPreference(value).catch(() => undefined);
    setMessage(
      getAnalyticsPreference() !== value
        ? "Não foi possível guardar sua escolha neste navegador. A coleta continua desligada."
        : value === "accepted"
          ? "Métricas e diagnóstico de erros ativados neste navegador."
          : "Métricas e diagnóstico de erros desativados neste navegador.",
    );
  }

  return (
    <div className="analytics-choice">
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
      {preference === "unselected" && (
        <p className="muted small" role="status">
          Métricas e diagnósticos estão desligados até você escolher ativá-los.
        </p>
      )}
      <p className="muted small">
        <Link to="/privacidade">Entenda como usamos seus dados</Link>
      </p>
      <InfoDisclosure label="Como usamos as métricas">
        <p>
          Medimos visitas, origem aproximada, região e tipo de dispositivo para
          entender o uso do app. O Google Analytics usa identificadores do
          navegador. Também enviamos códigos técnicos de erros, sem mensagens,
          dados de saúde, fotos ou dados da conta. Não usamos essas métricas
          para anúncios. Você pode desativar ambos aqui a qualquer momento.
        </p>
      </InfoDisclosure>
      {message && <p role="status">{message}</p>}
    </div>
  );
}
