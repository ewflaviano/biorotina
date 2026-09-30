# Experimentos e liberação gradual

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
inclusive a adesão. Tráfego forçado é excluído das métricas comparativas.
O header não é guardado em dados pessoais, backups ou logs.

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
(`control`/`experiment`), `outcome` e `environment`. Chaves e resultados são
enums fechados; revisão limitada; corpo máximo de 512 bytes. Não envia cookie,
ID de conta/navegador, número sorteado, valor/data de registro, rota, erro livre
ou dados de saúde. O backend escreve somente essas dimensões e campos fixos
`kind=experiment_metric` e `service=frontend`, com retenção de 14 dias.

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
  Atribuir uma configuração em outra página não conta como exposição.
- `success`/`error`: resultado de cada tentativa concluída de salvar pelo
  formulário de água/peso/atividades/hábitos ou atalho/repetição de água, em ambos os braços. Erro inclui validação e
  persistência; sucesso significa gravação local, não sincronização no Drive.
  Tentativas em andamento ficam fora do denominador. A atribuição é congelada
  no início, mesmo se percentual/revisão mudar enquanto a gravação está pendente.
- `use`: ação específica de instalação; medir igualmente nos dois braços.
- `rollback`: perda do braço experimental após refresh, apenas se houve
  exposição consentida; inclui kill switch, redução, desligamento e falha de
  refresh. Carrega a revisão anterior; não representa quantidade de comandos
  administrativos de rollback.

Taxa de sucesso = success / (success + error), calculada separadamente por
chave/revisão/braço no mesmo período. Exposição é contagem de carregamentos
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

Retorna JSON agregado por chave/revisão/braço: exposure, success, error, use,
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
