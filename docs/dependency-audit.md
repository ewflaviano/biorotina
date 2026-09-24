# Auditoria de dependências

Na revisão de 24/09/2026, `cargo audit --file push/Cargo.lock` encontrou cinco
avisos: um em `h2` 0.3, três em `rustls-webpki` 0.101 e um em `rsa` 0.9.
Desabilitar as opções legadas dos SDKs AWS remove os quatro primeiros do
grafo de produção; as funções continuam usando o cliente HTTPS atual do SDK.
Testes e compilação precisam acompanhar essa alteração, e a API de avisos deve
ser conferida depois do deploy para validar credenciais e TLS na Lambda.

O aviso restante, `RUSTSEC-2023-0071`, chega por `web-push` → `jwt-simple` →
`superboring` → `rsa`. O código de VAPID da biblioteca usa `ES256KeyPair`, não
uma operação de decriptação RSA com chave privada. Isso **sugere que o vetor
descrito no aviso não é alcançado neste uso**, mas não remove a dependência nem
constitui prova formal de ausência de risco. Ainda não existe uma versão
corrigida de `rsa` para esse aviso. Manter visível em auditorias futuras e
reavaliar quando `web-push`/`jwt-simple` permitir eliminá-la ou quando sair
uma correção. Não silenciar o aviso sem esta justificativa.

`npm audit --omit=dev --audit-level=high` passa para o código do app. A auditoria
com dependências de desenvolvimento encontra `decompress` 4.2.1, incluído pelo
Serverless Framework 3.40.0. Não há versão corrigida publicada de
`decompress`; o `npm audit` sugere migrar para Serverless 4. Essa versão exige
autenticação na pipeline e tem termos de licença diferentes, portanto não se
deve trocá-la sem preparar as credenciais e confirmar a elegibilidade. Até lá,
o utilitário permanece apenas no ambiente de build/deploy, com dependências
travadas no lockfile, ações de CI fixadas por commit e permissão AWS limitada.

Antes de abrir o repositório ao público, repetir ambas as auditorias, revisar
os termos do Serverless 4 e decidir a migração ou outra ferramenta de deploy.

Referências: [aviso RSA](https://github.com/RustCrypto/RSA/security/advisories/GHSA-c38w-74pg-36hr),
[código VAPID do web-push](https://github.com/pimeys/rust-web-push/blob/master/src/vapid/key.rs),
[migração do Serverless 4](https://www.serverless.com/framework/docs/guides/upgrading-v4).
