import {
  Check,
  Copy,
  HeartHandshake,
  Mail,
  MessageSquareText,
  QrCode,
} from "lucide-react";
import { useRef, useState } from "react";
import { PageHeader } from "../components/Layout";
import { reportClientError } from "../observability/client";
import {
  PIX_CNPJ,
  PIX_COPY_PASTE,
  PIX_KEY,
  PIX_RECIPIENT,
} from "../support/pix";

const FEEDBACK_EMAIL = "ewanderson.flaviano@gmail.com";

export function SupportPage() {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const feedbackRef = useRef<HTMLTextAreaElement>(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackCopyStatus, setFeedbackCopyStatus] = useState<
    "idle" | "copied" | "failed"
  >("idle");
  const [feedbackSendStatus, setFeedbackSendStatus] = useState<
    "idle" | "sending" | "sent" | "failed" | "limited"
  >("idle");
  const message = feedback.trim();

  async function sendFeedback() {
    if (!message || feedbackSendStatus === "sending") return;
    setFeedbackSendStatus("sending");
    const apiBase = (import.meta.env.VITE_PUSH_API_URL || "").replace(
      /\/$/,
      "",
    );
    if (!apiBase) {
      reportClientError("feedback", "feedback_failed", "feedback_send");
      setFeedbackSendStatus("failed");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(`${apiBase}/api/feedback`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message }),
        signal: controller.signal,
      });
      if (response.status === 429) {
        setFeedbackSendStatus("limited");
      } else if (!response.ok) {
        reportClientError(
          "feedback",
          "feedback_failed",
          "feedback_send",
          response.status,
        );
        setFeedbackSendStatus("failed");
      } else {
        setFeedback("");
        setFeedbackSendStatus("sent");
      }
    } catch {
      reportClientError("feedback", "network_failed", "feedback_send");
      setFeedbackSendStatus("failed");
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(PIX_COPY_PASTE);
      setCopyStatus("copied");
    } catch {
      codeRef.current?.focus();
      codeRef.current?.select();
      setCopyStatus("failed");
    }
  }

  async function copyFeedback() {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setFeedbackCopyStatus("copied");
    } catch {
      feedbackRef.current?.focus();
      feedbackRef.current?.select();
      setFeedbackCopyStatus("failed");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Feito para todos"
        title="Apoie a Biorotina"
        description="Um app gratuito para cuidar da sua rotina no seu ritmo."
      />
      <div className="support-layout">
        <section className="panel support-intro">
          <span className="support-heart">
            <HeartHandshake size={28} aria-hidden="true" />
          </span>
          <h2>Se o app ajuda você, considere apoiar o projeto.</h2>
          <p>
            Sua contribuição, de qualquer valor, ajuda a manter a Biorotina
            disponível e a desenvolver novas melhorias. O projeto está sendo
            preparado para ter o código aberto. Apoiar é opcional; você pode
            continuar usando tudo gratuitamente.
          </p>
          <div className="support-note">
            <span className="eyebrow">Como contribuir</span>
            <p>
              Use o Pix copia e cola no celular ou leia o QR Code com o app do
              seu banco.
            </p>
          </div>
        </section>
        <section className="panel pix-card" aria-labelledby="pix-heading">
          <div className="card-title">
            <span className="list-icon">
              <QrCode size={21} aria-hidden="true" />
            </span>
            <div>
              <h2 id="pix-heading">Apoiar com Pix</h2>
              <p>Escolha o valor no aplicativo do seu banco.</p>
            </div>
          </div>
          <div className="pix-qr-frame">
            <img
              src="/pix-biorotina.svg"
              alt="QR Code Pix para apoiar a Biorotina"
              width="260"
              height="260"
            />
          </div>
          <div className="pix-recipient">
            <span>Recebedor informado no QR Code</span>
            <strong>{PIX_RECIPIENT}</strong>
            <small>CNPJ {PIX_CNPJ}</small>
          </div>
          <label className="pix-code-label" htmlFor="pix-copy-code">
            Pix copia e cola
          </label>
          <textarea
            ref={codeRef}
            id="pix-copy-code"
            className="pix-code"
            readOnly
            rows={3}
            value={PIX_COPY_PASTE}
            onFocus={(event) => event.currentTarget.select()}
          />
          <button
            className="button primary pix-copy-button"
            type="button"
            onClick={() => void copyCode()}
          >
            {copyStatus === "copied" ? (
              <Check size={18} aria-hidden="true" />
            ) : (
              <Copy size={18} aria-hidden="true" />
            )}
            {copyStatus === "copied" ? "Código copiado" : "Copiar código Pix"}
          </button>
          {copyStatus !== "idle" && (
            <p role="status" className="pix-copy-status">
              {copyStatus === "copied"
                ? "Cole o código na opção Pix copia e cola do seu banco."
                : "Não foi possível copiar automaticamente. O código foi selecionado para você copiar."}
            </p>
          )}
          <p className="pix-key">
            Chave Pix: <span>{PIX_KEY}</span>
          </p>
          <p className="muted small pix-check">
            Confira o recebedor no seu banco antes de confirmar a transferência.
          </p>
        </section>
        <section
          className="panel support-feedback"
          aria-labelledby="feedback-heading"
        >
          <div className="card-title">
            <span className="list-icon">
              <MessageSquareText size={21} aria-hidden="true" />
            </span>
            <div>
              <h2 id="feedback-heading">Sua opinião também ajuda</h2>
              <p>Uma ideia, elogio ou problema que encontrou no app.</p>
            </div>
          </div>
          <label className="pix-code-label" htmlFor="support-feedback-message">
            Sua mensagem
          </label>
          <textarea
            ref={feedbackRef}
            id="support-feedback-message"
            className="support-feedback-message"
            rows={5}
            maxLength={800}
            placeholder="O que você gostou? O que podemos melhorar?"
            value={feedback}
            onChange={(event) => {
              setFeedback(event.target.value);
              setFeedbackCopyStatus("idle");
              setFeedbackSendStatus("idle");
            }}
          />
          <p className="muted small support-feedback-note">
            Escreva só o que quiser compartilhar. Evite dados de saúde ou
            informações pessoais.
          </p>
          <div className="support-feedback-actions">
            <button
              className="button primary"
              type="button"
              disabled={!message || feedbackSendStatus === "sending"}
              onClick={() => void sendFeedback()}
            >
              <Mail size={18} aria-hidden="true" />
              {feedbackSendStatus === "sending"
                ? "Enviando…"
                : "Enviar feedback"}
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={!message}
              onClick={() => void copyFeedback()}
            >
              <Copy size={18} aria-hidden="true" />
              Copiar mensagem
            </button>
          </div>
          {feedbackCopyStatus !== "idle" && (
            <p role="status" className="support-feedback-status">
              {feedbackCopyStatus === "copied"
                ? `Mensagem copiada. Envie para ${FEEDBACK_EMAIL}.`
                : "Não foi possível copiar automaticamente. A mensagem foi selecionada para você copiar."}
            </p>
          )}
          {feedbackSendStatus !== "idle" &&
            feedbackSendStatus !== "sending" && (
              <p role="status" className="support-feedback-status">
                {feedbackSendStatus === "sent"
                  ? "Mensagem enviada. Obrigado pela ajuda!"
                  : feedbackSendStatus === "limited"
                    ? "Muitas mensagens desta conexão hoje. Tente novamente amanhã."
                    : "Não foi possível enviar agora. Tente novamente ou copie sua mensagem."}
              </p>
            )}
          <p className="muted small support-feedback-note">
            Sua mensagem é enviada por e-mail à Biorotina. Nenhum dado dos seus
            registros é incluído automaticamente.
          </p>
        </section>
      </div>
    </>
  );
}
