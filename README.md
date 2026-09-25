# Biorotina

**Seu cuidado, no seu ritmo.**

Biorotina é um aplicativo web gratuito, feito primeiro para celular, para acompanhar saúde e bem-estar no dia a dia. Permite registrar peso, atividades físicas, refeições, água, medicamentos e hábitos. Água, medicamentos e hábitos podem ter horários de lembrete; medicamentos e hábitos também aceitam dias específicos da semana. O IMC é calculado a partir da altura informada e do último peso, com classificação de referência para adultos de 18 a 59 anos; não é um diagnóstico. A tela de atividades sugere calorias ajustáveis com base no Compêndio de Atividades Físicas de 2024, duração e peso registrado ou referência explícita de 70 kg.

## Dados sob controle da pessoa

- Uso inicial sem conta, com dados guardados localmente no navegador.
- Exportação e importação de arquivo JSON para cópia e recuperação dos registros.
- Sincronização opcional com o **Google Drive da própria pessoa** para usar os dados em outro navegador ou dispositivo.
- Registros locais separados por conta Google. Ao sair, o app apaga os dados e a chave pessoal deste navegador; se houver alterações pendentes, oferece esperar, baixar JSON ou apagar sem backup.
- Sem banco de dados central de registros de saúde operado pelo projeto; o serviço de avisos guarda dados técnicos da inscrição e horários. O plano de IA guarda somente estado da assinatura e uso diário.
- Métricas de acesso e diagnósticos de erros opcionais, sem publicidade e sem envio de registros de saúde. Um aviso breve permite aceitar ou recusar; a escolha pode ser alterada em Configurações.

O armazenamento local, a cópia JSON e a sincronização automática opcional com o Drive já funcionam. Os históricos permitem excluir registros com opção de **Desfazer** enquanto o app está aberto; Peso, Atividade e Alimentação têm a ação **Repetir**, que prepara um novo registro sem salvá-lo automaticamente, e Hidratação permite repetir o volume em um toque. Na tela de atividades, os atalhos priorizam o que a pessoa já pratica. Medicamentos podem ser editados e ter vários registros de uso no mesmo dia; cada registro feito por engano pode ser removido. O envio Web Push usa consentimento por dispositivo e um serviço em Rust na AWS, inclusive quando a página está fechada; a entrega agendada foi confirmada em iPhone e Android.

No celular, há um convite discreto para adicionar a Biorotina à tela inicial e uma página com instruções para Safari e Chrome. A página **Apoiar** permite enviar opiniões por e-mail e apresenta um Pix estático opcional para financiar o projeto. O código-fonte é disponibilizado sob a [licença MIT](LICENSE).

Quem quiser colaborar pode começar pelo [guia de contribuição](CONTRIBUTING.md) e pelas [issues](https://github.com/ewflaviano/biorotina/issues). Questões sensíveis devem seguir a [política de segurança](SECURITY.md). O CI valida todo pull request; publicação na AWS ocorre apenas após merge em `master`.

A análise opcional de uma refeição por foto pode usar uma chave Gemini da própria pessoa, até cinco análises gratuitas por conta quando o teste está habilitado, ou o plano mensal da Biorotina. A imagem é reduzida a no máximo 768 px por lado e cerca de 350 KB no aparelho e só é enviada após tocar em **Analisar foto**. A sugestão pode ser corrigida antes de salvar; foto e chave pessoal não entram no backup ou no Drive. A chave pessoal fica em IndexedDB. O plano exige login Google, usa checkout externo do Asaas e limita a dez análises bem-sucedidas por dia. O fluxo de cobrança está implantado; renovação, reembolso, cancelamento e recuperação de falhas ainda precisam de testes operacionais completos antes de ampliar o acesso.

O [catálogo de atividades e a fórmula de estimativa](docs/activity-reference.md) documentam os valores usados no preenchimento automático.

## Executar localmente

Requer Node.js recente compatível com Vite 8. Para testar o serviço de lembretes, configure `VITE_PUSH_API_URL` em `.env.local` com a URL pública da API. Para conectar o Drive, configure `VITE_GOOGLE_CLIENT_ID` com o identificador público de um cliente OAuth Web cujas origens incluam `http://127.0.0.1:5173` e `http://localhost:5173`. O cliente de produção deve autorizar `https://biorotina.app.br`; não use client secret no frontend.

```sh
make install
make
```

Abra `http://127.0.0.1:5173/`. `make` (ou `make run`) inicia o servidor local; `make test` executa todos os testes uma vez. `make check` roda a verificação completa e `make help` lista os demais comandos. Os scripts `npm run ...` continuam disponíveis diretamente.

`make build` verifica tipos e gera os arquivos estáticos em `dist/`.

Para manutenção, `make check` executa a checagem do frontend, Clippy e testes Rust; `npm run test:coverage` mostra a cobertura dos testes de interface. No [repositório do projeto](https://github.com/ewflaviano/biorotina), o GitHub Actions valida os pull requests e valida/publica alterações em `master`. Veja [implantação e domínio](docs/deployment.md). A verificação automática de padrões conhecidos nos arquivos e no histórico não substitui uma revisão humana contínua.

## Estrutura

- `src/domain`: modelo de dados versionado, validação de backup e cálculos básicos.
- `src/storage`: adaptador IndexedDB.
- `src/sync`: login Google, adaptador Drive e decisão de sincronização.
- `src/pages`: áreas iniciais, com interface mobile first e menu “Mais” para manter cinco destinos na barra inferior.
- `docs/architecture.md`: decisões de sincronização, notificações, backend, hospedagem e segurança.

## Design system

- [Guia detalhado](docs/design-system.md): princípios, identidade, cores, tipografia, espaçamento, ícones, componentes, gráficos, conteúdo, acessibilidade e padrões por área do produto.
- [Catálogo visual](docs/design-system.html): exemplos responsivos de tokens, componentes e uma tela inicial conceitual.
- [Tokens CSS](docs/tokens.css): base de cores, tipografia e espaçamento usada pela interface.
- [Arquitetura](docs/architecture.md): dados locais, Google Drive, serviço de notificações e segurança.
- [Próximas etapas](docs/next-steps.md): critérios de entrega para Google Drive e lembretes.
- [Revisão de UX/UI](docs/ux-review.md): passo a passo das telas, ajustes feitos e pontos para próximas iterações.
- [Instalação no celular](docs/installation.md): convite, compatibilidade e transferência de registros.
- [Apoio ao projeto](docs/support.md): feedback por e-mail e manutenção do Pix estático.
- [Assinatura e webhook](docs/billing.md): fluxo, configuração do Asaas e homologação.
- [Roteiro de testes no navegador](docs/manual-browser-test.md): casos reproduzíveis sem login, com teste grátis e com plano ativo.
- [Recuperação de dados](docs/data-recovery.md) e [auditoria de dependências](docs/dependency-audit.md): verificações operacionais e riscos conhecidos.

## Decisões ainda abertas

1. Validar restauração e conflitos de sincronização em dois dispositivos reais; confirmar a disponibilidade pública do consentimento OAuth.
2. Edição retroativa de peso, atividade, refeição e água, além de recuperação após perda do navegador. Exclusão com desfazer e migração de dados antigos para a versão 4 já funcionam.
3. Continuar testes de Web Push em desktop e revisar a operação do serviço; iPhone e Android receberam avisos agendados.
4. Ampliar os testes de foto e cobrança em dispositivos e contas de teste, incluindo renovação, reembolso, limites e falhas temporárias. O [relatório da rodada no navegador](docs/manual-browser-test-runs/2026-09-24.md) separa o que já passou do que ainda não foi executado.
5. Definir o destino dos alertas operacionais; hoje o alarme da fila de falhas de cobrança não tem destinatário. Reavaliar a dependência vulnerável de desenvolvimento do Serverless Framework e o aviso residual de `rsa` conforme a [auditoria](docs/dependency-audit.md).
6. Manter a revisão de segredos, dependências e permissões do CI. A proteção de `master` já exige PR e checks aprovados; métricas e diagnósticos permanecem desligados até a escolha da pessoa.

## Licença

O código-fonte e a documentação original da Biorotina estão sob [MIT](LICENSE). Dependências e materiais de terceiros mantêm suas próprias licenças; a fonte DM Sans distribuída no projeto inclui seu aviso [OFL](docs/assets/OFL.txt). O campo `private: true` do npm apenas impede publicação acidental do pacote, sem limitar a licença do código.

Integrações com Apple Health e Health Connect estão fora do escopo inicial.

