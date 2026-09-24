import { Download, ExternalLink, Smartphone } from "lucide-react";
import { InstallButton } from "../components/InstallApp";
import { PageHeader } from "../components/Layout";
import { installInstructions, isInstalled } from "../install/install";

export function InstallPage() {
  return (
    <>
      <PageHeader
        eyebrow="Acesso rápido"
        title="Biorotina no seu celular"
        description="Adicione o site à tela inicial para abrir sua rotina como um app."
      />
      <section className="panel install-guide">
        <span className="list-icon">
          <Smartphone size={23} aria-hidden="true" />
        </span>
        {isInstalled() ? (
          <>
            <h2>Você já está usando a versão instalada</h2>
            <p>Continue registrando sua rotina normalmente.</p>
          </>
        ) : (
          <>
            <h2>Como adicionar à tela inicial</h2>
            <p>{installInstructions()}</p>
            <p className="muted small">
              No iPhone, abra a Biorotina pelo ícone criado na Tela de Início
              para poder ativar os avisos. A permissão não aparece dentro da aba
              do Firefox ou do Safari. Ao adicionar, deixe “Abrir como App”
              ativado, se essa opção aparecer. É necessário iOS 16.4 ou mais
              recente.
            </p>
            <InstallButton />
            <p className="muted small">
              O botão de instalação aparece somente quando o navegador oferece
              essa opção. Em alguns celulares, o app instalado usa um
              armazenamento separado do navegador. Se você já tem registros,
              sincronize com o Google Drive antes de instalar e conecte o Drive
              novamente no app instalado.
            </p>
          </>
        )}
        <div className="install-benefits">
          <span>
            <Download size={17} aria-hidden="true" /> Sem baixar pela loja
          </span>
          <span>
            <ExternalLink size={17} aria-hidden="true" /> Acesso direto à
            Biorotina
          </span>
        </div>
      </section>
    </>
  );
}
