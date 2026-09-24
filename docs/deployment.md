# Implantação da Biorotina

## Infraestrutura

O `serverless.yml` cria APIs HTTP em Axum, três Lambdas Rust (avisos, envio periódico e assinatura/IA), o agendamento a cada cinco minutos, tabelas DynamoDB separadas para Web Push e assinatura, segredos no Secrets Manager, um bucket S3 privado e uma distribuição CloudFront. A pilha fica em `sa-east-1`. CloudFront e Route 53 são serviços globais; o certificado do site precisa estar em `us-east-1` por exigência do CloudFront. O certificado de `api.biorotina.app.br` fica em `sa-east-1`.

O serviço de avisos recebe inscrição técnica do navegador, horários e fuso; não recebe nome, dose, peso, alimentação ou histórico. O token de administração fica no navegador e só seu hash fica no DynamoDB. A inscrição expira após 180 dias sem atualização. O serviço de assinatura recebe o token Google para identificar a conta, guarda apenas seu identificador derivado, estado da assinatura e contagem diária e processa fotos reduzidas sem persistir a imagem. CPF e cartão são informados no checkout externo. Segredos VAPID, Asaas e Gemini ficam na AWS e nunca entram no código ou no build do site.

## DNS e certificados

A zona pública Route 53 `biorotina.app.br` é `Z02497163GOJPTP9ASUEW`. No Registro.br, usar os quatro NS da zona:

```text
ns-988.awsdns-59.net
ns-1596.awsdns-07.co.uk
ns-1230.awsdns-25.org
ns-441.awsdns-55.com
```

Os registros CNAME de validação dos certificados ACM já foram criados nessa zona. Os dois certificados estão emitidos, e a variável do repositório `ENABLE_CUSTOM_DOMAIN=true` está configurada. O Serverless associa `biorotina.app.br` à distribuição CloudFront, cria `api.biorotina.app.br` no API Gateway e os respectivos registros Alias na zona Route 53.

## Implantação local

Requer Node.js, Rust, AWS CLI com profile `biorotina` e Cargo Lambda. `npm ci` instala também o Zig usado no build da Lambda.

```sh
npm ci
make check
make deploy
```

`make deploy` usa o profile `biorotina` e a região `sa-east-1`. O domínio personalizado está habilitado por padrão.

Para habilitar o plano de IA após um deploy local, execute `make configure-billing` com `ASAAS_API_KEY` e `GEMINI_API_KEY` definidos apenas no ambiente do processo. Esse passo não faz parte de `make deploy` para que a implantação local não altere a configuração de cobrança sem intenção. No CI, a configuração é automática após a implantação do backend.

Para compilar o frontend para a infraestrutura existente, obtenha a saída `PushApiUrl` da pilha `biorotina-dev`, use-a como `VITE_PUSH_API_URL` em `npm run build` e publique `dist/` no bucket indicado por `FrontendBucketName`. O fluxo do GitHub Actions faz essas etapas e invalida o cache do CloudFront automaticamente.

## GitHub Actions

O workflow `.github/workflows/ci.yml` identifica as áreas alteradas. Em todo pull request para `master`, ele verifica a seleção de mudanças e procura padrões conhecidos de credenciais; mudanças na interface executam testes do frontend e mudanças em `push/` ou `serverless.yml` executam testes do backend. Arquivos compartilhados, como dependências e o próprio workflow, acionam ambos; mudanças só de documentação não publicam o app, exceto `docs/tokens.css`, importado pela interface. Pull requests não recebem credenciais AWS e não fazem deploy. Em push/merge em `master`, a implantação do backend só começa após todas as validações aplicáveis; quando ambos mudam, o frontend espera a infraestrutura. O acesso AWS usa OpenID Connect com a role `biorotina-github-deploy`; não existe AWS access key no GitHub nem no código. A política de confiança limita o acesso ao repositório `ewflaviano/biorotina` na branch `master`.

A branch `master` está protegida: mudanças exigem pull request, os checks `changes`, `validate_frontend` e `validate_backend` precisam terminar com sucesso e conversas de revisão precisam ser resolvidas. Os jobs de validação de áreas não alteradas são pulados pelo workflow; o GitHub considera esse estado suficiente para um check exigido. Não há exigência de segunda aprovação enquanto o projeto tiver um único mantenedor.

O projeto usa Serverless Framework v3, que implanta pela role AWS sem uma chave adicional do Serverless Dashboard. A variável pública `AWS_DEPLOY_ROLE_ARN` aponta para a role criada; `ENABLE_CUSTOM_DOMAIN` ativa os domínios depois da emissão dos certificados. A versão 3 ainda traz alertas de segurança em ferramentas usadas apenas durante o build. O CI verifica separadamente as dependências enviadas ao usuário com `npm audit --omit=dev`; a migração ou substituição da ferramenta de deploy permanece em avaliação.

O plano de IA usa os secrets `ASAAS_API_KEY` e `GEMINI_API_KEY` do GitHub somente no job de implantação do backend. Após o deploy, `scripts/configure-billing.mjs` grava as chaves no Secrets Manager e configura o webhook autenticado no Asaas. A variável pública `VITE_GOOGLE_CLIENT_ID` também é passada à Lambda para conferir que o token Google pertence ao aplicativo. Veja o [fluxo de assinatura e webhook](billing.md). A cobrança deve ser homologada no sandbox antes de ser disponibilizada a usuários.

O projeto usa a [licença MIT](../LICENSE). Em cada revisão de segurança, verificar os arquivos, o histórico Git, integrações, permissões e logs públicos; rotacionar imediatamente qualquer segredo que tenha sido exposto. O script `npm run check:secrets` examina padrões comuns dos arquivos atuais e dos objetos acessíveis no histórico, sem imprimir valores encontrados. Ele não substitui uma revisão humana.

## Verificação

- `aws cloudformation describe-stacks --profile biorotina --region sa-east-1 --stack-name biorotina-dev` mostra os recursos e URLs publicados.
- `/api/push/config` deve devolver uma chave VAPID pública.
- No navegador, ative avisos em Hidratação ou Medicação e use “Enviar teste”. A permissão de notificações precisa ser dada pelo próprio usuário nesse dispositivo.
- O site precisa ser servido por HTTPS para registrar o Service Worker. No iPhone, instale o site na Tela de Início para usar Web Push.
