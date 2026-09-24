# Diagnóstico de erros

As quatro funções Lambda (`api`, `billingApi`, `tick` e `telemetry`) escrevem
eventos JSON de erro em stderr/CloudWatch. A retenção configurada é de 14 dias.
Os campos estáveis (`kind`, `service`, `operation` ou `source`, `code`, `screen`,
`environment`, `status`) permitem filtros, métricas e integração posterior por
assinatura dos log groups. Não registrar payloads, mensagens de exceção, stack traces, URLs,
fotos, resultados de IA, identificadores de contas, tokens ou chaves.

O app envia `POST /api/telemetry/error` sem autenticação para captar inclusive
falhas antes do login. O esquema aceita apenas enums predefinidos e status HTTP;
campos extras e corpos acima de 512 bytes são recusados. A tela é reduzida a
uma lista fixa, sem query string. O cliente deduplica por um minuto, limita a
20 eventos por sessão e descarta falhas do próprio envio, sem fila local. O envio
respeita a mesma preferência de métricas em Configurações; com `declined`, nada
é enviado pelo cliente. O diagnóstico é de melhor esforço: falhas offline ou antes de o JavaScript
iniciar não chegam ao servidor. CORS limita navegadores conhecidos, mas não é
controle de abuso contra clientes automatizados; se necessário, adicionar WAF
ou throttling no API Gateway antes de ampliar tráfego.

Para investigar erros de análise, consultar o grupo
`/aws/lambda/biorotina-dev-billingApi` e filtrar por
`kind=application_error`, `operation=analyze`. `gemini_status` inclui somente
o código HTTP do upstream; `gemini_missing_text`, `gemini_invalid_json` e
`gemini_invalid_suggestion` distinguem falhas após resposta HTTP 200. Nunca
registrar o conteúdo retornado pelo Gemini. Os demais grupos são
`biorotina-dev-api`, `biorotina-dev-tick` e `biorotina-dev-telemetry` com o
prefixo `/aws/lambda/`.

Antes de integrar uma plataforma de observabilidade, aplicar nela a mesma
lista de campos permitidos e evitar exportar logs brutos da plataforma AWS.
