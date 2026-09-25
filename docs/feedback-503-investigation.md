# Investigação do 503 no feedback (25/09/2026)

O formulário de feedback foi retirado do site temporariamente. A página mostra
o endereço de contato e o copia ao toque. O endpoint `/api/feedback` permanece
no backend para investigação, mas não é chamado pelo site.

## Evidências

- Um envio SES v2 com o perfil administrativo `biorotina`, na região
  `sa-east-1`, foi aceito e o e-mail chegou ao destinatário.
- A função `biorotina-dev-api` retornou 503; o log estruturado registrou
  `operation=feedback`, `code=email_access_denied` e `upstream_status=403`.
- Remetente e destinatário configurados na função foram verificados no SES;
  a conta estava saudável e habilitada para envio, embora ainda no sandbox.
- A função usa a role `biorotina-dev-push-api-execution`. A simulação IAM
  permitiu `ses:SendEmail` para a identidade do remetente quando o contexto
  `ses:Recipients` foi informado.
- Em teste controlado, a condição de destinatário foi removida tanto do
  permissions boundary quanto da política da role. A simulação IAM passou
  mesmo sem contexto, mas o envio real da função continuou retornando 403.
  Isso **não** confirma a condição como causa; ambas as políticas foram
  restauradas ao estado mais restrito.
- Falhas de envio consumiam a cota de cinco mensagens. Esse defeito foi
  corrigido: agora a cota conta apenas envios aceitos, com teto separado de
  tentativas por dia.

## Próximas verificações

1. Confirmar no runtime da função qual região e qual identidade AWS o SDK SES
   está usando, por comparação com valores esperados e sem registrar credenciais.
2. Classificar o recurso efetivo negado pelo SES sem persistir a mensagem bruta
   do erro, que pode conter ARNs e endereços.
3. Verificar a autorização de envio da identidade e, se necessário, comparar
   uma chamada SES v2 feita com as credenciais da função em ambiente controlado.
4. Só recolocar o formulário depois de um envio pelo endpoint público retornar
   200 e o e-mail de teste chegar, sem gastar a cota em respostas 503.
