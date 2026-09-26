# Ambiente local controlado

O modo local permite testar a Biorotina inteira no navegador sem AWS, Google,
Asaas, Gemini, Firebase ou Web Push reais. Ele usa dados descartáveis em
`.local/biorotina`, diretório ignorado pelo Git.

## Iniciar

```sh
make install
make local
```

O comando abre o app pelo Vite e o simulador em `http://127.0.0.1:8787`.
O app mostra uma faixa verde informando que está em modo local. Essa faixa é a
confirmação visual de que nenhuma integração externa será usada.

O simulador é um adaptador local das APIs de produção e oferece:

- conta de teste `teste.local@biorotina.test` para login e sincronização;
- segunda conta `teste.dois@biorotina.test`, com Drive e plano isolados;
- Drive local com snapshots em `.local/biorotina/state.json`;
- Asaas com checkout simulado e sem cobrança;
- sugestão de refeição simulada;
- Push simulado, sem pedir permissão do navegador nem enviar notificações;
- endpoint de telemetria salvo em `.local/biorotina/telemetry.jsonl`.

Para começar novamente, pare o processo e execute:

```sh
make local-reset
```

Para iniciar o segundo usuário de teste, use
`BIOROTINA_LOCAL_TEST_USER=2 make local`. Cada execução pode usar uma porta de
API diferente com `BIOROTINA_LOCAL_API_PORT`, se necessário.

Para validar um gate de experimento com o primeiro testador, use:

```sh
BIOROTINA_LOCAL_FORCE_EXPERIMENT=demo-highlight=enabled make local
```

Na página inicial, o texto muda para **Seu dia, com um toque novo**, o painel
violeta aparece e **Confirmar teste** deve receber confirmação da API local.

## Roteiro no navegador

1. Confira a faixa **Modo local** no topo.
2. Registre água, refeição, medida, atividade, medicamento e hábito.
3. Entre com a conta de teste, ative o Drive e confira o status sincronizado.
4. Atualize a página e valide a restauração da sessão e do snapshot.
5. Reinicie com `BIOROTINA_LOCAL_TEST_USER=2` e confirme que o Drive começa
   vazio; os dados do primeiro usuário não podem aparecer.
6. Ative avisos e envie um teste: a interface deve indicar que o envio foi
   simulado.
7. Abra o plano, teste a análise de foto e o checkout. O checkout deve abrir a
   página local **Checkout simulado**.
8. Gere uma falha controlada quando necessário e confira o evento estruturado
   em `telemetry.jsonl`.

## Integrações reais de teste

Google OAuth, Asaas e Gemini de sandbox continuam opcionais. Quando forem
configurados, use contas e projetos exclusivos de teste, nunca contas pessoais
ou credenciais de produção. Antes de criar esse modo, documente o contrato e
adicione uma verificação que impeça apontar o ambiente local para produção.

## Verificação

```sh
node --test scripts/local-api.check.mjs
```

Esse teste sobe o simulador em uma porta temporária e verifica sessão, CORS,
isolamento de Drive, telemetria e checkout sem acessar a rede externa.
