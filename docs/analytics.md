# Métricas de acesso

## Objetivo e limite de dados

Usar Firebase Analytics apenas para estimar visitas ao site, origem aproximada do acesso, país/região e tipo de dispositivo. O app registra um único evento **próprio** `app_visit` por carregamento da página, quando a medição estiver ativa neste navegador. O SDK também pode gerar eventos básicos automáticos, como início de sessão e primeira visita. Não enviar registros de saúde, conteúdo de formulários, nomes, doses, perfil, endereço de email, ID da conta Google, rotas internas nem identificadores próprios de usuário.

O Google Analytics ainda usa cookies/identificadores de navegador para contar visitantes e sessões. Por isso, essas métricas são **pseudônimas, não anônimas**. Região é inferida pelo serviço a partir do IP; o aplicativo não lê GPS nem envia localização precisa. A URL enviada é sempre `https://biorotina.app.br/`, sem fragmento ou parâmetros. A origem de referência é reduzida ao domínio, sem caminho ou parâmetros. A coleta não é iniciada em `localhost` ou em domínios de preview.

## Configuração externa

Em 23/09/2026, o Firebase foi adicionado ao projeto Google Cloud existente `biorotina`, sem criar outro projeto. O app web **Biorotina Web** foi registrado sem Firebase Hosting; o site continua na AWS. A propriedade Google Analytics `biorotina` está vinculada ao fluxo web da Biorotina. O projeto usa o plano Blaze porque já tinha faturamento habilitado no Google Cloud; **Analytics** aparece como produto sem custo na [tabela oficial](https://firebase.google.com/pricing).

No GA4, confirmei **Enhanced measurement** desligado, Google Signals desligado, nenhuma coleta de User-ID ou dados fornecidos pelo usuário configurada, retenção de eventos e usuários em **2 meses**, sem reinício do prazo por nova atividade, personalização de anúncios desativada em todas as regiões e coleta de localização/dispositivo granulares desligada. País e categoria geral de dispositivo continuam adequados para relatórios agregados; cidade, modelo do aparelho e detalhes de navegador deixam de ser coletados pela configuração granular. A propriedade foi classificada como **Health**, com Brasil, fuso de São Paulo, moeda BRL e objetivo de entender o tráfego do app. As opções extras de compartilhamento dos dados do Analytics com Google foram desativadas, assim como o uso adicional de Firebase Service Data para produtos não Firebase.

Os quatro identificadores públicos do app (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID` e `VITE_FIREBASE_PROJECT_ID`) estão nas variáveis do repositório para o build de produção. O objeto de configuração web do Firebase contém identificadores públicos, [não segredos](https://firebase.google.com/docs/web/learn-more#config-object). Não usar chave de conta de serviço no frontend.

## Validação de lançamento

- Um banner pequeno, sem bloquear o app, oferece Aceitar e Recusar na primeira visita sem escolha salva. O ícone de informação explica os detalhes e aponta para a política de privacidade. Métricas e diagnósticos ficam desligados até a pessoa aceitar; ela também pode mudar a escolha em Configurações. Quem já havia aceitado ou recusado mantém sua preferência. O pacote oficial `firebase` é carregado sob demanda somente quando a medição está ativa. Login e sincronização com Drive não alteram essa escolha. Falhas do Firebase não bloqueiam a abertura do app ou seus registros.
- A página “Como seus dados são usados” explica a coleta e a revogação. Antes de divulgação ampla, completar a identificação e um canal público de contato do responsável, conforme a política de privacidade escolhida pelo projeto; não publicar o e-mail pessoal sem autorização.
- O deploy de 23/09/2026 publicou o app com as variáveis públicas; o site e os ícones retornaram HTTP 200. Ainda falta validar em DebugView, com um perfil de teste que ativou as métricas, que `app_visit` é o único evento **personalizado**, que eventos básicos automáticos usam apenas URL canônica e que não há novos eventos de medição após revogação. A coleta exclui navegadores sem consentimento, que bloqueiam analytics ou não suportam o SDK; não representa todo o tráfego do site.

## Implementação

O módulo [`src/analytics/visits.ts`](../src/analytics/visits.ts) carrega o SDK sob demanda, somente após consentimento explícito e no domínio de produção. A inicialização desativa page views automáticos (`send_page_view: false`) e sinais de anúncios, normaliza URL/título/referência e envia somente `app_visit`. Ao desativar, chama `setConsent` e `setAnalyticsCollectionEnabled(false)`. O console precisa também desativar Enhanced measurement, pois suas opções são independentes do evento explícito do app.

Fontes: [Firebase Analytics Web](https://firebase.google.com/docs/analytics/web/get-started), [API de consentimento](https://firebase.google.com/docs/reference/js/analytics), [medição aprimorada GA4](https://support.google.com/analytics/answer/9216061), [prevenção de dados pessoais em URLs](https://support.google.com/analytics/answer/6366371).

## Base de tratamento e revisão de privacidade

A [ANPD recomenda](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-cookies-e-protecao-de-dados-pessoais.pdf/@@display-file/file) que a rejeição de cookies não necessários seja tão acessível quanto o aceite e que permaneçam desligados até uma escolha válida. Esta implementação exige ativação voluntária no banner ou em Configurações e desliga sinais e personalização de anúncios. O Firebase ainda usa identificadores do navegador; a base de tratamento, os textos públicos e a operação do consentimento precisam de revisão jurídica periódica. A implementação técnica não é uma declaração de conformidade legal.
