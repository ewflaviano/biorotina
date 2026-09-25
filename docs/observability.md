# Diagnóstico de erros

As quatro funções Lambda (`api`, `billingApi`, `tick` e `telemetry`) escrevem
eventos JSON de erro em stderr/CloudWatch. A retenção configurada é de 14 dias.
Os campos estáveis (`kind`, `service`, `operation` ou `source`, `code`, `screen`,
`environment`, `status`) permitem filtros, métricas e integração posterior por
assinatura dos log groups. Não registrar payloads, mensagens de exceção, stack traces, URLs,
fotos, resultados de IA, identificadores de contas, tokens ou chaves.

No envio de feedback, o log `operation=feedback` distingue configuração ausente,
montagem da mensagem, tempo esgotado, falha de rede, resposta inválida e os
códigos conhecidos do Amazon SES (acesso negado, identidade não verificada,
mensagem rejeitada, limite, suspensão). `status` é a resposta da Biorotina e
`upstream_status` é o HTTP do SES quando ele respondeu. Códigos desconhecidos
viram `email_service_unclassified`: nunca copiar para o log a mensagem bruta
do SDK, que pode incluir endereços ou partes da solicitação. A presença de
`email_service_unclassified` pede ampliar a classificação após investigação,
sem afrouxar essa regra de privacidade.
Quando o SES retorna 403, somente frases fixas da explicação de IAM são
classificadas para distinguir role, limite de permissões, política do recurso
e SCP; nomes de roles, ARNs e endereços não entram no evento.

Após a pessoa ativar métricas e diagnósticos, o app pode enviar `POST /api/telemetry/error` sem autenticação para captar inclusive
falhas antes do login. O esquema aceita apenas enums predefinidos e status HTTP;
`operation` identifica a etapa técnica fixa (por exemplo, `drive_list`,
`drive_upload`, `billing_status` ou `feedback_send`), sem receber texto da
página ou do erro. Clientes antigos sem esse campo continuam aceitos durante
a atualização; as versões novas sempre o enviam.
campos extras e corpos acima de 512 bytes são recusados. A tela é reduzida a
uma lista fixa, sem query string. O cliente deduplica por um minuto, limita a
20 eventos por sessão e descarta falhas do próprio envio, sem fila local. O envio
respeita a mesma preferência de métricas em Configurações; sem uma escolha ou com `declined`, nada
é enviado pelo cliente. O diagnóstico é de melhor esforço: falhas offline ou antes de o JavaScript
iniciar não chegam ao servidor. CORS limita navegadores conhecidos, mas não é
controle de abuso contra clientes automatizados. O API Gateway limita a taxa
agregada da rota pública de diagnóstico (2 requisições/s, rajada de 10); isso
não substitui um controle por origem ou WAF se houver abuso distribuído. A rota
pública de criação de avisos tem limite agregado de 5 requisições/s (rajada de
10) e até 30 novas inscrições por dia por origem. Para esse último limite, a
API usa o endereço recebido do próprio API Gateway, grava somente um
pseudônimo diário derivado com segredo e marca o contador para expirar em três
dias (a exclusão física é assíncrona).
O endereço não entra nos registros do aplicativo.

No Drive, `drive_reconnect_required` identifica a expiração ou falha de
renovação do acesso Google; `drive_sync_failed` fica para as demais falhas de
sincronização. Ambos são códigos fixos, sem e-mail, token, registros ou mensagem
de erro, e só são enviados após consentimento. Para falhas HTTP do Drive que
não sejam 401, `status` registra apenas o número da resposta; `operation`
mostra se a falha ocorreu ao listar, baixar ou enviar o backup. Não é um log
de sucesso: ausência de evento não comprova sincronização concluída.

Para investigar erros de análise, consultar o grupo
`/aws/lambda/biorotina-dev-billingApi` e filtrar por `operation=analyze`.
`gemini_status` inclui somente o código HTTP do upstream; `gemini_timeout` separa
o tempo esgotado de outras falhas de rede. `gemini_retry_503` e
`gemini_retry_recovered` são avisos que identificam uma tentativa repetida e sua
recuperação. Após resposta HTTP 200, os códigos distinguem ausência de candidato,
bloqueio de segurança, limite de tokens, texto ausente, JSON inválido ou campos
incompatíveis com o formato esperado, descrição vazia, lista vazia ou grande demais, nome ou porção
vazios e calorias inválidas (`gemini_no_candidate`, `gemini_safety_blocked`,
`gemini_max_tokens`, `gemini_missing_text`, `gemini_json_syntax`,
`gemini_json_shape`, `gemini_description_shape`, `gemini_foods_shape`,
`gemini_food_name_shape`, `gemini_food_amount_shape`, `gemini_calories_shape`,
`gemini_empty_description`, `gemini_empty_foods`,
`gemini_too_many_foods`, `gemini_empty_food_name`, `gemini_empty_food_amount`,
`gemini_invalid_calories`). Nunca registrar o conteúdo retornado pelo Gemini.
Para assinantes, um segundo 503 do Flash pode iniciar uma única tentativa com
`gemini-3.1-pro-preview`: `gemini_fallback_pro` e
`gemini_fallback_pro_recovered` indicam início e recuperação; `gemini_pro_status`,
`gemini_pro_timeout` e `gemini_pro_network` identificam falhas nesse modelo.
Os demais grupos são
`biorotina-dev-api`, `biorotina-dev-tick` e `biorotina-dev-telemetry` com o
prefixo `/aws/lambda/`.

Antes de integrar uma plataforma de observabilidade, aplicar nela a mesma
lista de campos permitidos e evitar exportar logs brutos da plataforma AWS.
