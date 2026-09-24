# Próximas etapas da Biorotina

O app continua utilizável sem conta. Dados de saúde permanecem no navegador e, se a pessoa optar, em seu próprio Google Drive. As integrações abaixo já foram implementadas; os itens restantes são verificações de entrega e operação.

## 1. Conectar Google e fazer backup no Drive (`YTF-11099`) — implementado

**Experiência:** “Entrar” aparece no topo de todas as telas, com detalhes e resolução de conflitos em Configurações. Após conectar, alterações sincronizam automaticamente enquanto a página está aberta; a pessoa vê a conta, o estado do Drive, erros e a opção de desconectar. Importar/exportar JSON continua disponível sem login.

**Implementação atual:** Google Identity Services com `openid`, `email` e `drive.appdata`, snapshots JSON versionados em `appDataFolder` e adaptador isolado do domínio. Apenas o OAuth client ID público entra no build; o token da pessoa fica no armazenamento do seu navegador para manter a conexão após recarregar. Não usar client secret nem credenciais de serviço no frontend. Origens locais e de produção estão configuradas no projeto OAuth sem segredos no repositório.

**Critérios de entrega:**

1. Conectar, desconectar e trocar de conta com estados e mensagens claros; autenticação não bloqueia o uso local.
2. Primeira sincronização cobre documento local vazio, documento remoto vazio e dados existentes em ambos.
3. Alterações offline são mantidas e reenviadas quando a conexão volta ou a pessoa sincroniza novamente.
4. Conflito entre revisões em dispositivos diferentes é detectado; a pessoa pode baixar cópias e escolher conscientemente qual versão usar. Nada é substituído silenciosamente.
5. Backups das versões 1, 2 e 3 são migrados para a versão 4; versão futura incompatível gera erro sem substituir registros.
6. Testes unitários do adaptador e dos estados de sincronização; teste manual em dois navegadores/dispositivos com conta de teste. Falhas de rede e autorização expirada têm caminho de recuperação.

**Validação concluída:** conexão OAuth no navegador, listagem e criação de backup real no Drive da conta de teste; sincronização repetida confirmou que não duplica uma cópia idêntica. Testes unitários cobrem o adaptador, erros e decisões de conflito.

**Ainda falta:** validar restauração e conflito entre dois dispositivos reais, confirmar que o consentimento OAuth está disponível ao público e decidir se a recuperação de versões antigas precisa de uma interface própria.

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

## 3. Análise de refeições por foto

**Implementação local em revisão:** chave Gemini informada pela pessoa, tutorial do Google AI Studio, foto reduzida no navegador, JSON de alimentos e calorias, revisão e salvamento normal. Foto e chave ficam fora do backup e do Drive. Falhas da IA preservam o cadastro manual.

**Plano mensal em revisão local:** login Google obrigatório para assinar, checkout do Asaas com dados de cobrança coletados lá, webhook, cancelamento e cota de dez análises por dia. O app não pede CPF nem código de assinatura. A chave do projeto fica no Secrets Manager. Antes de publicar, testar checkout, confirmação, renovação, cota, reembolso e cancelamento no sandbox, além de fotos em iPhone e Android e conexão lenta. O repositório permanece privado.
