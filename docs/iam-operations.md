# Permissões das funções e implantação

O stack separado `biorotina-github-deploy` publica a política
`biorotina-lambda-execution-boundary`. Ela limita as funções da Biorotina a logs
do app, tabelas e segredos do serviço, à fila de faturamento e à invocação do
agendamento. Cada função ainda precisa de sua própria política mais restrita:

| Função | Recursos necessários |
| --- | --- |
| `api` | Tabela de avisos e segredo VAPID |
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

Para verificar, consultar `lambda get-function-configuration` para cada função,
`iam get-role` para o limite de permissões e o estado do Scheduler e da fila.
Nenhum teste deve provocar cobrança real nem alterar dados de usuários.
