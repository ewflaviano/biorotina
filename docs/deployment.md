# Implantação da Biorotina

## Infraestrutura

O `serverless.yml` cria a API HTTP em Axum, duas Lambdas Rust (API e envio periódico), o agendamento a cada cinco minutos, uma tabela DynamoDB para inscrições técnicas de Web Push, um segredo VAPID gerado pelo Secrets Manager, um bucket S3 privado e uma distribuição CloudFront. A pilha fica em `sa-east-1`. CloudFront e Route 53 são serviços globais; o certificado do site precisa estar em `us-east-1` por exigência do CloudFront. O certificado de `api.biorotina.app.br` fica em `sa-east-1`.

O backend recebe somente inscrição técnica do navegador, horários e fuso. Não recebe nome, dose, peso, alimentação ou histórico. O token de administração fica no navegador e só seu hash fica no DynamoDB. A inscrição expira após 180 dias sem atualização. O segredo VAPID é criado pela AWS e nunca entra no código ou no build do site.

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

Para compilar o frontend para a infraestrutura existente, obtenha a saída `PushApiUrl` da pilha `biorotina-dev`, use-a como `VITE_PUSH_API_URL` em `npm run build` e publique `dist/` no bucket indicado por `FrontendBucketName`. O fluxo do GitHub Actions faz essas etapas e invalida o cache do CloudFront automaticamente.

## GitHub Actions

O workflow `.github/workflows/ci.yml` identifica as áreas alteradas. Mudanças apenas na interface executam testes e deploy do frontend; mudanças apenas em `push/` ou `serverless.yml` executam testes e deploy do backend. Arquivos compartilhados, como dependências e o próprio workflow, acionam ambos; mudanças só de documentação não publicam o app. Em push/merge em `master`, cada deploy só começa depois da validação da área correspondente. Quando ambos mudam, o frontend espera a infraestrutura. O acesso AWS usa OpenID Connect com a role `biorotina-github-deploy`; não existe AWS access key no GitHub nem no código. A política de confiança limita o acesso ao repositório `ewflaviano/biorotina` na branch `master`.

O projeto usa Serverless Framework v3, que implanta pela role AWS sem uma chave adicional do Serverless Dashboard. A variável pública `AWS_DEPLOY_ROLE_ARN` aponta para a role criada; `ENABLE_CUSTOM_DOMAIN` ativa os domínios depois da emissão dos certificados. A versão 3 ainda traz alertas de segurança em ferramentas usadas apenas durante o build. O CI verifica separadamente as dependências enviadas ao usuário com `npm audit --omit=dev`; antes de abrir o código, será preciso atualizar ou substituir o Framework v3 para eliminar também esses alertas de desenvolvimento.

Antes de abrir o repositório, revisar o histórico Git inteiro, escolher licença e rotacionar qualquer segredo que tenha sido exposto acidentalmente. O script `npm run check:secrets` examina padrões comuns dos arquivos atuais, mas não substitui essa revisão.

## Verificação

- `aws cloudformation describe-stacks --profile biorotina --region sa-east-1 --stack-name biorotina-dev` mostra os recursos e URLs publicados.
- `/api/push/config` deve devolver uma chave VAPID pública.
- No navegador, ative avisos em Hidratação ou Medicação e use “Enviar teste”. A permissão de notificações precisa ser dada pelo próprio usuário nesse dispositivo.
- O site precisa ser servido por HTTPS para registrar o Service Worker. No iPhone, instale o site na Tela de Início para usar Web Push.
