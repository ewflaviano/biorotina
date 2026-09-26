# Contribuir com a Biorotina

Obrigado por ajudar a tornar o cuidado diário mais simples. A interface é em português do Brasil, funciona primeiro no celular e deve continuar útil sem conta Google. Registros de saúde pertencem à pessoa: ficam no navegador e, se ela escolher, no próprio Google Drive.

## Antes de começar

1. Confira se já existe uma [issue](https://github.com/ewflaviano/biorotina/issues) para o problema ou ideia.
2. Para um erro, abra uma issue pelo modelo **Relatar problema**. Conte o que esperava, o que aconteceu e como reproduzir. Informe navegador, sistema e se estava usando o app pela Tela de Início. **Não inclua** nomes, doses, pesos, arquivos de backup, tokens, endpoints de notificações nem capturas com dados pessoais.
3. Para uma melhoria, use **Sugerir melhoria** e descreva o benefício para quem usa o app. Para mudanças maiores em dados, privacidade ou infraestrutura, espere o alinhamento na issue antes de implementar.
4. Falhas que exponham dados ou credenciais devem ser comunicadas em privado conforme [SECURITY.md](SECURITY.md), sem abrir issue pública.

## Preparar o ambiente

Requisitos: Node.js 24, npm, Rust estável e `make`. O serviço Rust só é necessário para desenvolver avisos; o app pode ser executado sem credenciais de nuvem.

```sh
git clone https://github.com/ewflaviano/biorotina.git
cd biorotina
make install
make
```

Abra `http://127.0.0.1:5173/`. Os dados de teste ficam no navegador. Use um perfil separado se já usa a Biorotina com registros reais.

Para testar Google Drive ou avisos, copie `.env.example` para `.env.local` e preencha apenas identificadores **públicos** de um ambiente seu. A maioria das contribuições de interface e domínio não precisa disso. Nunca coloque client secret, chaves privadas, token de acesso ou credenciais AWS em arquivos `VITE_`: o Vite os envia para todos os navegadores.

## Fazer uma mudança

1. Crie uma branch a partir de `master`, por exemplo `fix/descricao-curta` ou `feat/descricao-curta`.
2. Mantenha a alteração pequena e ligada à issue. Separe regras de dados em `src/domain`, acesso local em `src/storage`, integração Google em `src/sync`, avisos em `src/state` e `push`, e interface em `src/pages` e `src/components`.
3. Siga os [tokens e padrões visuais](docs/design-system.md). Escreva textos para pessoas, sem detalhes de implementação. Preserve teclado, leitores de tela, estados de erro e telas estreitas.
4. Adicione ou ajuste testes quando uma regra, cálculo, migração ou fluxo importante mudar. Para pequenas alterações de texto, confira os testes existentes.
5. Execute as verificações da área alterada:

```sh
npm run check
cargo fmt --manifest-path push/Cargo.toml --check
cargo clippy --manifest-path push/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path push/Cargo.toml
```

`make check` executa tudo de uma vez. `make test` executa os testes de frontend e Rust. Consulte [README.md](README.md) e [docs/architecture.md](docs/architecture.md) para entender o projeto.

### Mudanças de produto entram como experimento

Toda contribuição que altere a experiência, a regra ou o comportamento
percebido por quem usa a Biorotina deve entrar sob um experimento, mesmo que
seja um ajuste pequeno de texto, ordem, cor ou animação. A issue precisa dizer
qual problema será avaliado, qual métrica indica melhora, por quanto tempo será
observada e quando o código será removido.

Antes de abrir o PR:

1. Registre uma chave tipada em `src/experiments/registry.ts` com issue,
   responsável, data de revisão e condição de remoção.
2. Proteja a mudança com `useExperiment()`. O comportamento precisa ficar
   desligado na navegação comum quando não houver configuração remota ou se o
   kill switch estiver ativo. O header de adesão é destinado a contribuintes
   conectados que desejam testar a mudança.
3. Valide localmente com uma conta de teste e
   `BIOROTINA_LOCAL_FORCE_EXPERIMENT=<chave>=enabled npm run local`.
4. Inclua no PR como medir exposição, uso, erros e rollback. Depois da
   liberação gradual, promova ou remova o experimento na issue.

Mudanças exclusivamente internas, documentação e correções que apenas
restauram o comportamento já contratado não precisam de gate, mas o PR deve
explicar por que não há impacto de produto. Uma correção de segurança ou de
indisponibilidade pode ser publicada primeiro e registrada em seguida.

## Abrir um pull request

1. Envie sua branch ao GitHub e abra um PR para `master` usando o modelo do repositório.
2. Vincule a issue, resuma o que mudou e explique como verificou. Se a interface mudou, inclua capturas sem dados pessoais, de preferência em largura de celular.
3. O CI roda em todo PR. Ele sempre verifica a seleção de arquivos e padrões conhecidos de credenciais; também executa as verificações de frontend e/ou backend conforme as áreas alteradas. **PRs não publicam na AWS.**
4. Aguarde os checks e a revisão. Ajuste a branch se houver comentários. Depois do merge em `master`, o CI publica apenas as áreas alteradas.

Não envie arquivos `.env`, backups, dados reais de saúde ou credenciais. O verificador automático de segredos cobre padrões comuns, mas cada contribuição ainda precisa de revisão humana.

## Licença e segurança

Ao contribuir, considere que o código e a documentação original do projeto são publicados sob a [licença MIT](LICENSE). Não inclua dados pessoais nem segredos em código, testes, imagens, issues ou PRs. Os mantenedores revisam o histórico e os alertas de dependências continuamente; uma checagem automática não substitui a revisão humana.
