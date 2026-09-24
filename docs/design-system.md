# Biorotina Design System

**Versão:** 1.0 · **Estado:** guia visual do app em evolução · **Idioma:** português do Brasil · **Tema:** claro

> **Seu cuidado, no seu ritmo.** Um diário pessoal de saúde e bem-estar que ajuda a reconhecer padrões sem julgar a pessoa. A interface deve transmitir calma, clareza e controle sobre os próprios dados.

Este documento reúne as regras visuais e de conteúdo da interface. Os valores prontos para CSS estão em [`tokens.css`](tokens.css); o [`catálogo visual`](design-system.html) demonstra a aparência e estados principais. Exemplos conceituais do catálogo podem diferir de telas já implementadas; consulte o código do app para o comportamento atual.

## 1. Referências e decisões

| Referência consultada | Observação aplicada à Biorotina |
| --- | --- |
| [Google Design, projeto Fitbit](https://design.google/library/the-goal-behind-the-goal) | Formas suaves, leitura rápida e uma linguagem compassiva; a informação de saúde depende do contexto da pessoa. |
| [Fitbit, apresentação do aplicativo renovado](https://blog.google/products-and-platforms/devices/fitbit/introducing-the-all-new-fitbit-app/) | Visão diária com indicadores relevantes primeiro e organização personalizável. |
| [Samsung Health](https://www.samsung.com/us/apps/samsung-health/) | Saúde cotidiana reúne atividades, alimentação e medicamentos; cada registro pede campos e resumos próprios. |
| [Apple, diretrizes de HealthKit](https://developer.apple.com/design/human-interface-guidelines/healthkit/) | Dados sensíveis exigem propósito e permissões explicados no momento certo. A Biorotina não integra HealthKit na primeira fase. |
| [W3C, WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Contraste, foco visível, controle por teclado, texto redimensionável e alvos de interação verificáveis. |

**Interpretação própria:** verde sálvia + branco para tranquilidade; verde profundo para ações acessíveis; azul reservado a informação e sincronização. Não reproduzir telas, ícones proprietários nem anéis de atividade de outros produtos.

## 2. Princípios de experiência

1. **Acompanhamento sem julgamento.** Mostrar tendências e fatos; evitar termos como “fracasso”, “culpa”, “dia ruim” ou mensagens que reduzam saúde a peso.
2. **Registrar em poucos passos.** A ação principal do dia fica visível; campos avançados aparecem quando necessários. Salvar um registro básico deve levar a uma única tela.
3. **Contexto antes de interpretação.** Todo número tem unidade, data, origem e comparação definida. IMC é um indicador calculado e não um diagnóstico.
4. **Privacidade compreensível.** Exibir onde os dados estão, a data do último backup e o resultado de cada exportação/sincronização. Nunca insinuar que armazenamento local equivale a backup.
5. **Controle reversível.** Editar, desfazer, exportar e excluir devem ser encontráveis. Antes de importar ou resolver conflitos, mostrar o que será substituído.
6. **Progresso humano.** A interface acolhe pausas e recomeços. Não usar sequências obrigatórias, alertas alarmistas nem premiação por medicação.

## 3. Nome, voz e marca

- Nome exibido: **Biorotina**, sem caixa alta integral. Arquivo e metadados: `biorotina`.
- Assinatura: **Seu cuidado, no seu ritmo.**
- Voz: clara, gentil, objetiva, sem intimidade forçada. Tratar a pessoa por “você”; botões com verbos diretos: “Registrar peso”, “Salvar refeição”, “Exportar dados”.
- Marca gráfica proposta: **uma folha atravessada por um caminho curvo**, dentro de um quadrado arredondado. O [SVG da marca](assets/biorotina-mark.svg) é independente do símbolo de Apple Health e de qualquer ícone de terceiros. Em tamanhos abaixo de 24 px, usar versão simplificada monocromática.
- Uso do logotipo: 24 px de respiro mínimo; fundo branco ou verde muito claro; não aplicar gradiente, contorno pesado ou sombra. O nome em DM Sans 700 com leve aproximação (`letter-spacing: -0.03em`).
- Mensagem de valor: “Registre o que importa para você. Seus dados ficam no seu navegador e podem ser exportados ou sincronizados com seu Google Drive, se você escolher.”

## 4. Cores

### 4.1 Paleta base

As cores claras são fundos e destaques suaves; textos e ações usam tons escuros para manter legibilidade. Não usar verde claro com texto branco.

| Escala | 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Verde | `#F2F9F4` | `#E5F3E9` | `#CCE6D4` | `#A8D3B6` | `#76B993` | `#4A9876` | `#3C755F` | `#205C4F` | `#174B41` | `#123B34` |

| Neutro | Valor | Uso |
| --- | --- | --- |
| 0 | `#FFFFFF` | cartão, modal, controle |
| 50 | `#F6FAF7` | fundo de página |
| 100 | `#EEF4F0` | controle inativo, trilho |
| 200 | `#D9E4DC` | divisória e borda |
| 300 | `#BDCFC3` | borda forte |
| 500 | `#49645B` | texto secundário |
| 700 | `#314B42` | apoio em alto contraste |
| 900 | `#1D342E` | texto principal |

| Apoio | Fundo claro | Cor forte | Papel |
| --- | --- | --- | --- |
| Azul | `#EDF6FA` | `#286482` | informação, link, sincronização, atividade |
| Âmbar | `#FFF7EA` | `#9C5A18` | atenção sem urgência, alimentação em gráficos |
| Vermelho | `#FFF0ED` | `#A8513B` | erro e exclusão; nunca para classificar corpos |
| Roxo | — | `#69558A` | medicamentos em gráficos, sempre com rótulo |

### 4.2 Papéis semânticos

| Token | Valor claro | Aplicação |
| --- | --- | --- |
| `--color-canvas` | neutro 50 | fundo geral |
| `--color-surface` | branco | cartões, formulários, navegação |
| `--color-surface-tint` | verde 50 | bloco de boas-vindas e informações leves |
| `--color-text` | neutro 900 | texto, números, títulos |
| `--color-text-secondary` | neutro 500 | legenda e metadados |
| `--color-action` | verde 700 | botão primário, link de ação |
| `--color-action-hover` | verde 800 | hover |
| `--color-action-pressed` | verde 900 | pressed |
| `--color-focus` | azul 700 | contorno de teclado |
| `--color-border` | neutro 200 | separação leve |
| `--color-info/success/warning/danger` | tons 700 | texto e ícone de status |

Distribuição visual sugerida: cerca de **70% branco/neutros**, **20% superfícies esverdeadas** e **10% verde profundo/cores de status**. É uma orientação de equilíbrio, não uma regra de medição. Não usar cor sozinha para transmitir estado; combinar com ícone e texto. Cor de marca e branco têm contraste aproximado de **7,8:1**; texto principal e branco, **13,3:1**. Verificar cada combinação concreta na implementação.

**Tema escuro:** fora da primeira entrega. A arquitetura semântica permite adicionar valores novos sem mudar os nomes dos tokens; não inverter a paleta automaticamente.

## 5. Tipografia

Família única: **DM Sans**, pesos 400, 500, 600 e 700. Fallback: `system-ui`, fonte do sistema, sans-serif. A fonte é aberta e disponível em [Google Fonts](https://fonts.google.com/specimen/DM+Sans); o catálogo usa uma cópia local da fonte e inclui a licença em [`assets/OFL.txt`](assets/OFL.txt). O aplicativo em produção deve conservar a hospedagem local para evitar solicitação externa e reduzir exposição de metadados de navegação.

| Estilo | Desktop | Mobile | Peso | Entrelinha | Uso |
| --- | --- | --- | --- | --- | --- |
| Display | 44 px | 36 px | 700 | 1,12 | abertura e comunicações curtas |
| H1 | 32 px | 28 px | 700 | 1,2 | título de página |
| H2 | 24 px | 22 px | 700 | 1,28 | seções principais |
| H3 | 20 px | 18 px | 600 | 1,35 | cartão ou subseção |
| Corpo grande | 18 px | 18 px | 400 | 1,55 | introdução |
| Corpo | 16 px | 16 px | 400 | 1,5 | leitura e formulários |
| Corpo compacto | 14 px | 14 px | 400/500 | 1,45 | dados auxiliares, nunca texto essencial isolado |
| Legenda | 12 px | 12 px | 500 | 1,4 | unidade, fonte, timestamp; oferecer contexto acessível |
| Métrica | 32 px | 30 px | 700 | 1,1 | peso, tempo, contagem; `font-variant-numeric: tabular-nums` |
| Botão | 15 px | 15 px | 600 | 1,2 | ações |

Títulos usam `letter-spacing: -0.025em`; métricas, `-0.02em`; demais textos, espaçamento normal. Alinhar texto à esquerda. Não usar caixa alta em parágrafos, placeholders ou dados de saúde. Limitar blocos longos a 65–75 caracteres por linha. Permitir ampliação a 200% sem perda de conteúdo.

## 6. Espaçamento, layout e forma

Escala de 4 px: `0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80`. Usar os tokens `--space-*` em vez de valores dispersos. Pares preferidos:

| Contexto | Espaço |
| --- | --- |
| Ícone + rótulo | 8 px |
| Rótulo + campo | 8 px |
| Campos relacionados | 16 px |
| Conteúdo interno de card | 20–24 px |
| Cards vizinhos | 16 px mobile; 20–24 px desktop |
| Título da seção + conteúdo | 16–24 px |
| Seções de página | 40 px mobile; 48–64 px desktop |

- **Grade desktop:** conteúdo até 1200 px; margens mínimas de 32 px; 12 colunas com intervalos de 24 px. Menu lateral, se existir, ocupa 240–260 px.
- **Tablet (768–1199 px):** 8 colunas, margens de 24 px, intervalo de 20 px.
- **Mobile (<768 px):** 4 colunas, margens de 16 px, intervalo de 16 px; cartões em uma coluna, sem rolagem horizontal.
- **Leitura longa:** largura máxima de 720 px.
- **Áreas seguras:** barra inferior e ação fixa respeitam `env(safe-area-inset-bottom)`.
- **Raios:** 6 px para detalhes pequenos; 10 px controles; 14 px cartões compactos; 20 px cartões principais; 28 px destaques; pílula 999 px para chips.
- **Elevação:** borda leve primeiro. Sombra pequena apenas em superfície elevada; sombra média em popover; grande em modal. Evitar card sobre card com sombras repetidas.

## 7. Ícones e ilustração

Estilo: ícones lineares arredondados, grade de **24 × 24 px**, traço de **1,75–2 px**, `stroke-linecap: round`, `stroke-linejoin: round`, sem preenchimento decorativo. Usar um único conjunto no produto; sugestão de implementação: [Lucide](https://lucide.dev/icons/), usando nomes equivalentes aos abaixo. O catálogo inclui SVG simples próprios apenas para demonstrar a direção. Ícones não substituem rótulos em ações importantes.

| Área/ação | Ícone sugerido | Rótulo visível |
| --- | --- | --- |
| Início | `house` | Hoje |
| Peso | `scale` | Peso |
| Atividade | `activity` | Atividades |
| Alimentação | `utensils` | Alimentação |
| Medicamentos | `pill` | Medicamentos |
| Hidratação | `droplets` | Hidratação |
| Adicionar | `plus` | Registrar |
| Histórico | `calendar-days` | Histórico |
| Backup local | `download` | Exportar JSON |
| Restaurar | `upload` | Importar JSON |
| Sincronização | `cloud` / `cloud-off` | Sincronização / Sem conexão |
| Privacidade | `shield-check` | Seus dados |
| Informação | `info` | Sobre este indicador |

Tamanhos: 16 px junto a metadados, 20 px em controles, 24 px em navegação e 32 px em estados vazios. Área clicável mínima da ação: **44 × 44 px**. Ícone decorativo recebe `aria-hidden="true"`; botão só com ícone requer nome acessível, dica e confirmação de significado. Ilustrações: contornos simples, formas naturais, poucos detalhes, sem fotografias idealizadas de corpos nem símbolos clínicos alarmistas.

## 8. Componentes e estados

### 8.1 Navegação e cabeçalho

- Desktop: barra lateral com Hoje, Peso, Atividades, Alimentação, Medicação, Hidratação e Configurações; item ativo tem fundo verde 100 e rótulo verde 800. Cabeçalho contém contexto e acesso às configurações.
- Mobile: navegação inferior com cinco destinos curtos (Hoje, Peso, Atividade, Água, Mais), mantendo os nomes completos como rótulos acessíveis. “Mais” dá acesso a Alimentação, Medicação e Configurações; os cartões do painel também levam diretamente a cada área. Validar legibilidade a partir de 320 px.
- Breadcrumb apenas em níveis acima de dois. Voltar preserva campos não salvos ou pede confirmação de descarte.

### 8.2 Botões

| Variante | Aparência | Uso |
| --- | --- | --- |
| Primário | verde 700, texto branco | uma ação principal por região |
| Secundário | branco, borda neutra 300, texto verde 800 | ação alternativa |
| Suave | verde 100, texto verde 800 | ações contextualizadas |
| Texto | sem fundo, texto verde 700 | baixa ênfase |
| Perigoso | vermelho 700, texto branco ou fundo vermelho 50 | exclusão, com confirmação |

Altura padrão **48 px**, compacto **40 px** somente em espaço restrito, alvo mínimo **44 px** mesmo em ícone compacto; raio 10 px; padding horizontal 16–20 px. `hover` muda tom, `pressed` escurece, `focus-visible` usa contorno azul de 3 px; `loading` mantém largura e informa progresso; `disabled` explica por que a ação não está disponível. O texto deve descrever o efeito: “Salvar medicamento” em vez de “Concluir”.

### 8.3 Campos e seleção

Campo com rótulo persistente acima, ajuda abaixo e mensagem de erro próxima ao campo. Placeholder só exemplifica formato: “Ex.: 72,4”; nunca é o único rótulo. Altura 48 px; borda neutra 300; raio 10 px; padding 12–14 px. Foco: borda e anel azul. Erro: borda vermelha, texto “Informe uma dose maior que zero” e ligação via `aria-describedby`. Valores numéricos aceitam vírgula no pt-BR; guardar valor normalizado no modelo de dados. Unidades sempre explícitas e associadas ao valor.

Campos mínimos por tipo:

| Registro | Primeiro passo | Detalhes opcionais |
| --- | --- | --- |
| Peso | valor, unidade, data/hora | observação, origem da medida |
| Atividade | tipo, duração, data | intensidade percebida, distância, observação |
| Alimentação | refeição/descrição, data/hora | ingredientes, quantidade, observação |
| Medicamento | nome, dose, unidade, horário/frequência | instruções livres, período, observação |
| Hidratação | quantidade em ml, data/hora | horários desejados para lembretes |

Separar **medicamento planejado** de **uso registrado**. Não registrar um uso automaticamente após criar um agendamento. Dose e unidade aparecem juntas no resumo (“500 mg”), mas permanecem campos distintos nos dados. Na interface, usar “Registrar uso” e, após o primeiro registro do dia, “Registrar outro uso”; não limitar a um uso diário. “Remover último” altera apenas o diário, não o uso real do medicamento, e não apaga os outros registros.

### 8.4 Cards, chips e alertas

- Card de métrica: título, valor com unidade, intervalo de tempo, indicação de tendência apenas se houver dados suficientes, e ação “Ver histórico”. Nunca usar seta sem explicar período/comparação. Valores calculados ou classificados oferecem um ícone de informação acionável por toque/teclado que expande método e fonte na própria tela.
- Card de registro: tipo, descrição, data/hora, ação de editar e menu de opções. Dados sensíveis não aparecem em notificação ou prévia compartilhável por padrão.
- Chip de filtro: borda neutra, selecionado com fundo verde 100 e marca de seleção. Estados acessíveis por `aria-pressed` ou `aria-selected` conforme o componente.
- Banner informativo: fundo azul 50, ícone e mensagem; aviso: âmbar 50; erro: vermelho 50; sucesso: verde 100. Cor sempre acompanha texto.
- Banner de desfazer: acompanha exclusões reversíveis, permanece visível durante a sessão até a pessoa desfazer ou dispensar e funciona após trocar de tela. Não é o único lugar de uma informação crítica.
- Estado vazio: explicar benefício, oferecer primeira ação e jamais sugerir que a pessoa está “atrasada”. Ex.: “Ainda não há registros de atividade. Registre uma caminhada ou outro movimento quando fizer sentido para você.”

### 8.5 Modal e confirmação

Usar confirmação para ações com efeito em vários registros, como excluir um medicamento e seus registros de uso ou substituir os dados em uma importação. Exclusão de uma entrada isolada oferece “Desfazer” imediato. Uma confirmação customizada futura deve usar largura de 440 / 620 px, foco contido e retorno ao acionador. Descrever impacto com itens concretos e rótulo específico, nunca um genérico “OK”.

## 9. Padrões por área do produto

### 9.1 Hoje

Ordem sugerida: saudação breve e data; ação “Registrar”; visão compacta dos itens que a pessoa escolheu acompanhar; últimos registros; estado dos dados. A pessoa pode ocultar cartões e reordenar prioridades. Não criar pontuação única de “saúde” a partir de métricas heterogêneas. Sem dados, mostrar convite simples para registrar o primeiro item.

### 9.2 Peso e IMC

Mostrar peso atual, unidade e data da medida. Gráfico por semana/mês/ano com eixo e unidades visíveis; valores exatos acessíveis em tabela. Evitar escala truncada que amplifique pequenas oscilações. IMC = peso em kg / altura em metros², calculado apenas se houver altura informada e medida de peso válida. As categorias abaixo do peso, peso adequado, sobrepeso e obesidade graus I–III usam as [faixas do Ministério da Saúde para adultos de 18 a 59 anos](https://linhasdecuidado.saude.gov.br/portal/obesidade-no-adulto/unidade-de-atencao-primaria/rastreamento-diagnostico/). Exibir a faixa etária e a mensagem **“IMC é uma estimativa e não descreve sua saúde sozinho.”** Sem metas ou faixas coloridas por padrão. Outras idades exigem critérios diferentes. A tela recusa entradas acima de 350 kg ou fora de 50–250 cm como provável erro de digitação; não altera registros antigos automaticamente.

### 9.3 Atividades físicas

Registrar tipo livre ou escolhido, duração, data e detalhes opcionais. Os atalhos exibem primeiro os tipos que a pessoa já registrou, ordenados por uso recente e sem duplicatas; tocar em um deles prepara um novo registro com os detalhes do último uso. Completar os espaços com sugestões gerais. Visualizar volume em minutos e frequência, deixando clara a janela temporal. Atividades do catálogo usam METs do [Compêndio de 2024](https://pacompendium.com/adult-compendium/) e sua [fórmula de conversão](https://pacompendium.com/unite-conversions/) para sugerir kcal/min conforme o peso; sem peso, usar referência explícita de 70 kg. Manter o campo opcional, editável e identificar estimativas no histórico. Não estimar atividades livres sem correspondência, não comparar pessoas e não penalizar dias sem atividade. O histórico deve permitir editar registros retroativos.

### 9.4 Alimentação

Priorizar descrição de refeição e horário. Quantidades e detalhes nutricionais são opcionais; não impor contagem de calorias. Visualizar refeições como linha do tempo. Se análise por IA vier a existir, diferenciar claramente texto fornecido pela pessoa, estimativa gerada e dado confirmado; oferecer revisão antes de salvar.

### 9.5 Medicamentos

Identificar nome, apresentação, dose, unidade, frequência e período; horários são configuráveis. Distinguir “planejado”, “uso registrado”, “ignorado” e “sem informação”. Permitir vários registros de uso por medicamento no mesmo dia, com horário individual. O app registra dados informados pela pessoa; não recomenda iniciar, suspender ou alterar dose. Confirmações de uso mostram medicamento, dose e horário. Lembretes, quando implementados, dependerão de permissão e inscrição de push por dispositivo, com envio genérico por um backend mínimo; devem revelar limites do navegador e permitir desativação. Mensagens nunca dizem que um medicamento foi usado sem ação explícita ou dado importado confiável.

### 9.6 Hidratação

Mostrar o total de água registrado no dia e a lista de entradas com quantidade e horário. Atalhos de 200, 250 e 500 ml ajudam no celular, sem impor meta universal. Permitir vários horários diários de lembrete, sempre descritos como preferências salvas até existir serviço de notificação com consentimento por dispositivo. Nenhum horário salvo deve ser apresentado como aviso ativo.

### 9.7 Seus dados, backup e sincronização

“Seus dados” tem posição de destaque. Na primeira utilização, mostrar “Salvo neste navegador” e explicar que limpar dados do navegador ou trocar de dispositivo pode remover registros. Exportação JSON oferece nome de arquivo com data, confirma quantidade e data do backup e não marca download iniciado como concluído até haver resultado observável. Importação mostra versão do arquivo, resumo de tipos/quantidades e opções seguras antes de aplicar. Excluir dados locais exige confirmação clara.

Google Drive é **opcional**. Exibir estados: “Não conectado”, “Conectando”, “Sincronizando”, “Sincronizado em [data/hora]”, “Sem conexão”, “Conflito para resolver” e “Falha ao sincronizar”. Não chamar dados locais de “sincronizados” sem confirmação. Explicar que o Drive pertence à conta conectada e que uma cópia JSON continua útil. A resolução de conflito deve mostrar datas e quantidades das versões e permitir baixar uma cópia antes de substituir. Escopo técnico de permissões e mecanismo de sincronização ainda serão definidos.

## 10. Dados, gráficos e formatação

- Toda métrica: **nome + valor + unidade + data/período + origem**, com ajuda contextual quando necessário.
- Data/hora: `23 set 2026, 14:30`; histórico pode agrupar por “Hoje”, “Ontem” e data completa. Evitar apenas “há 2 dias” para medicamentos.
- Números pt-BR: `72,4 kg`, `1,68 m`, `35 min`, `500 mg`; separar número e unidade em elementos semânticos se a apresentação exigir estilos diferentes.
- Gráficos: eixo legível, legenda escrita, texto alternativo resumindo tendência e tabela de dados. Peso verde, atividade azul, alimentação âmbar, medicamentos roxo. A diferenciação também usa forma/traço, não só cor.
- Sem dados suficientes, ocultar tendência e informar “Adicione mais registros para ver a evolução”. Não suavizar curvas de modo a criar valores que nunca foram registrados.
- Métricas derivadas precisam de fórmula, período, origem e opção para conferir entradas usadas.

## 11. Movimento e responsividade

Transições: 120 ms em hover/pressed, 200 ms em abertura leve, 320 ms em modal; curva `cubic-bezier(.2, 0, 0, 1)`. Movimento comunica relação entre origem e destino, nunca recompensa registro de peso ou dose. Respeitar `prefers-reduced-motion` e oferecer interface estática equivalente. Carregamento de sincronização usa texto de estado e indicador discreto; evitar animações infinitas sem explicação.

Ao reduzir a largura: cartões empilham, rótulos continuam visíveis, tabelas viram listas ou têm rolagem identificada, controles não ficam abaixo da navegação fixa. Testar 320, 375, 768 e 1280 px, teclado e ampliação de texto.

## 12. Acessibilidade e critérios de aceite

Alvo: **WCAG 2.2 nível AA**. Texto comum com contraste ≥ 4,5:1; texto grande e elementos gráficos essenciais ≥ 3:1; foco evidente; ordem de tabulação lógica; navegação completa por teclado; rótulos explícitos; erros em texto; estado comunicado também a tecnologias assistivas. Alvos visuais principais de 44 × 44 px (acima do mínimo de WCAG para conforto no toque). O aumento de texto para 200% não deve esconder campos ou ações.

Checklist para cada tela:

1. Há um H1 único e hierarquia de títulos consistente?
2. O dado mais importante tem unidade, data e origem?
3. Cores de texto, ícones funcionais e foco foram medidas sobre o fundo real?
4. Ações por ícone têm nome acessível, e estados são entendidos sem cor?
5. Erros são próximos dos campos e podem ser anunciados?
6. Navegação, modal, importação e confirmação funcionam por teclado?
7. Textos de privacidade correspondem ao comportamento real do produto?
8. A tela comunica limites de um dado calculado ou incompleto?

## 13. Implementação e evolução

- Componentes devem consumir tokens semânticos de `tokens.css`; hexadecimais ficam apenas nas definições de paleta.
- Usar elementos HTML nativos primeiro (`button`, `label`, `input`, `fieldset`, `table`, `dialog` quando apropriado). Evitar componentes visuais sem semântica.
- Versionar tokens e componentes juntos. Uma mudança de cor, fonte ou espaçamento exige verificar catálogo, estados de foco, telas pequenas e contraste.
- O catálogo visual é uma amostra e não substitui teste de interface real. A futura implementação deve transformar os exemplos em componentes reutilizáveis e validar interação e persistência.
- Antes do lançamento, revisar linguagem clínica e de medicamentos com profissional qualificado e testar compreensão com pessoas usuárias reais.
