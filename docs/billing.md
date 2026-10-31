# Assinatura e webhook do Asaas

**Estado:** implementação em revisão local. A cobrança só deve ser publicada após homologação completa no sandbox do Asaas.

## Fluxo

1. A pessoa conecta uma conta Google. O backend valida o token com o Google, confere o OAuth Client ID e usa um hash do identificador estável da conta como chave. Não pede CPF nem cria código de acesso.
2. O backend cria um checkout recorrente de R$ 8,99/mês no Asaas. CPF e cartão são informados na página do Asaas e não passam pela Biorotina.
3. O webhook autenticado confirma o pagamento. A URL de retorno do navegador serve apenas para voltar ao app; não libera o plano.
4. Pagamentos confirmados estendem o acesso. Cada conta Google pode ter um plano com renovação ativa e até dez análises de refeições por foto por dia, no fuso de São Paulo.
5. Cancelar no app chama `DELETE /v3/subscriptions/{id}` no Asaas, encerra futuras renovações e mantém o acesso até o fim do período pago.
6. Antes da assinatura, cada conta Google pode fazer até cinco análises grátis, uma única vez por conta, fora da campanha descrita abaixo. Em novembro de 2026, a primeira solicitação de análise inicia um teste de 14 dias com até cinco análises por dia. O backend reserva cada análise de forma atômica e devolve a cota se a análise falhar. A chave Gemini pessoal não usa essa cota.

## Controle do teste grátis

O teste grátis fica habilitado por padrão. Para interrompê-lo, grave o item `CONFIG#PHOTO_TRIAL` na tabela DynamoDB `BillingTable` com o atributo `data` igual a `{"enabled":false}`. Para reativar, use `{"enabled":true}` ou remova o item. O backend consulta essa configuração ao mostrar a opção e antes de reservar cada análise. A contagem vitalícia fica no item `TRIAL#<identificador derivado da conta>`; não há foto ou resultado nesse item. Não apague os itens de contagem ao desligar o recurso.

## Campanha de novembro de 2026

Adesões de **01/11/2026 00:00 a 01/12/2026 00:00 (fim exclusivo)** no
fuso de São Paulo. A campanha inclui contas antigas, mesmo com as cinco
análises vitalícias já consumidas. A primeira solicitação válida à análise
inicia **14 × 24 horas**; consultar a oferta ou conectar a conta não inicia o
prazo. Uma falha devolve a cota diária, mas não reinicia o prazo já iniciado.
Cada dia permite cinco análises concluídas, compartilhadas entre foto e
descrição; a cota renova à meia-noite de São Paulo. Dias não usados não
acumulam. Participações iniciadas no fim de novembro continuam em dezembro até
o vencimento individual. Contas pagantes seguem com dez análises por dia.

A participação é criada condicionalmente em
`TRIAL_CAMPAIGN#november-2026#<conta>`, com início, vencimento e limites da
oferta. Ela não tem TTL: sua remoção permitiria reiniciar o teste. Contadores
atômicos ficam em `TRIAL_DAILY#november-2026#<conta>#<dia>`, com TTL após o fim
do teste mais três dias. A cota antiga `TRIAL#<conta>` é preservada e não
limita a campanha. Uma participação vencida não é renovada nem retorna à cota
antiga. Contas sem participação fora da janela mantêm o teste antigo.

`CONFIG#PHOTO_TRIAL.data` aceita, além de `enabled`, um objeto `campaign`:

```json
{
  "enabled": true,
  "campaign": {
    "startsAt": "2026-11-01T03:00:00Z",
    "endsAt": "2026-12-01T03:00:00Z",
    "days": 14,
    "dailyLimit": 5
  }
}
```

Sem `campaign`, usam-se os valores acima. `campaign: null` suspende novas
adesões à campanha, preservando participações já iniciadas. `enabled: false`
interrompe todo teste grátis, inclusive participações existentes, sem apagar
seus prazos. Alterar a oferta não encurta nem amplia participações já
concedidas. Configuração inválida impede novas adesões; `days` aceita 1–90 e
`dailyLimit`, 1–10. O ID desta campanha é fixo: uma campanha futura precisa de
outro ID, sem reaproveitar ou apagar participações antigas.

## Comunicação do acesso gratuito

A página inicial sem registros apresenta o diário manual gratuito e direciona
para o teste opcional de IA. Refeições consulta a oferta pública mesmo antes do
login e oferece entrada com Google junto do prazo e limite vigentes. A API
pública retorna `trialEnabled`, `trialPeriodDays` e `trialLimit`, sem iniciar
participação nem depender de uma conta; fora de novembro, a comunicação mantém
a oferta vitalícia antiga, sem anunciar 14 dias indevidamente.

Depois do login, saldo e vencimento vêm do estado da conta. A tela de assinatura
mostra o acesso atual antes da oferta paga e distingue teste disponível,
limite diário atingido e período encerrado. Os avisos explicam que o teste não
exige cartão, não vira assinatura automaticamente e que o diário manual continua
gratuito. A chave pessoal Gemini fica em opções avançadas, fora do percurso
principal. O fim da cota/período oferece continuação manual gratuita e acesso
opcional ao plano.

## Consumo e custo da IA

Cada tentativa enviada pelo backend ao Gemini tem um registro próprio
`AI_CALL#<AAAA-MM UTC>#<UUID>` na BillingTable, com retenção por TTL de 400 dias.
Guarda identificador derivado da conta, solicitação, tentativa, modelo,
trial/plano, tipo de entrada (foto/descrição), horário, duração, estado,
HTTP status e `usageMetadata`: tokens de entrada, cache, saída e pensamento.
Não guarda foto, descrição enviada, resposta gerada, nome, e-mail ou chave.
A política de privacidade descreve essa contabilização operacional.

O registro `pending` é gravado **antes** da chamada. Se essa gravação falhar,
a IA não é chamada e a cota é devolvida. A conclusão atualiza a mesma chave;
se falhar ou a execução for interrompida, o registro pendente permanece como
custo desconhecido. Essa falha não provoca reenvio ao Google. Gravações têm
limite de dois segundos e não reutilizam a cota como contabilidade financeira.
Novas tentativas e fallback Pro geram registros adicionais ligados à mesma
solicitação. Análises sem resultado aproveitável também guardam consumo quando
o provedor o informa, mesmo com devolução da cota.

O custo estimado usa inteiros em **nanodólares** (1 USD = 1.000.000.000), com
versão e preços aplicados salvos em cada registro. Soma entrada não armazenada
em cache, entrada em cache e saída mais pensamento, evitando contar cache duas
vezes. Preços da modalidade Standard da
[Gemini Developer API](https://ai.google.dev/gemini-api/docs/pricing), conferidos
em 31/10/2026: Flash 3.8 com entrada/saída/cache de US$ 0,75/3,75/0,075 por
milhão até 31/12/2026 e US$ 1,50/7,50/0,15 a partir de 01/01/2027 UTC;
Pro 3.1 Preview com US$ 2/12/0,20 até 200 mil tokens de entrada e
US$ 4/18/0,40 acima. Modelos desconhecidos ou consumo ausente/incompleto ficam
com custo desconhecido, nunca zero automático.

Balanço mensal (requer AWS CLI com leitura da BillingTable e CloudFormation):

```sh
AWS_PROFILE=biorotina AWS_REGION=sa-east-1 npm run report-ai-costs -- 2026-11
```

Retorna total conhecido em USD, chamadas, solicitações, contas com chamadas,
média por conta ativa e por chamada, divisão por modelo e trial/plano, e
contagens sem custo/pendentes. A lista por conta usa um alias derivado, sem
exibir a chave interna. O relatório pagina uma varredura da tabela com projeção
e filtro de prefixo: não retorna outros dados de cobrança, mas a leitura é
proporcional à tabela. Para grande volume, migrar para tabela/index dedicado.
A leitura de um mês ainda em andamento não é um snapshot transacional.

As médias são **parciais** quando há custos desconhecidos. São estimativas de
lista, não a fatura: não incluem créditos, descontos, impostos, câmbio nem AWS.
Não incluem chamadas feitas diretamente com a chave pessoal do usuário, nem
recuperam chamadas anteriores à implantação. A média por conta considera quem
fez chamadas no período, não o total de contas cadastradas.

## Proteção contra análises sem resultado

Além da cota de análises concluídas, cada conta Google tem no máximo **cinco análises sem sugestão aproveitável por dia**, tanto no teste grátis quanto no plano, no fuso de São Paulo. A API reserva essa vaga de forma atômica **antes** de chamar o Gemini, impedindo que chamadas paralelas ignorem o limite. Um resultado válido libera a vaga; uma resposta sem alimento ou outro retorno inutilizável a mantém até o dia seguinte. Erros de rede/indisponibilidade do Gemini e imagens rejeitadas antes da análise liberam a vaga, para não atribuir a falha ao usuário. A cota de análises concluídas continua sendo devolvida quando a análise falha.

Ao atingir o limite, a API responde 429 antes de enviar outra foto ao Gemini e informa que o registro manual continua disponível. Uma foto sem refeição recebe 422 com mensagem específica, em vez de 503 genérico. A contagem diária fica em `AI_FAILURE#<identificador derivado da conta>#<data>` com expiração; não contém foto nem resposta da IA. Esse limite por conta reduz custo acidental, mas não substitui proteção contra múltiplas contas ou tráfego anômalo no API Gateway/WAF.

## Configuração automática de produção

O GitHub Actions, após implantar o backend, executa `scripts/configure-billing.mjs`. Ele lê `ASAAS_API_KEY` e `GEMINI_API_KEY` dos secrets do repositório, grava as duas chaves em um segredo do AWS Secrets Manager e cria/atualiza o webhook no Asaas. O token do webhook é gerado pela AWS em outro segredo e enviado ao campo `authToken`. Nenhum valor é gravado no Git, no bundle do navegador ou nos logs do CI.

O webhook configurado automaticamente usa:

- **Nome:** Biorotina assinatura IA
- **URL:** `https://api.biorotina.app.br/api/billing/webhook`
- **Versão:** 3
- **Envio:** sequencial
- **Eventos:** `CHECKOUT_PAID`, `CHECKOUT_CANCELED`, `CHECKOUT_EXPIRED`, `SUBSCRIPTION_CREATED`, `SUBSCRIPTION_UPDATED`, `SUBSCRIPTION_INACTIVATED`, `SUBSCRIPTION_DELETED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`.

O `authToken` é diferente da chave de API do Asaas. Ele chega em `asaas-access-token`; a Lambda compara com o segredo antes de processar qualquer evento e responde 401 quando estiver ausente ou incorreto. Eventos processados são identificados pelo `id` para tolerar reenvios.

## Falha durante a criação do checkout

Antes de chamar o Asaas, a API grava `CHECKOUT_ATTEMPT#<externalReference>` na
tabela de cobrança com a chave derivada da conta, estado `requested` e expiração
em 14 dias. Depois de receber um identificador válido, grava **conta,
mapeamento do checkout e estado `created` em uma única transação**. O link só é
devolvido quando essa transação termina. Falha de rede ou de gravação após a
chamada externa mantém por uma hora o bloqueio contra nova criação e gera o
código de log `outcome_needs_reconciliation`; a próxima tentativa reutiliza
um checkout que tenha sido salvo com sucesso. `requested` não prova que o
checkout existe no Asaas, e nenhuma tentativa concede acesso ao plano.

Para investigar esse código, consultar as tentativas recentes na tabela e
localizar `externalReference` no Asaas, sem publicar identificadores ou
respostas de pagamento nos logs. Se não houver checkout confirmado localmente,
deixar o bloqueio expirar; o checkout externo sem link entregue à pessoa expira
em uma hora. Caso tenha havido pagamento, conferir no Asaas e reconciliar pelo
webhook e pela cobrança confirmada, nunca marcar o plano como pago com base
apenas no retorno do navegador ou na tentativa registrada.

## Conferência no painel

Após o deploy, abrir **Menu do usuário → Integrações → Webhooks**, localizar **Biorotina assinatura IA** e conferir URL, eventos e estado ativo. Em **Integrações → Logs de Webhooks**, verificar as respostas HTTP. Não criar uma segunda configuração para a mesma URL. As configurações de sandbox e produção são independentes.

Se for preciso configurar manualmente, primeiro obtenha o valor do segredo `BillingWebhookTokenArn` no Secrets Manager da stack `biorotina-dev`, sem enviá-lo por chat ou gravá-lo em arquivo versionado. Na tela **Criar Webhook**, preencha os campos acima e coloque exatamente esse valor em **Auth Token**. Um token gerado no painel sem atualizar o segredo da AWS será recusado pela Lambda. O Asaas exige token forte de 32 a 255 caracteres, sem espaços ou sequências previsíveis. Nunca use `ASAAS_API_KEY` nesse campo.

## Homologação antes de publicar

Testar no sandbox, com segredos e webhook separados: checkout, pagamento confirmado, retorno ao app, renovação, reembolso/chargeback, limite diário, cancelamento e tentativa de webhook sem token. Conferir que chamadas sem autenticação retornam 401 e que um evento repetido não duplica benefícios. Não usar chave de produção nem executar uma cobrança real para testar.

Referências: [checkout recorrente](https://docs.asaas.com/docs/checkout-com-assinatura-recorrente), [criação de webhook](https://docs.asaas.com/docs/criar-novo-webhook-pela-aplicacao-web), [recebimento e autenticação](https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook), [eventos de pagamento](https://docs.asaas.com/docs/payment-events) e [cancelamento](https://docs.asaas.com/reference/remove-subscription).
