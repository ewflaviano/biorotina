import { Link } from "react-router-dom";
import { PageHeader } from "../components/Layout";

export function PrivacyPage() {
  return (
    <>
      <PageHeader
        eyebrow="Transparência"
        title="Como seus dados são usados"
        description="Você escolhe onde guardar seus registros e se quer permitir métricas de acesso."
      />
      <div className="settings-grid">
        <section className="panel">
          <h2>Registros de saúde</h2>
          <p>
            Peso, atividades, alimentação, hidratação, medicamentos e perfil
            ficam no armazenamento deste navegador. Se você conectar o Google
            Drive, uma cópia JSON vai diretamente para a área privada do app no
            seu Drive. A Biorotina não recebe esses registros em um banco de
            dados próprio.
          </p>
          <p>
            Você pode consultar e apagar os registros no app, exportar uma cópia
            JSON e remover os dados locais nas configurações ou nas opções do
            navegador.
          </p>
        </section>
        <section className="panel">
          <h2>Conta Google e backup</h2>
          <p>
            A conexão com o Google é opcional. Pedimos seu identificador e
            e-mail para mostrar qual conta está conectada, além de acesso à área
            privada da Biorotina no seu Google Drive para criar, encontrar e
            recuperar o backup. O app não acessa os outros arquivos do Drive. O
            token de acesso temporário fica no armazenamento deste navegador
            para manter a conexão ao atualizar a página. O app tenta renová-lo
            quando expira, e você pode se desconectar a qualquer momento. O
            token não é enviado ao servidor da Biorotina.
          </p>
          <p>
            Você pode desconectar a conta no app, revogar o acesso nas
            configurações da sua Conta Google e excluir o backup na área de
            dados de apps do Drive. Os dados do Google não são vendidos nem
            usados para anúncios.
          </p>
        </section>
        <section className="panel">
          <h2>Lembretes</h2>
          <p>
            Quando você ativa notificações, o serviço guarda os dados técnicos
            necessários para entregar avisos neste dispositivo, como a inscrição
            do navegador, fuso horário e próximos horários. O texto do aviso é
            genérico. O serviço não recebe nomes de medicamentos, doses ou seu
            histórico de saúde.
          </p>
          <p>
            Desativar os avisos remove a inscrição deste dispositivo do serviço.
            Inscrições sem atualização expiram automaticamente.
          </p>
        </section>
        <section className="panel">
          <h2>Contato</h2>
          <p>
            Para dúvidas sobre privacidade ou uso da Biorotina, escreva para{" "}
            <a href="mailto:ewanderson.flaviano@gmail.com">
              ewanderson.flaviano@gmail.com
            </a>
            .
          </p>
        </section>
        <section className="panel">
          <h2>Métricas de acesso</h2>
          <p>
            Só com sua permissão, o Google Analytics pode medir visitas, origem
            aproximada, região e tipo de dispositivo. Ele usa identificadores do
            navegador; essas métricas não são anônimas. Enviamos uma URL geral
            do site, sem a tela visitada ou dados dos formulários. O SDK também
            pode gerar eventos básicos de sessão e primeira visita.
          </p>
          <p>
            Você pode negar ou retirar a permissão a qualquer momento em{" "}
            <Link to="/configuracoes">Configurações</Link>. Sem permissão, a
            coleta de métricas fica desativada.
          </p>
        </section>
      </div>
    </>
  );
}
