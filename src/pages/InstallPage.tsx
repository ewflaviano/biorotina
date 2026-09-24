import { Bell, Cloud, ExternalLink, Smartphone } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { InstallButton } from "../components/InstallApp";
import { PageHeader } from "../components/Layout";
import { isInstalled } from "../install/install";

type Platform = "iphone" | "android";

const steps: Record<Platform, { title: string; detail: string }[]> = {
  iphone: [
    {
      title: "Abra a Biorotina no Safari",
      detail:
        "Digite biorotina.app.br no Safari do iPhone. Você pode continuar usando seu navegador preferido para os outros sites.",
    },
    {
      title: "Adicione à Tela de Início",
      detail:
        "Toque em Compartilhar (quadrado com seta), procure “Adicionar à Tela de Início” e toque nessa opção.",
    },
    {
      title: "Confirme que vai abrir como app",
      detail:
        "Deixe “Abrir como App” ligado, se essa opção aparecer, e toque em Adicionar.",
    },
    {
      title: "Abra pelo novo ícone",
      detail:
        "A Biorotina deve abrir sem a barra de endereço do navegador. Se a barra aparecer, o ícone é apenas um atalho; repita a instalação pelo Safari.",
    },
  ],
  android: [
    {
      title: "Abra a Biorotina no Chrome",
      detail: "Acesse biorotina.app.br no Chrome do Android.",
    },
    {
      title: "Instale pela opção do navegador",
      detail:
        "Toque no menu ⋮, depois em “Adicionar à tela inicial” e “Instalar”. O texto pode variar conforme a versão do Chrome.",
    },
    {
      title: "Abra pelo ícone da Biorotina",
      detail:
        "Use o ícone criado na tela inicial para abrir o app. Você também pode permitir avisos quando o Chrome pedir.",
    },
  ],
};

export function InstallPage() {
  const [platform, setPlatform] = useState<Platform>(() =>
    /iPad|iPhone|iPod/.test(navigator.userAgent) ? "iphone" : "android",
  );
  const installed = isInstalled();

  return (
    <>
      <PageHeader
        eyebrow="Acesso rápido"
        title="Biorotina no seu celular"
        description="Instale como app para abrir com um toque e receber avisos nos horários escolhidos."
      />
      <div className="install-layout">
        <section
          className="panel install-guide"
          aria-labelledby="install-title"
        >
          <span className="list-icon">
            <Smartphone size={23} aria-hidden="true" />
          </span>
          {installed ? (
            <>
              <h2 id="install-title">Você já está usando o app instalado</h2>
              <p className="muted">
                Ótimo: esta janela abriu sem a barra do navegador. Agora confira
                os passos para ativar os avisos.
              </p>
            </>
          ) : (
            <>
              <h2 id="install-title">Como instalar</h2>
              <p className="muted">
                Escolha seu celular e siga os passos. No iPhone, recomendamos
                instalar pelo Safari; no Android, pelo Chrome.
              </p>
              <div className="install-platforms" aria-label="Tipo de celular">
                <button
                  type="button"
                  aria-pressed={platform === "iphone"}
                  onClick={() => setPlatform("iphone")}
                >
                  iPhone
                </button>
                <button
                  type="button"
                  aria-pressed={platform === "android"}
                  onClick={() => setPlatform("android")}
                >
                  Android
                </button>
              </div>
              <ol
                className="install-steps"
                aria-label={`Passos para ${platform === "iphone" ? "iPhone" : "Android"}`}
              >
                {steps[platform].map((step) => (
                  <li key={step.title}>
                    <strong>{step.title}</strong>
                    <p>{step.detail}</p>
                  </li>
                ))}
              </ol>
              {platform === "iphone" ? (
                <p className="install-note">
                  No iPhone, a permissão de avisos aparece apenas no app aberto
                  pela Tela de Início, a partir do iOS 16.4. O Chrome também
                  pode adicionar sites, mas, se o ícone abrir com a barra do
                  navegador, use o Safari para instalar como app.
                </p>
              ) : (
                <InstallButton />
              )}
            </>
          )}
        </section>

        <section
          className="panel install-next"
          aria-labelledby="install-next-title"
        >
          <Bell size={22} className="reminder-icon" aria-hidden="true" />
          <h2 id="install-next-title">Depois de instalar</h2>
          <ol className="install-steps">
            <li>
              <strong>Recupere seus dados</strong>
              <p>
                Se já usava a Biorotina no navegador, conecte o Google Drive em{" "}
                <Link to="/configuracoes">Configurações</Link> para trazer seus
                registros e horários ao app instalado.
              </p>
            </li>
            <li>
              <strong>Escolha um horário</strong>
              <p>
                Cadastre horários para água em{" "}
                <Link to="/hidratacao">Hidratação</Link> ou para um medicamento.
              </p>
            </li>
            <li>
              <strong>Ative os avisos</strong>
              <p>
                Na seção “Avisos neste dispositivo”, toque em “Ativar avisos” e
                permita as notificações quando o celular pedir.
              </p>
            </li>
          </ol>
          <p className="install-note">
            <Cloud size={17} aria-hidden="true" /> O app instalado pode guardar
            dados separados dos que estão no navegador. Confirme a sincronização
            antes de remover um ícone antigo.
          </p>
        </section>
        <div className="install-sources">
          <a
            href="https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/27/ios/27"
            target="_blank"
            rel="noreferrer"
          >
            Guia da Apple <ExternalLink size={14} aria-hidden="true" />
          </a>
          <a
            href="https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid"
            target="_blank"
            rel="noreferrer"
          >
            Guia do Chrome <ExternalLink size={14} aria-hidden="true" />
          </a>
        </div>
      </div>
    </>
  );
}
