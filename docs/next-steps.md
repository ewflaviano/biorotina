# Próximas etapas da Biorotina

Estas etapas começam depois do esqueleto local. O app continua utilizável sem conta. Dados de saúde permanecem no navegador e, se a pessoa optar, em seu próprio Google Drive.

## 1. Conectar Google e fazer backup no Drive (`YTF-11099`)

**Experiência:** “Conectar Google” é uma opção em Configurações. A pessoa vê qual conta está conectada, quando houve a última sincronização confirmada, o que está apenas local, erros e a opção de desconectar. Importar/exportar JSON continua disponível sem login.

**Implementação prevista:** Google Identity Services com escopo mínimo `drive.appdata`, documento versionado em `appDataFolder` e adaptador de sincronização isolado do domínio. Apenas o OAuth client ID público entra no build; token fica em memória pelo menor tempo possível. Não usar client secret nem credenciais de serviço no frontend. Configurar origens locais e de produção no projeto OAuth sem colocar segredos no repositório.

**Critérios de entrega:**

1. Conectar, desconectar e trocar de conta com estados e mensagens claros; autenticação não bloqueia o uso local.
2. Primeira sincronização cobre documento local vazio, documento remoto vazio e dados existentes em ambos.
3. Alterações offline são mantidas e enviadas quando a pessoa sincronizar novamente.
4. Conflito entre revisões em dispositivos diferentes é detectado; a pessoa pode baixar cópias e escolher conscientemente qual versão usar. Nada é substituído silenciosamente.
5. Backups das versões 1 e 2 são migrados para a versão 3; versão futura incompatível gera erro sem substituir registros.
6. Testes unitários do adaptador e dos estados de sincronização; teste manual em dois navegadores/dispositivos com conta de teste. Falhas de rede e autorização expirada têm caminho de recuperação.

**Preparação externa:** criar projeto OAuth no Google Cloud e informar o OAuth client ID público e as origens autorizadas para o ambiente local. Revisar se o fluxo de consentimento exige verificação antes de abrir o app ao público.

## 2. Validar lembretes opcionais em dispositivos reais (`YTF-11103`)

**Experiência:** a pessoa escolhe vários horários de água e de medicação. Um controle separado ativa notificações somente após explicar as condições de entrega e receber permissão do navegador. Cada instalação pode desativar sua própria inscrição.

**Implementação existente:** Service Worker e Web Push no frontend; API Gateway, Lambda Rust e agendamento na AWS. O backend armazena inscrição técnica, união de horários, fuso e expiração. Não recebe nome, dose, volume, peso ou histórico. Credencial opaca por instalação permite atualizar e revogar a inscrição; só seu hash fica no servidor.

**Critérios de entrega:**

1. Permissão pedida em gesto explícito; estados claros para permitido, negado, indisponível, inscrito e falha.
2. Vários horários diários de água e medicação sincronizam com a inscrição sem duplicar envios. Mudanças de fuso e horário de verão são tratadas.
3. Notificação contém texto genérico e não expõe informações de saúde na tela bloqueada.
4. Desativar e revogar remove agendamentos e inscrição; endpoints expirados são eliminados automaticamente.
5. Testes unitários de cálculo/agendamento e API, testes de integração com provedor simulado e verificação manual em navegadores suportados, inclusive restrições no iPhone.
6. Sem infraestrutura configurada, a interface mantém horários como preferências locais e informa que avisos não estão ativos.

**Preparação externa concluída:** a delegação NS de `biorotina.app.br`, os certificados e a infraestrutura AWS estão ativos. Segredos ficam no Secrets Manager, nunca no Git nem no bundle. Falta testar a entrega real e revisar abuso em navegadores suportados antes de anunciar o serviço como estável.
