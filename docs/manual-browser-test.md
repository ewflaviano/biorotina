# Roteiro reproduzível de testes no navegador — Biorotina

Use este roteiro na versão publicada em `https://biorotina.app.br/`. Registre cada execução em um arquivo separado, como [`manual-browser-test-runs/2026-09-24.md`](manual-browser-test-runs/2026-09-24.md). Passe por cada bloco em ordem; anote **Passou**, **Falhou**, **Não executado** ou **Bloqueado**, a data, o navegador e o comportamento observado. Não use nomes, fotos pessoais, tokens ou respostas completas de IA no relatório.

## Preparação e limites

1. Confirme que o deploy de `master` terminou e abra uma aba nova do site publicado. Anote a versão/commit, data, navegador, tamanho da tela e se o modo de movimento reduzido está ativo.
2. Use contas **de teste**: uma sem plano e outra com plano ativo. O login Google, permissões e códigos ficam com a pessoa usuária; não registre credenciais. Antes de trocar de conta, confira se os dados locais/Drive já têm registros reais. Não limpe armazenamento, importe backup ou substitua dados para “zerar” o teste.
3. Prepare uma foto simples de comida, sem pessoas ou dados pessoais. Para o teste negativo use um arquivo público do projeto, como `public/icon-512.png` (não é comida). Enviar uma imagem para análise transmite a foto ao serviço descrito pelo app e pode consumir cota; confirme isso antes de cada bloco de fotos.
4. Registros de teste devem ter nome identificável, como “Teste Biorotina — apagar”. Remova-os ao fim do bloco e confira que não restaram no histórico nem no resumo. Se a exclusão afetar dados reais, **pare**.
5. Não concluir pagamento, cancelar assinatura, substituir dados por backup, mudar permissão do navegador nem habilitar avisos neste dispositivo sem aprovação específica para essa etapa. Podemos verificar as telas e os estados prévios sem executar essas ações.
6. Trate um erro como achado, não como motivo para repetir indefinidamente uma chamada de IA. Anote hora aproximada, tela, etapa, código HTTP e mensagem; não copie payload com foto, token ou dados de saúde.

## Bloco A — sem login e sem plano

| ID | Passo | Resultado esperado |
| --- | --- | --- |
| A01 | Abrir o site em uma sessão sem Google conectado. Conferir Hoje e os seis atalhos. | Página abre sem exigir conta; seis áreas e resumo ficam visíveis; nenhum dado de outra conta aparece. |
| A02 | Abrir Água, Medicação, Refeição, Atividade e Mais pela barra inferior; abrir Peso, Hábitos, Configurações, Privacidade, Apoiar, Instalar e Assinatura pelos atalhos/links; voltar pelo logo. | Todas as 13 rotas abrem sem erro. A barra indica a área correta e não cobre texto no celular. |
| A03 | Com a aba de rede aberta, recarregar Refeição ainda sem login. | O frontend **não** chama `/api/ai/trial-config` nem `/api/billing/status`; registro manual continua disponível. |
| A04 | Em Refeição, tocar “Tirar foto” ou “Escolher imagem” sem plano/chave/login. | Antes de abrir câmera/arquivo aparece o diálogo “Análise de fotos”, com plano, chave e “Continuar sem foto”. Nenhuma foto é enviada. |
| A05 | Tocar “Continuar sem foto”; conferir o bloco compacto “Preencher com uma foto”; tocar nele para expandir novamente. | O formulário manual permanece; seção de foto fecha e reabre sem perder texto digitado. |
| A06 | Criar refeição de teste **sem foto**, sem calorias; conferir resumo e histórico; tocar “Repetir” e revisar o rascunho; excluir o registro e conferir “Desfazer”. | Salvar funciona sem pagamento; contador atualiza; Repetir não salva sozinho; exclusão é reversível. Remover o registro de teste ao terminar. |
| A07 | Em Água, registrar um volume pelo atalho e conferir total/histórico; excluir o registro. | Um toque gera um único registro; total atualiza; exclusão volta ao total anterior. |
| A08 | Em Peso, Atividade, Medicação e Hábitos, conferir formulários e validações sem salvar dados reais; se usar dados de teste, registrar e limpar cada um antes de continuar. | Campos e mensagens de erro são legíveis, a ação principal responde ao toque e não há exigência de login. |
| A09 | Conferir Configurações e Assinatura sem login, sem importar backup ou iniciar checkout. | Dados locais e opções ficam claros; plano/foto não impedem uso manual. |

## Bloco B — conta Google sem plano

Antes de começar, a pessoa faz login na conta de teste **sem plano**. Confirmar visualmente que é a conta correta e anotar apenas `plano ativo: não`, `teste grátis habilitado: sim/não`, `análises grátis usadas: N/5`. Se a conta já gastou parte da cota, adaptar os passos à quantidade restante; não tentar reiniciar contador nem usar outra identidade para contornar o limite.

| ID | Passo | Resultado esperado |
| --- | --- | --- |
| B01 | Abrir Assinatura e depois Refeição. | Assinatura indica ausência de plano; Refeição oferece teste grátis (se habilitado), plano e chave. O contador corresponde ao backend. |
| B02 | Escolher uma foto válida de comida; observar preparação, miniatura e botão “Analisar foto”; iniciar uma análise. | “Preparando foto…” aparece durante processamento local; “Analisando foto…” e indicador aparecem durante a requisição; botão bloqueia toque duplo. |
| B03 | Após resposta, revisar descrição, alimentos, porções e calorias; alterar um campo antes de salvar; conferir histórico. | Sugestão é editável e **não** vira registro até salvar; dados escolhidos pela pessoa ficam no histórico. |
| B04 | Conferir o contador. Repetir análises válidas, uma de cada vez, até completar no máximo as cinco análises **da conta**. | Uma análise bem-sucedida consome uma unidade; saldo mostrado acompanha o backend. Nunca ultrapassar cinco tentativas pagas de teste apenas para “forçar” o limite. |
| B05 | Quando a conta chegar a 5/5, tocar para usar foto novamente. | Diálogo oferece plano ou chave Gemini e deixa explícito que a refeição pode ser registrada manualmente. Não abre câmera antes do aviso. |
| B06 | Ainda com cota disponível, escolher a imagem pública `public/icon-512.png` e analisar. Comparar contador antes/depois. | IA não inventa comida; aparece mensagem compreensível para foto sem refeição e o cadastro manual continua possível. Uma resposta não aproveitada não deve consumir a cota. **Risco conhecido a verificar:** o backend atual rejeita `foods` vazio e pode exibir erro genérico 503. |
| B07 | Se ocorrer 503 real do Gemini, anotar código/mensagem, não repetir em sequência; tentar mais tarde **com a mesma foto** uma única vez. | Mensagem diferencia indisponibilidade temporária de foto inválida; reserva de cota falha deve ser devolvida. Não atribuir erro de rede à assinatura sem conferir status. |
| B08 | Em Configurações, conferir controle de telemetria e status do Drive; não enviar dados reais de teste. | Preferência é clara e respeitada; não há token, foto ou dados de saúde em mensagens de erro/telemetria. Restaurar preferência original se alterada. |

Se `trialEnabled=false`, marcar B02–B07 como **Bloqueado pela configuração**, conferir que o app oferece plano/chave e não prometer cinco fotos. Esse é um caminho suportado pelo backend.

## Bloco C — conta Google com plano ativo

Encerrar a sessão anterior com cuidado. Antes de entrar com a conta paga, confirmar que registros locais de teste foram removidos e que não há conflito de sincronização pendente. Não aceitar substituição de dados do Drive sem comparar as cópias. A pessoa faz login com a conta paga; anotar somente `plano ativo: sim` e `uso hoje: N/10`.

| ID | Passo | Resultado esperado |
| --- | --- | --- |
| C01 | Abrir Refeição logo após o login, inclusive durante “Consultando seu plano…”. | Enquanto consulta, não aparece “Minha chave Gemini”; após confirmar plano, não aparecem “Testar grátis” nem seletor de modo. |
| C02 | Escolher a foto válida, analisar uma vez e revisar resultado; comparar uso diário antes/depois. | Usa automaticamente o plano, sem pedir chave; uma análise bem-sucedida incrementa o uso diário do plano, não a cota grátis. |
| C03 | Abrir Assinatura e conferir status, limite diário e eventual próxima cobrança. | Informação corresponde à conta paga; nenhum convite de teste grátis para ela. Não tocar em cancelar renovação durante este roteiro. |
| C04 | Analisar a imagem não alimentar pública apenas se a etapa for aprovada para a conta paga; conferir mensagem e uso diário. | Não inventa alimentos; falha de análise deve devolver a reserva. Anotar se a interface mostra erro genérico. |
| C05 | Se o limite diário já estiver naturalmente em 10/10, testar a tentativa seguinte. | Mensagem específica de cota diária, sem oferecer “teste grátis”. Não gastar análises apenas para chegar artificialmente a 10/10. |

## Bloco D — rotina, avisos, dados e acabamento

Execute com sessão escolhida e dados de teste identificáveis, **após** B/C, ou em sessão local separada. Estes casos não dependem de plano.

| ID | Passo | Resultado esperado |
| --- | --- | --- |
| D01 | Cadastrar hábito de teste com dias/horários; registrar uma realização; conferir Hoje e histórico; limpar. | Um registro aparece só após o toque; gráfico/resumo refletem o dia sem pontuação de saúde. |
| D02 | Cadastrar medicamento de teste com mais de um horário e dias específicos; registrar um uso; conferir histórico; limpar. | Horários/dias persistem; notificação não é ativada sem escolha; uso é factual, sem recompensa por dose. |
| D03 | Adicionar horário de água e conferir o convite para avisos. Sem aprovar permissão, fechar; limpar horário. | Convite aparece no momento certo e permite continuar sem avisos. |
| D04 | Se a pessoa aprovar notificações, habilitar neste dispositivo e enviar testes separados de água e medicação. | Mensagens diferenciam “beber água” e “tomar o remédio”, sem nome/dose/quantidade. Registrar navegador e se estava instalado. Restaurar preferência acordada. |
| D05 | Exportar backup de **dados de teste** e conferir nome/arquivo. Importação e resolução de conflito ficam para teste separado com cópia segura e aprovação explícita. | Download inicia; nenhuma importação ou substituição ocorre por acidente. |
| D06 | Em largura aproximada de 320 e 375 px, conferir barra inferior, rodapé, formulário, diálogo e botões; repetir com zoom de 200%. | Texto não fica escondido, não há rolagem horizontal inesperada, foco é visível. Restaurar tamanho do navegador depois. |
| D07 | Ativar movimento reduzido do sistema/navegador e repetir toque, análise de foto (sem gastar nova cota se possível) e estados de espera. | Status em texto permanece; não há spinner, pulso ou deslocamento perceptível. Restaurar preferência original. |
| D08 | Conferir console/erros de rede após cada bloco, apenas para códigos e categorias. | Nenhum erro inesperado; nunca registrar token, payload de foto, nome de medicamento ou dados pessoais no relatório. |

## Encerramento da rodada

1. Conferir contadores do backend, registros locais e Drive; remover somente dados de teste criados nesta rodada.
2. Restaurar preferências que foram alteradas para testar, incluindo telemetria, avisos, viewport e movimento reduzido.
3. Anotar cada falha com ID, comportamento esperado/observado, hora aproximada e impacto. Para fotos, incluir modo (grátis/plano/chave), código HTTP e mudança de cota, **sem imagem ou resposta completa**.
4. Separar limitações de ambiente (permissão do navegador, instalação, cota já gasta) de defeitos do produto. Abrir tarefa de correção para defeitos confirmados.
