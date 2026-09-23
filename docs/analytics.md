# Métricas de acesso

## Objetivo e limite de dados

Usar Firebase Analytics apenas para estimar visitas ao site, origem aproximada do acesso, país/região e tipo de dispositivo. O app registra um único evento **próprio** `app_visit` por carregamento da página, após consentimento explícito. O SDK também pode gerar eventos básicos automáticos, como início de sessão e primeira visita. Não enviar registros de saúde, conteúdo de formulários, nomes, doses, perfil, endereço de email, ID da conta Google, rotas internas nem identificadores próprios de usuário.

O Google Analytics ainda usa cookies/identificadores de navegador para contar visitantes e sessões. Por isso, essas métricas são **pseudônimas, não anônimas**. Região é inferida pelo serviço a partir do IP; o aplicativo não lê GPS nem envia localização precisa. A URL enviada é sempre `https://biorotina.app.br/`, sem fragmento ou parâmetros. A origem de referência é reduzida ao domínio, sem caminho ou parâmetros. A coleta não é iniciada em `localhost` ou em domínios de preview.

## Configuração externa

Em 23/09/2026, o Firebase foi adicionado ao projeto Google Cloud existente `biorotina`, sem criar outro projeto. O app web **Biorotina Web** foi registrado sem Firebase Hosting; o site continua na AWS. A propriedade Google Analytics `biorotina` está vinculada ao fluxo web da Biorotina. O projeto usa o plano Blaze porque já tinha faturamento habilitado no Google Cloud; **Analytics** aparece como produto sem custo na [tabela oficial](https://firebase.google.com/pricing).

No GA4, confirmei **Enhanced measurement** desligado, Google Signals desligado, nenhuma coleta de User-ID ou dados fornecidos pelo usuário configurada, retenção de eventos e usuários em **2 meses**, sem reinício do prazo por nova atividade, personalização de anúncios desativada em todas as regiões e coleta de localização/dispositivo granulares desligada. País e categoria geral de dispositivo continuam adequados para relatórios agregados; cidade, modelo do aparelho e detalhes de navegador deixam de ser coletados pela configuração granular. As opções extras de compartilhamento dos dados do Analytics com Google foram desativadas, assim como o uso adicional de Firebase Service Data para produtos não Firebase.

Os quatro identificadores públicos do app (`VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID` e `VITE_FIREBASE_PROJECT_ID`) estão nas variáveis do repositório para o build de produção. O objeto de configuração web do Firebase contém identificadores públicos, [não segredos](https://firebase.google.com/docs/web/learn-more#config-object). Não usar chave de conta de serviço no frontend.

## Validação de lançamento

- O pacote oficial `firebase` é carregado sob demanda somente após a escolha “Permitir métricas” no domínio de produção. A preferência inicial é `unset`. Login e sincronização com Drive não alteram essa escolha. Falhas do Firebase não bloqueiam a abertura do app ou seus registros.
- A página “Como seus dados são usados” explica a coleta e a revogação. Antes de divulgação ampla, completar a identificação e um canal público de contato do responsável, conforme a política de privacidade escolhida pelo projeto; não publicar o e-mail pessoal sem autorização.
- Após o deploy, conferir em DebugView e no painel de rede que `app_visit` é o único evento **personalizado**, que eventos básicos automáticos usam apenas URL canônica, e que não há carregamento do SDK antes do consentimento nem novos eventos de medição após revogação. A coleta só mede visitantes que aceitaram; não representa todo o tráfego do site.

## Implementação

O módulo [`src/analytics/visits.ts`](../src/analytics/visits.ts) carrega o SDK sob demanda, somente após a preferência salva como `accepted` e no domínio de produção. A inicialização desativa page views automáticos (`send_page_view: false`) e sinais de anúncios, normaliza URL/título/referência e envia somente `app_visit`. Ao revogar, chama `setConsent` e `setAnalyticsCollectionEnabled(false)`. O console precisa também desativar Enhanced measurement, pois suas opções são independentes do evento explícito do app.

Fontes: [Firebase Analytics Web](https://firebase.google.com/docs/analytics/web/get-started), [API de consentimento](https://firebase.google.com/docs/reference/js/analytics), [medição aprimorada GA4](https://support.google.com/analytics/answer/9216061), [prevenção de dados pessoais em URLs](https://support.google.com/analytics/answer/6366371).
