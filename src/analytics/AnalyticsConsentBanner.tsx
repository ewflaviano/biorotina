import { ChartNoAxesCombined } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, useLocation } from "react-router-dom";
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
  const { pathname } = useLocation();
  const dialogRef = useRef<HTMLElement>(null);
  const visible =
    preference === "unselected" &&
    pathname !== "/privacidade" &&
    pathname !== "/configuracoes";

  useEffect(() => {
    if (!visible) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [visible]);

  if (!visible) return null;

  async function choose(choice: Exclude<AnalyticsPreference, "unselected">) {
    await setAnalyticsPreference(choice);
    if (getAnalyticsPreference() !== choice) setSaveError(true);
  }

  function keepFocusInDialog(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), a[href]",
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (
      event.shiftKey &&
      (document.activeElement === first ||
        document.activeElement === dialogRef.current)
    ) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="analytics-consent-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="push-prompt analytics-consent-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="analytics-consent-title"
        aria-describedby="analytics-consent-description"
        tabIndex={-1}
        onKeyDown={keepFocusInDialog}
      >
        <span className="analytics-consent-icon" aria-hidden="true">
          <ChartNoAxesCombined size={26} />
        </span>
        <h2 id="analytics-consent-title">
          Podemos usar métricas de visitas e diagnósticos de erros para melhorar
          a Biorotina?
        </h2>
        <p id="analytics-consent-description">
          Isso nos ajuda a entender o uso do app e corrigir problemas. Seus
          registros de saúde e fotos não são enviados nessas métricas.
        </p>
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
        <div className="analytics-consent-actions">
          <button
            className="button primary"
            type="button"
            onClick={() => void choose("accepted")}
          >
            Aceitar
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => void choose("declined")}
          >
            Recusar
          </button>
        </div>
        {saveError && (
          <p role="alert">
            Não foi possível guardar sua escolha neste navegador. As métricas
            continuam desligadas.
          </p>
        )}
      </section>
    </div>
  );
}
