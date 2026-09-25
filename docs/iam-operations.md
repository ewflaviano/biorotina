# Permissões das funções e implantação

O stack separado `biorotina-github-deploy` publica a política
`biorotina-lambda-execution-boundary`. Ela limita as funções da Biorotina a logs
do app, tabelas e segredos do serviço, à fila de faturamento e à invocação do
agendamento. Cada função ainda precisa de sua própria política mais restrita:

| Função | Recursos necessários |
| --- | --- |
| `api` | Tabela de avisos, segredo VAPID e envio SES restrito ao remetente e destinatário do feedback |
| `tick` | Tabela de avisos, segredo VAPID e invocação pelo Scheduler |
| `telemetry` | Apenas o próprio grupo de logs |
| `billingApi` | Tabela e segredos de faturamento; envio à fila |
| `billingWorker` | Tabela e segredos de faturamento; consumo da fila |

O stack de implantação deve existir **antes** de atualizar `biorotina-dev`, pois
as funções importam o ARN da política de limite. O recurso foi criado no stack
separado, sem alterar inicialmente a política da role do GitHub. Após implantar
as funções novas, conferir que cada uma usa a role dedicada, que a role antiga
compartilhada foi removida e que os cinco fluxos continuam operando. Só então
restringir a role de implantação a essas roles protegidas.

Ao implantar o formulário de feedback, atualizar **primeiro** o stack separado
`biorotina-github-deploy` com este template para adicionar `ses:SendEmail` à
política de limite. A role `PushApiExecutionRole` recebe a mesma permissão
restrita no `serverless.yml`. Sem as duas alterações, o endpoint não consegue
encaminhar as mensagens. O envio não requer permissões SES das demais funções.
O erro 503 do formulário ainda está em investigação: remover temporariamente
a condição de destinatário das duas políticas não resolveu o 403 do SES.
Portanto, a restrição foi restaurada enquanto o formulário fica fora do site.

Para verificar, consultar `lambda get-function-configuration` para cada função,
`iam get-role` para o limite de permissões e o estado do Scheduler e da fila.
Nenhum teste deve provocar cobrança real nem alterar dados de usuários.

Depois da migração, a role do GitHub só pode criar as roles de execução aprovadas
se tiverem a política de limite; só pode alterar essas roles e
passá-las ao Lambda ou ao Scheduler. Ela não pode alterar a si mesma nem remover
o limite. Uma função nova exigirá atualização explícita dessa lista e revisão
das permissões antes do deploy. A política gerenciada `PowerUserAccess` ainda
permite administrar recursos não IAM do projeto e deve ser reduzida em uma
etapa separada; a limitação acima elimina a escalada IAM direta identificada
na auditoria, não todo o risco de comprometimento da pipeline.
