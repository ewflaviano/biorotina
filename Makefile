.DEFAULT_GOAL := run

.PHONY: run dev local local-api local-reset install test test-watch coverage check build preview lint typecheck format format-check secrets deploy configure-billing configure-experiment help

run:
	npm run dev

dev: run

local:
	npm run local

local-api:
	npm run local:api

local-reset:
	npm run local:reset

install:
	npm ci

test:
	npm run test
	cargo test --manifest-path push/Cargo.toml

test-watch:
	npm run test:watch

coverage:
	npm run test:coverage

check:
	npm run check
	cargo fmt --manifest-path push/Cargo.toml --check
	cargo clippy --manifest-path push/Cargo.toml --all-targets -- -D warnings
	cargo test --manifest-path push/Cargo.toml

deploy:
	PATH="$(CURDIR)/node_modules/.bin:$$PATH" CARGO_BUILD_JOBS=2 OPENSSL_STATIC=1 cargo lambda build --release --disable-optimizations --output-format zip --bins --manifest-path push/Cargo.toml
	cp push/target/lambda/biorotina-api/bootstrap.zip push/target/lambda/biorotina-api.zip
	cp push/target/lambda/biorotina-tick/bootstrap.zip push/target/lambda/biorotina-tick.zip
	cp push/target/lambda/biorotina-billing-api/bootstrap.zip push/target/lambda/biorotina-billing-api.zip
	cp push/target/lambda/biorotina-auth-api/bootstrap.zip push/target/lambda/biorotina-auth-api.zip
	cp push/target/lambda/biorotina-experiments-api/bootstrap.zip push/target/lambda/biorotina-experiments-api.zip
	npx serverless deploy --aws-profile biorotina

configure-billing:
	AWS_PROFILE=biorotina AWS_REGION=sa-east-1 node scripts/configure-billing.mjs

configure-google-oauth:
	AWS_PROFILE=biorotina AWS_REGION=sa-east-1 node scripts/configure-google-oauth.mjs

configure-experiment:
	npm run configure-experiment --

build:
	npm run build

preview:
	npm run preview

lint:
	npm run lint

typecheck:
	npm run typecheck

format:
	npm run format

format-check:
	npm run format:check

secrets:
	npm run check:secrets

help:
	@printf '%s\n' \
	  'make / make run    Inicia o app em http://127.0.0.1:5173/' \
	  'make local         Inicia app e APIs simuladas sem serviços externos' \
	  'make local-api     Inicia somente as APIs simuladas em http://127.0.0.1:8787/' \
	  'make local-reset   Remove os dados descartáveis locais' \
	  'make configure-experiment -- --key demo-highlight --rollout 0 --revision 1  Atualiza um gate remoto' \
	  'make install      Instala dependências com npm ci' \
	  'make test         Executa todos os testes uma vez' \
	  'make test-watch   Executa testes continuamente' \
	  'make coverage     Executa testes com cobertura' \
	  'make check        Roda formatação, lint, segredos, testes e build' \
	  'make build        Gera a versão de produção' \
	  'make preview      Visualiza a versão de produção' \
	  'make lint         Verifica regras de código' \
	  'make typecheck    Verifica os tipos TypeScript' \
	  'make format       Formata o código' \
	  'make format-check Verifica a formatação' \
	  'make secrets      Busca padrões conhecidos de credenciais' \
	  'make deploy       Publica a infraestrutura e API na AWS com o perfil biorotina' \
	  'make configure-billing Configura segredos e webhook após um deploy local'
