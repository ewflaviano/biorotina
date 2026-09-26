# Experimentos e liberação gradual

Cada experimento deve entrar no registro tipado em
`src/experiments/registry.ts`, ter issue, hipótese, responsável, data de
revisão e condição de remoção. A configuração remota apenas pode alterar uma
chave que exista nesse registro e na API.

## Decisão do gate

A API é a fonte de verdade. A ordem é: kill switch, conta autenticada,
testador autorizado e porcentagem determinística. A porcentagem usa o hash da
conta já guardado para a sessão, sem dados de saúde, e mantém a mesma pessoa na
mesma coorte. Falha de leitura, configuração inválida ou ausência de sessão
desliga o recurso.

O cabeçalho `X-Biorotina-Force-Experiment: <chave>=enabled` serve para
testadores autorizados. Ele é lido somente nas APIs da Biorotina e nunca é
salvo em backup, Drive, dados de saúde, telemetria ou logs. O frontend só recebe
a lista final de chaves habilitadas por `GET /api/experiments`.

Chamadas de uma funcionalidade experimental levam
`X-Biorotina-Experiment: <chave>` apenas para a API da Biorotina. Esse
cabeçalho declara o recurso solicitado; não autoriza nada. A API reavalia o
gate antes de executar a operação.

## Configuração remota

A tabela `ExperimentsTable` armazena uma linha por chave com `pk` igual a
`EXPERIMENT#<chave>` e o atributo `config` em JSON:

```json
{
  "enabled": true,
  "killSwitch": false,
  "rolloutPercent": 5,
  "testers": ["DRIVE_ACCOUNT#<hash-da-conta>"],
  "revision": 1
}
```

A API mantém essa configuração em cache por no máximo 60 segundos. Para parar
um experimento, altere `killSwitch` para `true`; nenhuma publicação é
necessária. O valor inicial sem configuração é desligado.

Após o primeiro deploy, o responsável pode atualizar a configuração sem
publicar código:

```sh
AWS_PROFILE=biorotina AWS_REGION=sa-east-1 npm run configure-experiment -- \
  --key onboarding-install-prompt --enabled --rollout 5 --revision 1
```

Para adicionar um testador específico, inclua `--tester-google-sub <valor>`.
O script calcula o hash localmente e envia somente o hash para DynamoDB; não
imprime nem grava o identificador Google.

## Métricas e encerramento

Registre somente a chave e a versão da configuração em métricas agregadas,
respeitando o consentimento de diagnósticos. Avalie exposição, uso, erros e
reversões antes de promover. Ao encerrar, remova configuração, gate, código e
registro tipado na mesma entrega.
