import {
  Check,
  Copy,
  HeartHandshake,
  MessageSquareText,
  QrCode,
} from "lucide-react";
import { useRef, useState } from "react";
import { PageHeader } from "../components/Layout";
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
  const [emailCopyStatus, setEmailCopyStatus] = useState<
    "idle" | "copied" | "failed"
  >("idle");

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

  async function copyEmail() {
    try {
      await navigator.clipboard.writeText(FEEDBACK_EMAIL);
      setEmailCopyStatus("copied");
    } catch {
      setEmailCopyStatus("failed");
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
              <p>Ideias, sugestões e melhorias são sempre bem-vindas.</p>
            </div>
          </div>
          <p className="support-feedback-invite">
            Quer sugerir uma melhoria ou contar sobre algo que não funcionou?
            Envie um e-mail para:
          </p>
          <button
            className="button secondary support-email-button"
            type="button"
            onClick={() => void copyEmail()}
            aria-label={`Copiar e-mail ${FEEDBACK_EMAIL}`}
          >
            {emailCopyStatus === "copied" ? (
              <Check size={18} aria-hidden="true" />
            ) : (
              <Copy size={18} aria-hidden="true" />
            )}
            <span>{FEEDBACK_EMAIL}</span>
          </button>
          {emailCopyStatus !== "idle" && (
            <p role="status" className="support-feedback-status">
              {emailCopyStatus === "copied"
                ? "E-mail copiado. Cole o endereço no aplicativo de e-mail que preferir."
                : "Não foi possível copiar automaticamente. Você pode copiar o endereço mostrado acima."}
            </p>
          )}
          <p className="muted small support-feedback-note">
            Toque no endereço para copiar. Depois, escreva sua mensagem no seu
            aplicativo de e-mail. Evite incluir dados de saúde ou informações
            pessoais.
          </p>
        </section>
      </div>
    </>
  );
}
