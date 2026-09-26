# Validação de contratos de dados

A Biorotina valida todo dado que cruza uma fronteira de confiança. O objetivo é
recusar formatos desconhecidos antes que cheguem ao armazenamento, à interface
ou à lógica de lembretes e cobrança.

## Formatos cobertos

- **Dados persistidos e backup importado:** `appDataSchema` valida o formato
  atual; `parseBackup` aceita apenas as versões 1 a 6 e migra as versões
  conhecidas antes de devolver dados para o app.
- **Respostas da IA:** `analysisSchema` limita a descrição, os alimentos e as
  calorias recebidas do Gemini ou do simulador local.
- **Respostas de cobrança:** `planStatusSchema` valida o estado do plano,
  contadores, datas e link de checkout antes de renderizar a assinatura.
- **Serviços Rust:** os modelos de requisições e respostas são desserializados
  por tipos estritos e permanecem cobertos pela suíte `cargo test` da API,
  autenticação, cobrança, telemetria e lembretes.

## CI

O comando `npm run test:schemas` executa testes de contrato isolados. A etapa
**validate_schemas** do CI roda esse comando em cada mudança do frontend ou da
configuração compartilhada. Os testes confirmam exemplos válidos, valores
inválidos, campos extras e a migração do formato persistido legado.

Ao criar uma nova fronteira de dados, inclua um schema explícito, um exemplo
válido e pelo menos um caso inválido neste conjunto de testes.
