# Experimentos e liberação gradual

## Balanço calórico diário experimental (#117)

`calorie-balance-daily` controla o link em Mais e a rota `/balanco-calorico`.
A tela consulta apenas os registros locais do dia selecionado. A equação
Mifflin–St Jeor estima gasto em repouso com o último peso registrado até o dia,
altura do perfil, idade adulta e parâmetro feminino/masculino informado na tela.
Idade e parâmetro não persistem, não entram no backup ou Drive e desaparecem ao
sair da tela. O cálculo usa somente calorias registradas nas refeições e a
parcela acima de 1 MET das atividades estimadas; calorias manuais de atividades
não entram, pois não distinguem gasto bruto e adicional. Refeições sem calorias
e atividades excluídas aparecem como lacunas. Sem refeição com valor não há
diferença numérica. A diferença é parcial e não representa déficit real,
orientação clínica ou meta. A interface não faz recomendações alimentares.

Fonte da equação: [Mifflin et al. (1990)](https://pubmed.ncbi.nlm.nih.gov/2305711/).
Fonte do uso de MET: [Compêndio de Atividades Físicas para Adultos](https://pacompendium.com/adult-compendium/).
Não há dependência nova, migração de dados ou envio de dados de saúde ao backend.
As métricas consentidas registram exposição ao abrir Mais nos dois braços,
uso do link e navegação por dias no braço experimental, apenas com chave,
revisão, braço, origem da adesão e evento técnico. O kill switch desliga link
e rota. Revisar compreensão do
caráter parcial e eventuais falhas de cálculo antes de ampliar a exposição.

Cada experimento entra no registro tipado `src/experiments/registry.ts` com
issue, hipótese, responsável, revisão e condição de remoção. Configuração
remota só opera chaves conhecidas. A infraestrutura de coortes/medição foi
entregue em #73; o painel de operação continua em #64.

## Distribuição por navegador

Experimentos de interface usam `assignment: browser`. O navegador sorteia um
número uniforme no intervalo [0, 100), uma vez por chave, e o guarda no banco
IndexedDB separado `biorotina-experiment-buckets-v1`. Transações serializam
primeiras visitas simultâneas em abas. Esse armazenamento funcional não faz
parte dos registros, backup JSON, conta ou sincronização com Drive. O número
não é enviado à API, aos logs ou às métricas.

Com 5%, números abaixo de 5 recebem o experimento; o restante recebe controle.
Ao aumentar para 10%, os números entre 5 e 10 entram, sem ressorteio. Redução
retira quem ficou acima do novo limite. Login/logout não troca o número.
Outro aparelho, perfil ou limpeza do armazenamento resulta em outra
participação. A unidade é navegador, não pessoa; não precisamos conhecer o
total da população e o percentual realizado pode variar numa amostra pequena.

`GET /api/experiments` é público e retorna `browser` com somente configuração
conhecida de interface. O frontend calcula o braço. Sem configuração, com
configuração inválida, falha de rede/armazenamento ou kill switch, o recurso
fica desligado. Um experimento configurado como `enabled: true` e percentual
zero tem grupo controle mensurável; desligamento não é exposição de controle.
O cache da API e a atualização do frontend duram até 60 segundos cada; somados,
podem levar aproximadamente 120 segundos para aplicar mudança, além da latência
ou suspensão da aba. Um refresh que falha desliga os experimentos.

Recursos protegidos continuam autorizados no servidor. `demo-highlight` mantém
`assignment: account` e gate autenticado na operação de demonstração; a
configuração pública não libera endpoints de conta nem autoriza operações.
Os campos `enabled`/`revisions` mantêm compatibilidade com frontends anteriores
durante deploy. A medição comparável cobre as chaves de hidratação, peso e
atividades por navegador, sem misturar os eventos antigos do Firebase.

## Adesão de teste

Pessoas conectadas podem usar
`X-Biorotina-Force-Experiment: <chave>=enabled` nas APIs da Biorotina. A API
sinaliza `forced` somente após validar sessão. Anônimos não forçam o gate;
um kill switch sempre vence, inclusive para participantes forçados. É possível
aderir sem configuração remota; falha de leitura/configuração inválida desliga
inclusive a adesão. Tráfego forçado aparece no relatório como participação
manual, separado dos grupos sorteados.
O header não é guardado em dados pessoais, backups ou logs.

Em Configurações, **Programa beta** guarda uma preferência somente nesta
instalação. Ao ativá-la, a pessoa participa de todos os experimentos de
interface por navegador que estejam habilitados, mesmo fora da porcentagem
sorteada. Configuração ausente/inválida, recurso desabilitado e kill switch
continuam desligados. Experimentos de conta e operações protegidas no servidor
não mudam. A preferência não vai para backup, Drive ou backend. Sair do programa
restaura o sorteio persistente do navegador. Exposição e ações consentidas
entram no relatório como participação manual; não se inferem resultados A/B
dessa população autoselecionada.

## Configuração e rollback

ExperimentsTable guarda `pk=EXPERIMENT#<chave>` e `config` em JSON:

```json
{"enabled":true,"killSwitch":false,"rolloutPercent":5,"revision":2}
```

Revisão deve ser inteira entre 1 e 2147483647; percentual inteiro de 0 a 100.
Incremente a revisão ao mudar percentual, conteúdo ou população. Não misture
resultados de revisões diferentes nem compare períodos diferentes entre braços.

```sh
AWS_PROFILE=biorotina AWS_REGION=sa-east-1 npm run configure-experiment -- \
  --key hydration-form-confirmation --enabled --rollout 5 --revision 2

# Interromper sem deploy (usar a próxima revisão):
AWS_PROFILE=biorotina AWS_REGION=sa-east-1 npm run configure-experiment -- \
  --key hydration-form-confirmation --enabled --rollout 5 --revision 3 --kill-switch
```

A migração de conta para navegador começa uma nova população. As chaves de
hidratação devem manter 5% e mudar da revisão 1 para 2 após publicação; não
usar a revisão 1 antiga como controle da nova distribuição. Responsáveis,
prazos e condições de remoção seguem no registro tipado.

## Medição consentida na AWS

`POST /api/telemetry/experiment` aceita somente `experiment`, `revision`, `arm`
(`control`/`experiment`), `outcome`, `environment` e `manual` booleano
(opcional para clientes anteriores). Chaves e resultados são
enums fechados; revisão limitada; corpo máximo de 512 bytes. Não envia cookie,
ID de conta/navegador, número sorteado, valor/data de registro, rota, erro livre
ou dados de saúde. O backend escreve somente essas dimensões e campos fixos
`service=frontend` e `kind=experiment_metric` ou
`kind=experiment_metric_manual`, com retenção de 14 dias. O último identifica
testes por adesão beta ou header, sem identificar quem participou.

Sem consentimento de métricas, nada é enviado. Revogar interrompe novos envios.
Aceitar depois registra apenas a exposição atual, sem recuperar ações passadas.
O sorteio funcional independe desse consentimento. Não há fila offline; falhas
são descartadas e não bloqueiam o produto. O cliente limita 120 eventos por
carregamento; API Gateway limita a rota a 5/s, rajada 20. CORS e esse limite não
impedem dados forjados por clientes automatizados; os agregados são diagnósticos
de melhor esforço, não um ledger confiável de operações.

- `exposure`: uma vez por chave/revisão/braço a cada carregamento, quando a
  página relevante está montada e visível. Hidratação cobre formulário e
  atalhos; peso cobre o formulário de Medidas; atividades cobre o formulário de
  Atividades e o formulário de Hábitos; onboarding usa a página inicial elegível à decisão de instalação.
  A consulta diária cobre apenas datas vazias com dia anterior ou posterior registrado, conforme a chave.
  O atalho do histórico de peso cobre apenas um dia sem medidas com medida anterior.
  Atribuir uma configuração em outra página não conta como exposição.
- `success`/`error`: resultado de cada tentativa concluída de salvar pelo
  formulário de água/peso/atividades/hábitos ou atalho/repetição de água, em ambos os braços. Erro inclui validação e
  persistência; sucesso significa gravação local, não sincronização no Drive.
  Tentativas em andamento ficam fora do denominador. A atribuição é congelada
  no início, mesmo se percentual/revisão mudar enquanto a gravação está pendente.
- `use`: ação específica de instalação; medir igualmente nos dois braços.
  Nos atalhos da consulta diária, mede o clique disponível no braço experimental.
- `rollback`: perda do braço experimental após refresh, apenas se houve
  exposição consentida; inclui kill switch, redução, desligamento e falha de
  refresh. Carrega a revisão anterior; não representa quantidade de comandos
  administrativos de rollback.

Taxa de sucesso = success / (success + error), calculada separadamente por
chave/revisão/origem da participação/braço no mesmo período. A origem é
`randomized` ou `manual`; somente grupos sorteados servem para comparar braços.
Os testes manuais ajudam a observar uso e erros, mas são autoselecionados.
Exposição é contagem de carregamentos
observados, não usuários únicos. Repetição de visitas, consentimento, bloqueios,
limites, atraso de ingestão e múltiplos dispositivos afetam as contagens.
Não inferir causalidade com amostra insuficiente nem tratar falta de eventos
como prova de ausência de uso ou regressão.

## Consulta sem login no Analytics

Usar credenciais AWS com CloudWatch Insights (`StartQuery`, `GetQueryResults`,
`StopQuery`) e acesso ao grupo de telemetria. Nenhuma chave Firebase é necessária.

```sh
AWS_PROFILE=biorotina AWS_REGION=sa-east-1 npm run report-experiments -- \
  --since 2026-09-26T00:00:00Z --until 2026-09-27T00:00:00Z
```

Retorna JSON agregado por chave/revisão/origem/braço: exposure, success, error, use,
rollback, completedAttempts e successRate (null sem tentativas concluídas).
Padrão: últimas 24 horas, ambiente production. `--environment development`
separa ensaios sintéticos; janela máxima 14 dias. A consulta nunca retorna
mensagens brutas, identificadores ou linhas individuais. O painel #64 pode
consumir esses agregados posteriormente.

## Encerramento

Avaliar ambos os braços, erros e rollback antes de ampliar. Ao promover ou
remover, retirar configuração, gate, código, registro e armazenamento da chave
na mesma entrega. Uma nova hipótese deve usar outra chave e outro sorteio.

## Confirmação de peso — #75

`weight-form-confirmation`, revisão 1, responsável Biorotina, revisão até
04/10/2026: confirma a gravação local no formulário de Medidas sem anunciar
valores ou mover foco. Adesão autenticada e kill switch seguem as regras acima;
liberação inicial de 5% somente após deploy. Medir exposição e tentativas
concluídas dos dois braços; taxa de sucesso é guardrail, não medida direta de
clareza. Validar compreensão e leitor de tela antes de promover. Promover ou
retirar após sete dias; sem evidência suficiente, desligar. Interromper por
confirmação falsa, regressão de persistência ou acessibilidade.

## Confirmação de atividade — #77

`activity-form-confirmation`, revisão 1, responsável Biorotina, revisão até
05/10/2026: confirma a gravação local no formulário de Atividades sem anunciar
valores ou mover foco. Sem configuração remota, permanece desligado; adesão
autenticada e kill switch seguem as regras acima. Após deploy, iniciar em 5%.
Comparar exposição e tentativas concluídas dos dois braços como guardrail de
persistência; validar clareza e leitor de tela antes de promover. Promover ou
retirar após sete dias; sem evidência suficiente, desligar. Interromper por
confirmação falsa ou regressão de persistência ou acessibilidade.

## Confirmação de hábito — #79

`habit-form-confirmation`, revisão 1, responsável Biorotina, revisão até
06/10/2026: confirma a gravação local após criar ou editar um hábito, sem
anunciar seu conteúdo ou mover o foco. Sem configuração remota, permanece
desligado; adesão autenticada e kill switch seguem as regras acima. Após deploy,
iniciar em 5%. Comparar exposição e tentativas concluídas dos dois braços como
guardrail de persistência; validar compreensão e leitor de tela antes de
promover. Promover ou remover após sete dias; sem evidência suficiente,
desligar. Interromper por confirmação falsa ou regressão de persistência ou
acessibilidade.

## Confirmação de medicamento — #81

`medication-form-confirmation`, revisão 1, responsável Biorotina, revisão até
07/10/2026: confirma a gravação local após criar ou editar um medicamento, sem
anunciar nome, dose ou horários nem mover o foco. Sem configuração remota,
permanece desligado; adesão autenticada e kill switch seguem as regras acima.
Após deploy, iniciar em 5%. Comparar exposição e tentativas concluídas dos dois
braços como guardrail de persistência; validar compreensão e leitor de tela
antes de promover. Promover ou remover após sete dias; sem evidência suficiente,
desligar. Interromper por confirmação falsa ou regressão de persistência ou
acessibilidade.

## Atalho na consulta diária vazia — #85

`daily-records-last-day-shortcut`, revisão 1, responsável Biorotina, revisão
até 08/10/2026: quando a data consultada não tem registros e há um dia anterior
com registros locais, oferece um botão para abrir o mais recente. A data e o
conteúdo dos registros não entram na telemetria. Sem configuração remota,
permanece desligado; adesão autenticada e kill switch seguem as regras acima.
Após deploy, iniciar em 5%. Medir exposição consentida dos dois braços somente
na tela vazia elegível e `use` no clique; observar erros e rollback na mesma
revisão. O uso do botão sozinho não demonstra causalidade; validar compreensão
e acessibilidade antes de ampliar. Promover ou remover após sete dias; sem
evidência suficiente, desligar. Interromper por navegação incorreta ou
regressão de privacidade ou acessibilidade.

## Atalho no histórico de peso vazio — #96

`weight-history-last-day-shortcut`, revisão 1, responsável Biorotina, revisão
até 11/10/2026: quando o dia escolhido em Medidas não tem medidas e há uma
medida anterior, oferece um botão para consultar o último dia com medida. O
controle mantém a escolha manual da data. Sem configuração remota, permanece
desligado; adesão de teste autenticada e kill switch seguem as regras acima.
Após deploy, iniciar em 5%. Medir exposições consentidas dos dois braços na
condição elegível, `use` no clique, erros e rollback na mesma revisão. Não
enviar datas nem valores de medidas na telemetria. Promover ou remover após
sete dias conforme uso e avaliação de acessibilidade; sem evidência suficiente,
desligar. Interromper por navegação incorreta ou regressão de privacidade ou
acessibilidade.

## Limpeza da busca vazia em medicamentos — #109

`medication-history-clear-search`, revisão 1, responsável Biorotina, revisar
até 14/10/2026: quando o histórico do dia contém usos, mas a busca não encontra
um nome, move a ação de limpar para o estado vazio e restaura a lista com foco no campo. Controle
mantém a instrução atual. Sem configuração remota, fica desligado; adesão
autenticada e kill switch seguem as regras acima. Após deploy, iniciar em 5%.
Medir exposição consentida dos dois braços somente no vazio elegível, `use`
no clique, erros e rollback na mesma revisão. Não enviar texto buscado, nomes
ou registros. Promover ou remover após sete dias conforme uso e avaliação de
acessibilidade; sem dados suficientes, desligar. Interromper por foco incorreto,
perda de dados ou vazamento de busca.

## Refeição na barra inferior móvel — #112

`mobile-nav-meal-priority`, revisão 2, liberado a 100% em 07/10/2026,
responsável Biorotina, revisar até
14/10/2026: testa Hoje, Atividade, Refeição, Água e Mais na barra inferior do
celular, com Medidas em Mais. O controle mantém Hoje, Medidas, Atividade, Água e
Mais, com Alimentação em Mais. A barra lateral do desktop e as rotas não mudam.
Sem configuração remota, fica no controle; iniciar em 50% após o deploy do
frontend e da API, com kill switch disponível. Medir exposição consentida dos
dois braços somente quando a barra móvel está visível e `use` no toque em Mais,
sem enviar rota, registro ou dado de saúde. O uso de Mais isoladamente não mede
a facilidade de navegação; validar com pessoas e leitor de tela antes de
promover. Promover ou remover após sete dias; sem evidência suficiente,
desligar. Interromper por navegação incorreta, perda de acesso a Medidas ou
regressão de acessibilidade.
