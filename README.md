# Biorotina

**Seu cuidado, no seu ritmo.**

Biorotina é um aplicativo web gratuito em desenvolvimento para acompanhar saúde e bem-estar no dia a dia. O esqueleto atual já permite registrar peso, atividades físicas, refeições, água e medicamentos, incluindo dose e horário de referência. O IMC é calculado a partir da altura informada e do último peso, com classificação de referência para adultos de 18 a 59 anos; não é um diagnóstico. A tela de atividades sugere calorias ajustáveis com base no Compêndio de Atividades Físicas de 2024, duração e peso registrado ou referência explícita de 70 kg.

## Dados sob controle da pessoa

- Uso inicial sem conta, com dados guardados localmente no navegador.
- Exportação e importação de arquivo JSON para cópia e recuperação dos registros.
- Sincronização opcional com o **Google Drive da própria pessoa** está planejada para usar os dados em outro navegador ou dispositivo.
- Sem banco de dados central de registros pessoais operado pelo projeto na primeira fase.

O armazenamento local e a cópia JSON já funcionam. Os históricos permitem excluir registros com opção de **Desfazer** enquanto o app está aberto; Peso, Atividade e Alimentação permitem usar uma entrada como modelo, e Hidratação permite repetir o volume em um toque. Na tela de atividades, os atalhos priorizam o que a pessoa já pratica. Medicamentos podem ser editados e ter vários registros de uso no mesmo dia; cada registro feito por engano pode ser removido. Água e medicamentos permitem vários horários de lembrete. O envio Web Push usa consentimento por dispositivo e um serviço em Rust na AWS, inclusive quando a página está fechada; falta validar a entrega em dispositivos reais. A sincronização com o Google Drive ainda é uma próxima etapa.

O [catálogo de atividades e a fórmula de estimativa](docs/activity-reference.md) documentam os valores usados no preenchimento automático.

## Executar localmente

Requer Node.js recente compatível com Vite 8. Para testar o serviço de lembretes, configure `VITE_PUSH_API_URL` em `.env.local` com a URL pública da API.

```sh
make install
make
```

Abra `http://127.0.0.1:5173/`. `make` (ou `make run`) inicia o servidor local; `make test` executa todos os testes uma vez. `make check` roda a verificação completa e `make help` lista os demais comandos. Os scripts `npm run ...` continuam disponíveis diretamente.

`make build` verifica tipos e gera os arquivos estáticos em `dist/`.

Para manutenção, `make check` executa a checagem do frontend, Clippy e testes Rust; `npm run test:coverage` mostra a cobertura dos testes de interface. No repositório privado [ewflaviano/biorotina](https://github.com/ewflaviano/biorotina), o GitHub Actions valida os pull requests e valida/publica alterações em `master`. Veja [implantação e domínio](docs/deployment.md). A verificação automática de padrões conhecidos não substitui uma revisão completa do histórico antes de abrir o código.

## Estrutura

- `src/domain`: modelo de dados versionado, validação de backup e cálculos básicos.
- `src/storage`: adaptador IndexedDB.
- `src/pages`: áreas iniciais, com interface mobile first e menu “Mais” para manter cinco destinos na barra inferior.
- `docs/architecture.md`: decisões de sincronização, notificações, backend futuro, hospedagem e segurança.

## Design system

- [Guia detalhado](docs/design-system.md): princípios, identidade, cores, tipografia, espaçamento, ícones, componentes, gráficos, conteúdo, acessibilidade e padrões por área do produto.
- [Catálogo visual](docs/design-system.html): exemplos responsivos de tokens, componentes e uma tela inicial conceitual.
- [Tokens CSS](docs/tokens.css): base reutilizável para a futura interface.
- [Arquitetura](docs/architecture.md): dados locais, Google Drive, backend opcional para notificações e cuidados para abrir o código.
- [Próximas etapas](docs/next-steps.md): critérios de entrega para Google Drive e lembretes.
- [Revisão de UX/UI](docs/ux-review.md): passo a passo das telas, ajustes feitos e pontos para próximas iterações.

## Decisões ainda abertas

1. Login e sincronização opcional no Drive, incluindo resolução de conflitos e troca de conta.
2. Edição retroativa de peso, atividade, refeição e água, além de recuperação após perda do navegador. Exclusão com desfazer e migração de dados da versão 1 para a 2 já funcionam.
3. Testes reais de entrega Web Push em Android, desktop e iPhone após a ativação da infraestrutura e do domínio.
4. Viabilidade e limites de análise opcional de refeições por IA com chave fornecida pela pessoa.
5. Definir licença e revisar o histórico completo antes de abrir o projeto no GitHub.

Integrações com Apple Health e Health Connect estão fora do escopo inicial.

## Planejamento no Vortex

Projeto: **Biorotina** (`82E-YHH`).

- `YTF-11098` — Validar disponibilidade do nome Biorotina (pendente).
- `YTF-11099` — Implementar acesso opcional com Google e backup no Drive (próxima etapa 1).
- `YTF-11100` — Definir escopo inicial e mapa de páginas (concluída).
- `YTF-11101` — Definir privacidade e análise opcional por IA (pendente, fora das próximas etapas).
- `YTF-11102` — Criar direção visual e design das telas (concluída).
- `YTF-11103` — Validar lembretes opcionais de hidratação e medicação em dispositivos reais (infraestrutura publicada).
