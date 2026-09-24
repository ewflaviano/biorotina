import { Link } from "react-router-dom";
import { PageHeader } from "../components/Layout";

export function PrivacyPage() {
  return (
    <>
      <PageHeader
        eyebrow="Transparência"
        title="Como seus dados são usados"
        description="Você escolhe onde guardar seus registros e pode controlar as métricas de acesso."
      />
      <div className="settings-grid">
        <section className="panel">
          <h2>Registros de saúde</h2>
          <p>
            Peso, atividades, alimentação, hidratação, medicamentos, hábitos e
            perfil ficam no armazenamento deste navegador. Se você conectar o
            Google Drive, uma cópia JSON vai diretamente para a área privada do
            app no seu Drive. A Biorotina não recebe esses registros em um banco
            de dados próprio.
          </p>
          <p>
            Você pode consultar e apagar registros no app, exportar uma cópia e
            remover os dados locais nas opções do navegador.
          </p>
        </section>
        <section className="panel">
          <h2>Análise de fotos com Gemini</h2>
          <p>
            Se você configurar sua própria chave Gemini e pedir a análise de uma
            refeição, a foto preparada no aparelho será enviada diretamente ao
            Google para sugerir alimentos, porções e calorias. A foto não é
            salva pela Biorotina. Você pode editar ou descartar a sugestão.
          </p>
          <p>
            A chave fica apenas neste navegador, fora do backup JSON e da
            sincronização com Drive. A descrição e os alimentos que você salvar
            passam a fazer parte do seu diário e do backup, se estiver
            conectado.
          </p>
          <p>
            No teste grátis e no plano mensal, a foto reduzida passa pelo
            serviço da Biorotina para análise no Gemini. Não guardamos a foto ou
            o resultado no servidor. Guardamos um identificador derivado da
            conta Google e as contagens de análises do teste e do plano. Quando
            houver assinatura, guardamos também seu identificador e as datas de
            cobrança. O Asaas coleta os dados de pagamento no checkout; a
            Biorotina não recebe os dados do cartão.
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
            quando expira, e você pode se desconectar a qualquer momento. Para o
            teste grátis ou o plano de IA, o token temporário é enviado ao
            serviço da Biorotina apenas para confirmar a conta Google; ele não é
            armazenado no servidor nem usado para acessar seu Drive.
          </p>
          <p>
            Ao sair da conta no app, os registros, a chave Gemini pessoal e a
            sessão Google são removidos deste navegador. Se houver alterações
            ainda não sincronizadas, você pode esperar a conexão voltar, baixar
            um JSON antes de sair ou apagar os dados sem backup. A cópia no
            Drive permanece na sua conta Google. Você também pode revogar o
            acesso nas configurações da Conta Google e excluir o backup na área
            de dados de apps do Drive. Os dados do Google não são vendidos nem
            usados para anúncios.
          </p>
        </section>
        <section className="panel">
          <h2>Lembretes</h2>
          <p>
            Quando você ativa notificações, o serviço guarda os dados técnicos
            necessários para entregar avisos neste dispositivo, como a inscrição
            do navegador, fuso horário e próximos horários. O texto do aviso é
            genérico. O serviço não recebe nomes de medicamentos ou hábitos,
            doses ou seu histórico de saúde.
          </p>
          <p>
            Desativar os avisos remove a inscrição deste dispositivo do serviço.
            Inscrições sem atualização expiram automaticamente.
          </p>
        </section>
        <section className="panel">
          <h2>Diagnóstico de erros</h2>
          <p>
            Quando algo falha, o app pode enviar à Biorotina somente a área da
            falha, um código técnico, a tela geral e, quando houver, o status
            HTTP. Não enviamos mensagens de erro, endereço completo da página,
            dados de saúde, fotos, e-mail, chave Gemini, tokens ou
            identificadores da conta. Esses registros técnicos ficam nos logs do
            serviço por até 14 dias para ajudar a corrigir problemas. Se você
            desativar as métricas nas Configurações, o app também deixa de
            enviar esses diagnósticos.
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
          <h2>Métricas e diagnóstico de erros</h2>
          <p>
            Usamos Google Analytics para medir visitas, origem aproximada,
            região e tipo de dispositivo. Ele usa identificadores do navegador;
            essas métricas não são anônimas. A medição está ativa por padrão,
            sem uso para publicidade ou remarketing. Enviamos uma URL geral do
            site, sem a tela visitada ou dados dos formulários. O serviço também
            pode contar sessões e primeiras visitas.
          </p>
          <p>
            Você pode desativar ou reativar a medição e o envio de diagnósticos
            a qualquer momento em <Link to="/configuracoes">Configurações</Link>
            . A coleta fica desativada neste navegador após sua escolha.
          </p>
        </section>
      </div>
    </>
  );
}
