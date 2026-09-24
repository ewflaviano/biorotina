import { useState } from "react";
import { Link } from "react-router-dom";
import { InfoDisclosure } from "../components/InfoDisclosure";
import {
  getAnalyticsPreference,
  setAnalyticsPreference,
  type AnalyticsPreference,
} from "./visits";
import { useAnalyticsPreference } from "./useAnalyticsPreference";

export function AnalyticsConsentBanner() {
  const [saveError, setSaveError] = useState(false);
  const preference = useAnalyticsPreference();
  if (preference !== "unselected") return null;

  async function choose(choice: Exclude<AnalyticsPreference, "unselected">) {
    await setAnalyticsPreference(choice);
    if (getAnalyticsPreference() !== choice) setSaveError(true);
  }

  return (
    <section
      className="analytics-consent-banner"
      aria-label="Escolha sobre métricas"
    >
      <div className="analytics-consent-main">
        <p>
          Podemos usar métricas de visitas e diagnósticos de erros para melhorar
          a Biorotina?
        </p>
        <div className="analytics-consent-actions">
          <button
            className="button secondary compact"
            type="button"
            onClick={() => void choose("accepted")}
          >
            Aceitar
          </button>
          <button
            className="button secondary compact"
            type="button"
            onClick={() => void choose("declined")}
          >
            Recusar
          </button>
        </div>
      </div>
      {saveError && (
        <p role="alert">
          Não foi possível guardar sua escolha neste navegador.
        </p>
      )}
      <InfoDisclosure label="O que é enviado">
        <p>
          Se você aceitar, o Google Analytics mede visitas, origem aproximada,
          região e tipo de dispositivo usando identificadores do navegador. A
          Biorotina também recebe códigos técnicos de falhas para diagnóstico.
          Não enviamos registros de saúde, fotos, conteúdo dos formulários,
          e-mail ou identificador da conta nesses eventos; não usamos os dados
          para anúncios. Sem sua escolha, ambos ficam desligados.
        </p>
        <p>
          Você pode mudar de ideia em{" "}
          <Link to="/configuracoes">Configurações</Link>. Veja os detalhes em{" "}
          <Link to="/privacidade">Privacidade</Link>.
        </p>
      </InfoDisclosure>
    </section>
  );
}
