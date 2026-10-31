import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  CreditCard,
  RotateCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Notice, PageHeader } from "../components/Layout";
import {
  cancelPlan,
  createPlanCheckout,
  getPlanStatus,
  type PlanStatus,
} from "../billing/client";
import { useDriveSync } from "../sync/DriveSyncContext";

function datePt(date: string | null): string {
  if (!date) return "Aguardando confirmação";
  const parsed = new Date(`${date.slice(0, 10)}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? "Aguardando confirmação"
    : parsed.toLocaleDateString("pt-BR");
}

export function PlanPage() {
  const drive = useDriveSync();
  return <PlanContents key={drive.account?.id ?? "guest"} drive={drive} />;
}

function PlanContents({ drive }: { drive: ReturnType<typeof useDriveSync> }) {
  const token = drive.account?.token || "";
  const [status, setStatus] = useState<PlanStatus | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const paymentUrl = checkoutUrl || status?.checkoutUrl || "";

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const latest = await getPlanStatus(token);
      setStatus(latest);
      if (latest.active || !latest.checkoutUrl) setCheckoutUrl("");
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível verificar a assinatura.",
      );
    }
  }, [token]);
  useEffect(() => {
    if (!token) return;
    let mounted = true;
    getPlanStatus(token)
      .then((plan) => {
        if (mounted) {
          setStatus(plan);
          if (plan.active || !plan.checkoutUrl) setCheckoutUrl("");
          setError("");
        }
      })
      .catch((cause) => {
        if (mounted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível verificar a assinatura.",
          );
      });
    return () => {
      mounted = false;
    };
  }, [token]);

  async function start() {
    if (!token) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setCheckoutUrl(await createPlanCheckout(token));
      void refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível iniciar a assinatura.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (
      !token ||
      !window.confirm(
        "Cancelar a renovação mensal? O acesso já pago continua até a data indicada.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      setStatus(await cancelPlan(token));
      setMessage(
        "Renovação cancelada. Seu acesso continua até o fim do período pago.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível cancelar.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="IA opcional"
        title="Plano Biorotina IA"
        description="Seu diário manual continua gratuito. Use o teste de IA ou escolha uma assinatura para analisar mais refeições."
      />
      <div className="plan-layout">
        <section className="panel plan-access">
          <h2>Seu acesso à IA</h2>
          {!drive.account ? (
            <>
              <p>
                Seu diário manual é gratuito e não exige assinatura. Entre com
                Google para conferir o teste de IA disponível para sua conta.
              </p>
              <p>
                O teste não exige cartão e não vira assinatura automaticamente.
              </p>
              <Link className="button secondary" to="/alimentacao">
                Conhecer o teste grátis
              </Link>
            </>
          ) : (
            <>
              {!status && !error ? (
                <p className="muted" role="status">
                  Consultando assinatura…
                </p>
              ) : status?.active ? (
                <Notice kind="success">
                  {status.cancelled
                    ? "Renovação cancelada. Seu acesso continua até o fim do período pago."
                    : "Plano ativo. Você pode analisar fotos de refeições."}
                </Notice>
              ) : status ? (
                <>
                  <Notice kind="info">
                    {status.renewalActive
                      ? "Aguardando confirmação de pagamento."
                      : status.trialEnabled
                        ? status.trialExpired ||
                          (!status.trialPeriodDays &&
                            status.trialUsed >= status.trialLimit)
                          ? "Seu teste grátis terminou. Seu diário manual continua gratuito."
                          : status.trialPeriodDays &&
                              status.trialUsed >= status.trialLimit
                            ? "Você usou as análises grátis de hoje. Elas renovam à meia-noite de Brasília."
                            : "Você tem um teste grátis de IA disponível nesta conta."
                        : "Nenhum plano ativo nesta conta."}
                  </Notice>
                  {status.trialEnabled &&
                  !status.trialExpired &&
                  (status.trialPeriodDays ||
                    status.trialUsed < status.trialLimit) ? (
                    <>
                      <p>
                        {status.trialPeriodDays
                          ? `${status.trialPeriodDays} dias de teste, com até ${status.trialLimit} análises por dia · ${Math.max(0, status.trialLimit - status.trialUsed)} disponíveis hoje.`
                          : `${Math.max(0, status.trialLimit - status.trialUsed)} análises grátis disponíveis, de ${status.trialLimit} no total.`}
                      </p>
                      {status.trialPeriodDays && (
                        <p>
                          {status.trialEndsAt
                            ? `Seu teste termina em ${new Date(status.trialEndsAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (horário de Brasília).`
                            : "O prazo começa na sua primeira análise, não ao entrar com Google."}
                        </p>
                      )}
                      <p>
                        Sem cartão e sem cobrança automática. Ao terminar, você
                        escolhe se quer assinar. O diário manual continua
                        gratuito.
                      </p>
                      <Link className="button primary" to="/alimentacao">
                        {status.trialUsed >= status.trialLimit
                          ? "Continuar registrando grátis"
                          : "Usar meu teste grátis"}
                      </Link>
                    </>
                  ) : (
                    <Link className="text-link" to="/alimentacao">
                      Continuar com meu diário gratuito
                    </Link>
                  )}
                </>
              ) : null}
              {status &&
                (status.paidThrough ||
                  status.renewalActive ||
                  status.checkoutUrl) && (
                  <dl className="plan-facts">
                    <div>
                      <dt>Disponível até</dt>
                      <dd>{datePt(status?.paidThrough || null)}</dd>
                    </div>
                    <div>
                      <dt>Próxima cobrança prevista</dt>
                      <dd>
                        {status?.cancelled
                          ? "Sem nova cobrança"
                          : datePt(status?.nextCharge || null)}
                      </dd>
                    </div>
                    <div>
                      <dt>Análises hoje</dt>
                      <dd>
                        {status
                          ? `${status.usedToday} de ${status.dailyLimit}`
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                )}
              <button
                className="button secondary"
                onClick={() => void refresh()}
              >
                <RotateCw size={17} aria-hidden="true" /> Atualizar situação
              </button>
              {status?.renewalActive && !status.cancelled && (
                <button
                  className="entry-action danger"
                  onClick={() => void cancel()}
                  disabled={busy}
                >
                  Cancelar renovação
                </button>
              )}
              {message && (
                <p role="status" className="muted small">
                  {message}
                </p>
              )}
            </>
          )}
          {error && <Notice kind="info">{error}</Notice>}
        </section>
        <section className="panel plan-offer">
          <span className="support-heart">
            <Sparkles size={23} aria-hidden="true" />
          </span>
          <h2>Mais facilidade no seu diário</h2>
          <p>
            Até 10 análises de refeições por foto por dia. Revise e edite cada
            sugestão antes de salvar.
          </p>
          <strong className="plan-price">
            R$ 8,99 <small>/ mês</small>
          </strong>
          <ul className="plan-benefits">
            <li>
              <Check size={17} aria-hidden="true" /> Cobrança mensal automática
            </li>
            <li>
              <Check size={17} aria-hidden="true" /> Acesso em qualquer aparelho
              com sua conta Google
            </li>
            <li>
              <Check size={17} aria-hidden="true" /> Registros continuam no seu
              navegador ou Drive
            </li>
          </ul>
          <p className="muted small">
            Os dados de cobrança e do cartão são informados somente na página de
            pagamento. A Biorotina não recebe os dados do cartão.
          </p>
          {!drive.account ? (
            <>
              <Notice kind="info">
                Conecte sua conta Google para assinar e usar o plano em outros
                aparelhos.
              </Notice>
              <button
                className="button primary"
                onClick={() => void drive.connect()}
                disabled={drive.busy || !drive.available}
              >
                Entrar com Google
              </button>
              {drive.error && (
                <p className="form-error" role="alert">
                  {drive.error}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="muted small">
                Conta conectada: <strong>{drive.account.email}</strong>
              </p>
              {status &&
                !status.active &&
                !status.renewalActive &&
                !paymentUrl && (
                  <button
                    className="button primary"
                    onClick={() => void start()}
                    disabled={busy}
                  >
                    {busy ? "Preparando pagamento…" : "Assinar por R$ 8,99/mês"}
                  </button>
                )}
              {paymentUrl && (
                <div className="plan-checkout">
                  <Notice kind="info">
                    O plano será liberado após a confirmação do pagamento.
                  </Notice>
                  <a
                    className="button primary"
                    href={paymentUrl}
                    rel="noopener noreferrer"
                  >
                    <CreditCard size={18} aria-hidden="true" /> Continuar para o
                    pagamento
                  </a>
                </div>
              )}
            </>
          )}
        </section>
        {(!drive.account || (status && !status.active)) && (
          <details className="panel plan-alternative">
            <summary>Opções avançadas</summary>
            <ShieldCheck size={20} aria-hidden="true" />
            <h2>Prefere usar sua própria chave?</h2>
            <p>Essa opção continua gratuita e não usa a cota do plano.</p>
            <Link className="text-link" to="/configuracoes">
              Configurar chave Gemini
            </Link>
          </details>
        )}
      </div>
    </>
  );
}
