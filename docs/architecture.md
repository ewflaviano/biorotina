# Arquitetura da Biorotina

**Estado:** app local funcional, serviço Web Push e infraestrutura AWS implementados. Login opcional no topo e sincronização automática com o Google Drive implementados.

## Decisão principal

O aplicativo usa **React + TypeScript + Vite**, com interface mobile first e dados em **IndexedDB**. O site é distribuído como arquivos estáticos por **S3 privado + CloudFront com Origin Access Control**. O registro de dados e a sincronização direta com o Google Drive da pessoa não dependem do backend. [Vite](https://vite.dev/guide/) produz os arquivos estáticos; [AWS](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/GettingStarted.SimpleDistribution.html) documenta o uso de S3 com OAC.

```
Celular / navegador
  ├─ Interface React
  ├─ IndexedDB: perfil e registros
  ├─ Exportar/importar JSON
  └─ Google Drive da pessoa (consentimento opcional)

CloudFront ── S3 privado: apenas os arquivos públicos do aplicativo

Notificações com opt-in por dispositivo:
Service Worker / PushSubscription ── API Gateway ── Lambda Rust com Axum
                                                    ├─ DynamoDB: inscrição técnica e horários
                                                    └─ Secrets Manager: segredo VAPID
EventBridge Scheduler ── Lambda Rust de envio ── Web Push
```

## Funcionalidades existentes

- Rotas para Hoje, Peso, Atividades, Alimentação, Medicação, Hidratação e Configurações. No celular, “Mais” reúne áreas secundárias em uma barra inferior de cinco destinos.
- Registros locais de peso, atividade, refeição, água, medicamento e uso de medicamento; perfil com nome opcional e altura para IMC. Hidratação e medicamentos permitem vários horários diários de lembrete.
- Exclusão individual com opção de desfazer durante a sessão; exclusão de medicamento pede confirmação e remove também seus registros de uso, com restauração conjunta. Repetição de água usa o horário atual; Peso, Atividade e Refeição preenchem um novo formulário com os dados anteriores. Medicamento pode ser editado sem perder o histórico de uso.
- Calorias de refeições são **valores informados ou revisados pela pessoa**. Uma foto opcional pode gerar uma lista de alimentos, porções e calorias estimadas com Gemini usando a chave da própria pessoa; nada é salvo até ela revisar e confirmar. A imagem é reduzida no navegador e não é persistida. Para atividades escolhidas no catálogo, a interface sugere calorias a partir de MET do [Compêndio de 2024](https://pacompendium.com/adult-compendium/), duração e peso, identificando o valor como estimativa e mantendo edição livre. Atividades digitadas livremente não recebem estimativa automática.
- Backup JSON com `schemaVersion: 4`, validação na importação e confirmação antes de substituir dados locais. Backups e documentos IndexedDB das versões 1, 2 e 3 são migrados sem apagar registros, inclusive o antigo horário único de medicação.
- A interface funciona sem conta. O código do domínio (`src/domain`) fica separado da interface para facilitar uma futura adaptação a React Native. IndexedDB é específico do navegador e será substituído por outro adaptador de armazenamento no app nativo.

## Análise opcional por foto

A pessoa cria uma chave no Google AI Studio e a guarda somente no IndexedDB deste aparelho, separada de `AppData`; ela não entra no JSON nem no Drive. A foto é convertida para JPEG de até 768 px por lado e aproximadamente 350 KB no navegador, sem metadados EXIF, e enviada diretamente à API Gemini apenas depois de um toque explícito. O app pede JSON estruturado, valida descrição, alimentos, porções e calorias, preenche o formulário e deixa tudo editável. Só os dados confirmados entram no diário; `photoAssisted` identifica que houve sugestão da foto. Erro, falta de chave ou indisponibilidade do Gemini não bloqueiam o registro manual. A chave pode ser removida em Configurações. Por estar no navegador, não é um segredo contra scripts executados na mesma origem, extensões ou outras pessoas com acesso ao dispositivo; recomenda-se uma chave separada e limites na conta Google.

O plano mensal usa a conta Google já conectada para identificar a assinatura. O backend verifica o token Google e guarda o hash do identificador da conta, os IDs de cobrança, as datas e a cota diária. O checkout coleta CPF e cartão no Asaas; esses dados não passam pela Biorotina. Webhooks autenticados confirmam pagamentos e renovação, e o cancelamento é enviado ao Asaas. A foto do plano passa pelo backend para usar a chave do projeto, sem persistência. A implementação está em revisão local e requer teste financeiro completo no sandbox antes de publicar; nenhuma chave do projeto entra no código.

## Sincronização Google Drive

O navegador usa **Google Identity Services**, com consentimento no momento de conectar o Drive. Solicita `openid`, `email` e `drive.appdata` para identificar a conta exibida e guardar o JSON em `appDataFolder`, uma pasta de dados do aplicativo que não aparece na interface normal do Drive. O [modelo de token do Google](https://developers.google.com/identity/oauth2/web/guides/use-token-model) permite chamar a API pelo navegador sem guardar refresh token em backend; os tokens de acesso são curtos e a pessoa poderá precisar autorizar novamente. A [documentação do Drive](https://developers.google.com/workspace/drive/api/guides/appdata) descreve o escopo e a pasta.

O botão de conexão no topo está ativo quando `VITE_GOOGLE_CLIENT_ID` está definido. O cliente OAuth Web e a API do Drive estão configurados no projeto Google Cloud `biorotina`. O token de acesso fica no armazenamento local do navegador para manter a sessão após recarregar e é renovado, quando possível, pelo Google Identity Services. Se a renovação falhar, a pessoa precisa conectar novamente. Após conectar, o app compara as versões, sincroniza alterações locais automaticamente com breve espera para agrupar edições e tenta novamente ao recuperar conexão ou foco. Cada sincronização cria um novo snapshot JSON na pasta privada do app, preservando as versões anteriores. O envio e a restauração têm o mesmo limite de 10 MB; se os dados crescerem além disso, o app conserva os registros locais e informa que o backup do Drive não foi enviado. O IndexedDB guarda, por conta Google, o ID do último snapshot sincronizado e o hash SHA-256 do conteúdo local. A pessoa pode continuar usando o app sem conta e exportar JSON.

**Regra para conflitos:** comparar o último snapshot remoto e o hash do conteúdo local. Quando ambos mudaram, mostrar a quantidade de registros e a data da versão do Drive, sem substituir os dados automaticamente. A pessoa pode manter a versão local, criar uma união por identificador ou restaurar a remota após confirmar e iniciar o download de um JSON da versão local. Na união, o registro local prevalece quando o mesmo identificador tem conteúdos diferentes; o snapshot remoto anterior permanece no Drive. O armazenamento de metadados separado por identificador da conta impede misturar estados de contas Google diferentes. A restauração verifica a revisão local antes de gravar, para recusar mudanças concorrentes. O JSON permanece versionado e migrável.

O **OAuth client ID** de aplicativo web é um identificador público e entra em uma configuração `VITE_`. **Client secret, tokens de usuário e credenciais AWS jamais entram no código ou no bundle publicado.** O token de cada pessoa existe apenas no armazenamento do próprio navegador, conforme sua escolha de conectar. O [Vite informa](https://vite.dev/guide/env-and-mode) que variáveis `VITE_` são expostas no código enviado ao navegador. O arquivo `.env.example` contém apenas exemplos de identificadores públicos; arquivos `.env` locais estão ignorados pelo Git.

## Métricas de acesso opcionais

O Firebase Analytics está vinculado ao mesmo projeto Google Cloud `biorotina`. A pessoa pode ativar ou desativar as métricas em Configurações; sem escolha, não há coleta. O app só carrega o SDK no domínio de produção e após a permissão; ela não depende do login Google. O evento próprio `app_visit` usa URL canônica e referência reduzida ao domínio. O SDK pode registrar eventos básicos de sessão. Nenhum registro de saúde ou perfil é fornecido ao módulo. Uma falha do Firebase não bloqueia armazenamento local, sincronização, navegação ou notificações. Configuração do console e limitações de cobertura estão em [Métricas de acesso](analytics.md).

## Lembretes e backend mínimo

Uma sessão de navegador não basta para entregar notificações depois que a página fecha. Web Push usa **Service Worker + PushSubscription**: o navegador entrega um endpoint e chaves de inscrição para aquela instalação, e o servidor usa esses dados para enviar a notificação. Esse endpoint é sensível e deve ser protegido. [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Push_API) descreve o fluxo. O envio requer permissão explícita; no iPhone, a [Apple documenta](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers) Web Push para apps web adicionados à Tela de Início.

Fluxo implementado, sem conta pessoal:

1. A pessoa ativa lembretes em um gesto claro e concede permissão ao navegador.
2. O navegador cria uma inscrição de push e recebe um **identificador de instalação** e uma credencial opaca de administração. A credencial fica só no dispositivo; o servidor armazena seu hash para permitir alterar ou cancelar aquela inscrição.
3. O servidor guarda apenas endpoint/chaves de push, união dos horários, fuso horário e prazo de expiração. Não guarda nome do medicamento, dose, refeições, peso, volume de água ou histórico.
4. **EventBridge Scheduler** aciona uma **Lambda em Rust** a cada cinco minutos. Cada inscrição mantém seu próximo horário em UTC em um índice secundário do DynamoDB, dividido em 16 partições. A Lambda consulta somente horários vencidos, recupera avisos com até dez minutos de atraso e descarta os mais antigos; depois calcula o próximo horário. Uma marcação condicional impede envio duplicado. A [AWS documenta](https://docs.aws.amazon.com/lambda/latest/dg/with-eventbridge-scheduler.html) esse tipo de invocação. O texto do push é genérico: a informação detalhada permanece no dispositivo.
5. A pessoa pode desativar e revogar a inscrição. Endpoint inválido é removido. Logs não incluem endpoint, credencial ou dados de saúde.

Isso dispensa identificar a pessoa por nome ou e-mail **para o envio por dispositivo**, mas ainda há dados técnicos pessoais, como endpoint e IP em trânsito. A inscrição técnica expira após 180 dias sem atualização; marcas de envio expiram após três dias. Em mais de um dispositivo, cada instalação escolhe separadamente receber notificações. O índice de próximos horários faz o custo de leitura crescer com os avisos devidos, em vez de crescer com todas as inscrições cadastradas. Há 16 consultas pequenas por execução mesmo sem avisos, além de uma leitura consistente por aviso candidato. Se o volume de envios simultâneos aumentar muito, o processamento pode ser distribuído por fila sem mudar o armazenamento local dos dados de saúde. Quando houver métricas reais de uso e custo, comparar essa solução com PostgreSQL para o armazenamento do serviço de notificações.

## Quando um backend adicional faria sentido

- Integrações com **client secret**, webhooks, filas ou dados que precisem ser processados fora do navegador.
- Novos tipos de notificações que precisem de processamento fora do navegador.
- Métricas operacionais agregadas do serviço, com desenho de privacidade próprio. Nunca enviar eventos que incluam peso, refeições, medicamentos, dose ou outros registros pessoais por padrão.
- Recursos de IA que exijam chave mantida pelo projeto; nesse caso, os dados enviados e o consentimento precisarão ser explícitos. Uma chave fornecida pela pessoa exige um desenho separado de armazenamento e risco.

Evitar ampliar o backend para dados pessoais só por antecipação. Os serviços atuais existem para notificações e o plano de IA; novos dados só devem entrar quando um recurso concreto precisar deles.

## Segurança no projeto de código aberto

- Não registrar chaves, tokens, payloads de saúde, URLs de push ou arquivos JSON em logs.
- Não colocar dados pessoais em URL, query string ou título da página; URLs podem aparecer em histórico e logs do CloudFront.
- Credenciais de deploy pertencem ao ambiente de CI/IAM; segredos de Lambda a um gerenciador de segredos, nunca ao repositório ou ao build do navegador.
- Manter `.env`, certificados e arquivos de credenciais fora do Git. Revisar **o histórico inteiro**, não apenas os arquivos atuais, antes de divulgar novas versões ou logs; o código e a documentação original usam a [licença MIT](../LICENSE).
- Backup JSON é texto legível. Uma opção de criptografia de backup pode ser estudada antes de sincronizar dados sensíveis no Drive; não afirmar que os dados estão criptografados de ponta a ponta sem implementar e auditar isso.
- O aplicativo em produção deve ter HTTPS, Content Security Policy e dependências revisadas. Evitar serviços de analytics ou fontes externas que recebam dados de navegação sem decisão explícita.
