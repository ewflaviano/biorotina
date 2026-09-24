# Operação dos eventos de assinatura

O endpoint `/api/billing/webhook` autentica o evento do Asaas, guarda apenas os campos necessários na fila FIFO de faturamento e responde HTTP 200 depois da confirmação do SQS. A função `billingWorker` processa um evento por vez **por cliente**, preservando a ordem quando o Asaas fornece seu identificador; clientes diferentes podem avançar independentemente. Uma falha é tentada novamente até cinco vezes; depois o evento vai para a fila de mensagens não processadas (DLQ). Isso evita que um checkout órfão bloqueie os pagamentos de outras pessoas na fila sequencial do Asaas.

## Verificação após a implantação

1. Confirmar que o stack criou `biorotina-dev-billing-events.fifo`, `biorotina-dev-billing-dlq.fifo`, `billingWorker` e o alarme `BillingEventsDlqAlarm`.
2. Confirmar que a fila do Asaas continua ativa e que o webhook recebeu HTTP 200. **Não** remover penalidade nem reenviar eventos antes de corrigir a causa da falha.
3. Monitorar o alarme da DLQ, os erros do `billingWorker` e o número de mensagens antigas na fila principal. O alarme atual aparece no CloudWatch, mas ainda requer um canal de notificação operacional antes do beta público.

## Se houver evento na DLQ

1. Consultar o `id` e o tipo do evento, sem copiar dados de pagamento para tickets ou logs. Os eventos guardados não incluem e-mail, nome, endereço, telefone ou foto.
2. Conferir o checkout e a assinatura no Asaas e o mapeamento correspondente no DynamoDB. Um `CHECKOUT_PAID` sem mapeamento exige conciliação humana antes de conceder acesso; **não** conceder plano apenas com base no webhook ou no redirecionamento do navegador.
3. Corrigir o mapeamento ou a causa da falha e só então reenviar o evento da DLQ para a fila principal. Confirmar que o registro de pagamento e o período pago foram aplicados uma única vez.
4. Confirmar que o alarme voltou ao estado normal e registrar apenas IDs técnicos e horários no relatório de incidente.

As mensagens da fila principal expiram em quatro dias; a DLQ retém por 14 dias. A retenção da DLQ na remoção da stack impede a perda acidental imediata, mas não substitui a conciliação periódica dos pagamentos no Asaas.
