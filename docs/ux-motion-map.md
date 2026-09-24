# Mapa de movimento e feedback — Biorotina

Leitura das 13 páginas do app em 24/09/2026. Este é um mapa de implementação, não uma contagem de metas de saúde. A intenção é tornar o gesto diário de registrar algo agradável e compreensível: **toque → espera honesta → confirmação → progresso visível**. O registro deve continuar simples mesmo sem animação.

## Direção de experiência

- Uma pequena resposta tátil/visual no toque confirma que o comando foi recebido. O feedback deve começar imediatamente, inclusive quando a gravação ou a rede demoram.
- A espera mostra **o que está acontecendo**, sem porcentagens inventadas. O mesmo botão conserva tamanho, fica indisponível para toque repetido e muda ícone e texto (por exemplo, “Analisando foto…”).
- Depois de um registro bem-sucedido, um único movimento curto liga a ação ao resultado: item novo aparece, total muda ou quadrado do dia no gráfico ganha cor. A confirmação textual permanece para quem não vê o movimento.
- Hábitos, água e atividade podem ter uma confirmação um pouco mais calorosa — um pulso suave no indicador do dia ou um `check` breve. Repetir a mesma microcelebração a cada toque cansa; priorizar o primeiro registro daquela área no dia, sem efeitos acumulativos.
- Alimentação recebe confirmação de que **a refeição foi registrada**, nunca elogio sobre calorias ou escolha de comida. Medicação recebe confirmação factual de **uso informado**, jamais recompensa por dose. Peso não recebe comemoração por subir ou descer. Esses limites já estão alinhados ao [design system](design-system.md).
- Não adicionar streak obrigatório, pontuação de saúde, penalidade por dias vazios, confete, som, vibração inesperada ou urgência artificial. A proposta é favorecer retorno voluntário, sem ansiedade.

## Linguagem comum

| Momento | Padrão proposto | Duração / cuidado |
| --- | --- | --- |
| Toque em botão, atalho ou aba | Pressão leve (`scale` ~0,98) e resposta no ícone/texto, sem deslocar layout; foco de teclado continua evidente. | 120 ms; só em controles acionáveis. |
| Espera curta | Ícone de progresso ao lado do verbo no próprio botão; `aria-busy` no trecho afetado e texto `role="status"` quando necessário. | Sem atraso artificial; indicador só enquanto a operação existir. |
| Espera de rede / foto | Foto permanece visível, com indicador discreto e etapa textual real; cancelamento ou retorno quando tecnicamente viável. | Não mostrar barra percentual sem progresso mensurável. |
| Sucesso de registro | Novo item ou número entra com opacidade/pequeno deslocamento; `check` breve no botão ou aviso; desfazer continua acessível. | 200–320 ms, uma vez por ação. |
| Erro | Mensagem legível junto da ação e foco acessível; borda/ícone pode aparecer suavemente. | Nunca sacudir formulário ou esconder o erro rapidamente. |
| Navegação, expansão e modal | Transição curta que explica origem/destino; preservar posição de rolagem e foco. | 200–320 ms; sem bloquear interação. |

Os tokens de 120/200/320 ms e `prefers-reduced-motion` já existem em `docs/tokens.css`, mas quase nenhum componente os usa: `src/styles.css` tem só duas regras de `transition` e nenhuma animação. Respeitar movimento reduzido com feedback textual equivalente. Preferir `transform` e `opacity`, sem animar altura de páginas inteiras, números clínicos ou layout da barra inferior.

## Mapa por página

| Página | Onde o gesto encontra progresso | Feedback atual e oportunidade | Prioridade |
| --- | --- | --- | --- |
| Hoje `/` | Os seis atalhos, seis cartões e o gráfico de sete dias são o retorno natural após registrar. | Cartões e gráfico mudam sem transição. Pressão nos atalhos; entrada sutil **apenas** do quadrado/área recém-registrada e da contagem correspondente. Não animar todos os dados a cada visita. | Alta |
| Água `/hidratacao` | Atalhos 200/250/500 ml e total de hoje permitem o ciclo mais rápido. | Os três atalhos só ficam desabilitados durante `saving`; não mostram qual está salvando. Indicador por botão, total com pulso suave após sucesso, registro novo em evidência por um instante. Lembretes adicionados/removidos precisam de confirmação curta. | Alta |
| Hábitos `/habitos` | “Registrar” é a ação central da rotina; histórico e gráfico de Hoje são o resultado. | Há “Registrando…” e bloqueio por item. Confirmar naquele item com `check` breve, atualizar “hoje” e dar uma microcelebração discreta no **primeiro** registro do dia; nova linha entra sem salto. Salvar/editar hábito e horários ganham estado próprio. | Alta |
| Refeição `/alimentacao` | Selecionar foto, preparar imagem, analisar, revisar e salvar formam uma sequência clara. | A preparação local da foto não tem estado visível; “Analisando foto…” é só texto e a sugestão aparece de uma vez. Mostrar “Preparando foto…”, miniatura com progresso indeterminado durante análise, botão com ícone/texto ativos, chegada suave dos campos sugeridos e confirmação ao salvar. O caminho manual deve continuar igualmente acolhedor. | Alta |
| Atividade `/atividades` | Atalho de tipo, duração e registro; minutos de Hoje respondem à ação. | “Salvando…” já existe. Realçar atalho escolhido, progresso no botão, confirmação no item e no total; sem celebrar gasto calórico. Estimativa de calorias deve atualizar sem chamar atenção indevida. | Média |
| Medicação `/medicamentos` | Cadastrar, escolher dias/horários e registrar uso têm efeitos distintos. | “Salvando…” e “Registrando…” já existem. Indicador por medicamento, confirmação factual “Uso registrado” no item e entrada no histórico. Ao salvar lembretes, mostrar confirmação dos horários antes do convite para avisos. Sem confete, streak ou recompensa pela dose. | Média |
| Peso `/peso` | Salvar medida e ver histórico/gráfico. | “Salvando…” já existe. Progresso no botão e entrada discreta do ponto/linha e da nova linha de histórico; sem pulso celebratório do valor/IMC nem ênfase na direção da mudança. | Média |
| Mais `/mais` | Acesso a seções secundárias. | Links estáticos. Apenas pressão/foco e transição curta de navegação; não precisa loading próprio. | Baixa |
| Configurações `/configuracoes` | Salvar perfil, chave Gemini, importar/exportar, Drive, avisos e telemetria. | Vários controles dão só mensagem posterior; leitura do JSON e gravação do perfil não têm espera identificável. Estado por ação (não travar a página toda), confirmação persistente, progresso de conexão/sincronização, seletor de arquivo que comunica leitura/validação. Sem gamificação. | Alta |
| Assinatura `/assinatura` | Consultar estado, iniciar pagamento, atualizar situação, cancelar. | Há “Consultando assinatura…” e “Preparando pagamento…”, mas sem indicador; atualizar/cancelar precisam de espera própria. Mostrar etapa real e retorno/erro sem animação promocional. | Média |
| Instalar `/instalar` | Trocar iPhone/Android e aceitar instalação. | Abas e passos mudam abruptamente; botão de instalar desabilita sem mudar rótulo. Transição leve entre instruções e “Abrindo instalação…”, mantendo caminho manual visível. | Baixa |
| Apoiar `/apoiar` | Copiar Pix. | Ícone e rótulo já mudam para confirmação. Pequeno `check`/pulso uma vez basta; QR não precisa animar. | Baixa |
| Privacidade `/privacidade` | Leitura de conteúdo sensível e escolhas informadas. | Página estática. Sem decoração ou carregamento artificial; somente feedback padrão dos links e expansões, se existirem. | Baixa |

## Componentes compartilhados que multiplicam o efeito

1. **Botões e links de ação:** um padrão único de pressed, loading, sucesso e erro evita implementar cada página de forma diferente. Inclui rótulo e ícone (quando houver), sem saltos de largura; atalhos e barra inferior precisam da mesma sensação de toque. Não aplicar a elementos desabilitados.
2. **Navegação e topo (`Layout`):** ícone do destino ativo pode responder uma vez à troca; status do Drive deve distinguir pendente, sincronizando, concluído e falhou. O aviso Desfazer entra suavemente sem cobrir conteúdo nem roubar foco.
3. **Estados de dados:** carregamento inicial pode usar símbolo discreto junto de “Abrindo Biorotina…”. Registro novo e métricas de Hoje entram com movimento localizado, não com reanimação da tela inteira. Gráficos mantêm valores exatos e legendas mesmo com animação desligada.
4. **Modais e expansões:** convite para ativar avisos, oferta de análise de foto, detalhes de informação e seção de foto recebem entrada curta e fechamento imediato pelo teclado. `aria-expanded`, foco e botão de fechar continuam prioritários.
5. **Rede e serviços:** `DriveBackup`, `PushControl`, `GeminiSettings`, checkout e análise por IA precisam de estados de espera e erro separados. Uma operação lenta nunca deve parecer um clique perdido, e um spinner não substitui mensagem textual.
6. **Correção:** excluir/desfazer e “Repetir” recebem resposta factual. Restaurar um registro deve ser claro; não tratar exclusão como conquista.

## Ordem sugerida de entrega

1. **Fundação e foto:** pressed compartilhado, ícone/texto de espera, preparação/análise de imagem e chegada das sugestões. É o fluxo mais demorado e hoje tem a maior lacuna de feedback.
2. **Ciclo diário:** água, hábitos, atividade, refeição manual e painel Hoje. Confirmar no ponto de ação e refletir o registro no resumo, com uma única resposta mais calorosa para hábitos/água/atividade.
3. **Confiabilidade:** medicação, peso, Drive, backup, avisos, assinatura e configurações. Priorizar estados corretos, foco, erro e desfazer acima de ornamentação.
4. **Acabamento:** transições de navegação, abas, modais, links de Mais, Apoiar, Instalar e Privacidade. Validar no celular real antes de ampliar.

## Critérios de aceite para cada entrega

- Uma ação mostra resposta imediata, espera verdadeira, resultado ou erro. Não permite duplicação acidental enquanto espera.
- Uma pessoa com `prefers-reduced-motion: reduce` recebe as mesmas informações sem movimento perceptível; leitor de tela recebe estado por texto/semântica.
- Em 320, 375, 768 e 1280 px não há deslocamento que esconda texto atrás da navegação; zoom de 200% e teclado continuam funcionais.
- O movimento não afeta o valor clínico, não sugere meta não configurada e não recompensa medicamento, peso ou calorias.
- Testes cobrem ao menos o estado de espera e o retorno de erro/sucesso das ações assíncronas, além do modo de movimento reduzido para os componentes comuns.
