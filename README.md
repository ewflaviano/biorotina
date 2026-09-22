# BioDrive (nome provisório)

Projeto em fase de definição. A intenção é criar um aplicativo web gratuito para o usuário registrar e consultar dados pessoais de saúde e bem-estar, com controle sobre seus próprios dados.

## Ideia inicial

- Registros manuais de atividades físicas, refeições, água, medicamentos e peso/IMC.
- Uso local no navegador, com possibilidade de sincronização com o Google Drive do usuário.
- Análise opcional de refeições por IA com chave de API fornecida pelo usuário.
- Sem banco de dados central dos idealizadores na primeira fase.
- Integrações com Apple Health e Health Connect fora do escopo inicial.

## Decisões em aberto

1. Nome e identidade do produto.
2. Experiência de entrada: uso local sem conta e conexão opcional com Google para recuperar dados em outro navegador.
3. Modelo de dados, sincronização, conflitos e recuperação de acesso.
4. Privacidade e segurança dos dados de saúde e das chaves de IA no navegador.
5. Escopo da primeira versão, páginas, fluxos e design.
6. Viabilidade e limites reais das opções de hospedagem, Google Drive e provedores de IA.

Esta documentação registra hipóteses para discussão; ainda não define arquitetura final nem inicia a implementação.

## Planejamento no Vortex

Projeto: **BioDrive (provisório)** (`82E-YHH`).

- `YTF-11098` — Definir nome e posicionamento do produto.
- `YTF-11099` — Definir acesso opcional com Google e sincronização.
- `YTF-11100` — Definir escopo da primeira versão e mapa de páginas.
- `YTF-11101` — Definir privacidade e análise opcional por IA.
- `YTF-11102` — Criar direção visual e design das telas.
