# Assinatura e webhook do Asaas

**Estado:** implementação em revisão local. A cobrança só deve ser publicada após homologação completa no sandbox do Asaas.

## Fluxo

1. A pessoa conecta uma conta Google. O backend valida o token com o Google, confere o OAuth Client ID e usa um hash do identificador estável da conta como chave. Não pede CPF nem cria código de acesso.
2. O backend cria um checkout recorrente de R$ 8,99/mês no Asaas. CPF e cartão são informados na página do Asaas e não passam pela Biorotina.
3. O webhook autenticado confirma o pagamento. A URL de retorno do navegador serve apenas para voltar ao app; não libera o plano.
4. Pagamentos confirmados estendem o acesso. Cada conta Google pode ter um plano com renovação ativa e até dez análises de refeições por foto por dia, no fuso de São Paulo.
5. Cancelar no app chama `DELETE /v3/subscriptions/{id}` no Asaas, encerra futuras renovações e mantém o acesso até o fim do período pago.
6. Antes da assinatura, cada conta Google pode fazer até cinco análises grátis, uma única vez por conta. O backend reserva cada análise de forma atômica e devolve a cota se a análise falhar. A chave Gemini pessoal não usa essa cota.

## Controle do teste grátis

O teste grátis fica habilitado por padrão. Para interrompê-lo, grave o item `CONFIG#PHOTO_TRIAL` na tabela DynamoDB `BillingTable` com o atributo `data` igual a `{"enabled":false}`. Para reativar, use `{"enabled":true}` ou remova o item. O backend consulta essa configuração ao mostrar a opção e antes de reservar cada análise. A contagem vitalícia fica no item `TRIAL#<identificador derivado da conta>`; não há foto ou resultado nesse item. Não apague os itens de contagem ao desligar o recurso.

## Configuração automática de produção

O GitHub Actions, após implantar o backend, executa `scripts/configure-billing.mjs`. Ele lê `ASAAS_API_KEY` e `GEMINI_API_KEY` dos secrets do repositório, grava as duas chaves em um segredo do AWS Secrets Manager e cria/atualiza o webhook no Asaas. O token do webhook é gerado pela AWS em outro segredo e enviado ao campo `authToken`. Nenhum valor é gravado no Git, no bundle do navegador ou nos logs do CI.

O webhook configurado automaticamente usa:

- **Nome:** Biorotina assinatura IA
- **URL:** `https://api.biorotina.app.br/api/billing/webhook`
- **Versão:** 3
- **Envio:** sequencial
- **Eventos:** `CHECKOUT_PAID`, `CHECKOUT_CANCELED`, `CHECKOUT_EXPIRED`, `SUBSCRIPTION_CREATED`, `SUBSCRIPTION_UPDATED`, `SUBSCRIPTION_INACTIVATED`, `SUBSCRIPTION_DELETED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`.

O `authToken` é diferente da chave de API do Asaas. Ele chega em `asaas-access-token`; a Lambda compara com o segredo antes de processar qualquer evento e responde 401 quando estiver ausente ou incorreto. Eventos processados são identificados pelo `id` para tolerar reenvios.

## Conferência no painel

Após o deploy, abrir **Menu do usuário → Integrações → Webhooks**, localizar **Biorotina assinatura IA** e conferir URL, eventos e estado ativo. Em **Integrações → Logs de Webhooks**, verificar as respostas HTTP. Não criar uma segunda configuração para a mesma URL. As configurações de sandbox e produção são independentes.

Se for preciso configurar manualmente, primeiro obtenha o valor do segredo `BillingWebhookTokenArn` no Secrets Manager da stack `biorotina-dev`, sem enviá-lo por chat ou gravá-lo em arquivo versionado. Na tela **Criar Webhook**, preencha os campos acima e coloque exatamente esse valor em **Auth Token**. Um token gerado no painel sem atualizar o segredo da AWS será recusado pela Lambda. O Asaas exige token forte de 32 a 255 caracteres, sem espaços ou sequências previsíveis. Nunca use `ASAAS_API_KEY` nesse campo.

## Homologação antes de publicar

Testar no sandbox, com segredos e webhook separados: checkout, pagamento confirmado, retorno ao app, renovação, reembolso/chargeback, limite diário, cancelamento e tentativa de webhook sem token. Conferir que chamadas sem autenticação retornam 401 e que um evento repetido não duplica benefícios. Não usar chave de produção nem executar uma cobrança real para testar.

Referências: [checkout recorrente](https://docs.asaas.com/docs/checkout-com-assinatura-recorrente), [criação de webhook](https://docs.asaas.com/docs/criar-novo-webhook-pela-aplicacao-web), [recebimento e autenticação](https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook), [eventos de pagamento](https://docs.asaas.com/docs/payment-events) e [cancelamento](https://docs.asaas.com/reference/remove-subscription).
