# Experimentos e liberação gradual

Cada experimento deve entrar no registro tipado em
`src/experiments/registry.ts`, ter issue, hipótese, responsável, data de
revisão e condição de remoção. A configuração remota apenas pode alterar uma
chave que exista nesse registro e na API.

## Decisão do gate

A API é a fonte de verdade. A ordem é: kill switch, conta autenticada, header
de adesão e porcentagem determinística. A porcentagem usa o hash da conta já
guardado para a sessão, sem dados de saúde, e mantém a mesma pessoa na mesma
coorte. Falha de leitura, configuração inválida ou ausência de sessão desliga
o recurso na navegação comum.

Qualquer pessoa conectada pode aderir a um experimento conhecido com o
cabeçalho `X-Biorotina-Force-Experiment: <chave>=enabled`, por exemplo no
ModHeader. O cabeçalho é lido somente nas APIs da Biorotina e nunca é salvo em
backup, Drive, dados de saúde, telemetria ou logs. Ele pode ativar uma chave
mesmo sem configuração remota; um kill switch remoto explícito sempre vence.
O frontend só recebe a lista final de chaves habilitadas por `GET /api/experiments`.

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

## Métricas e encerramento

Registre somente a chave e a versão da configuração em métricas agregadas,
respeitando o consentimento de diagnósticos. Avalie exposição, uso, erros e
reversões antes de promover. O percentual cria uma coorte estável e permite
comparar erros de quem recebeu o experimento com quem permaneceu no fluxo
atual. Ao encerrar, remova configuração, gate, código e registro tipado na
mesma entrega.
