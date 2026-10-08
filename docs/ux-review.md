# Revisão de UX/UI — Biorotina

Revisão do fluxo no navegador em largura de celular, da navegação e das ações disponíveis em cada página. O objetivo é permitir registrar, conferir e corrigir dados com pouco esforço. Esta revisão não substitui testes com pessoas usuárias.

## 1. Hoje

1. A pessoa abre o app e vê o estado do dia sem precisar entrar em uma conta.
2. Cinco atalhos levam diretamente ao registro de água, peso, atividade, refeição ou medicação.
3. A pessoa escolhe a data na própria tela Hoje. Os seis cartões resumem apenas registros desse dia; o peso mostra a última medida feita nessa data, sem carregar uma medida de outro dia. As quatro entradas exibidas abaixo acompanham a mesma escolha.
4. **Ver todos os registros deste dia** abre a lista completa na data escolhida, com navegação entre dias e acesso ao histórico de cada área. Voltar preserva a escolha. A consulta não modifica os registros.

**Ajuste feito:** removemos o bloco introdutório grande que empurrava as métricas para baixo no celular. Os atalhos deixam a primeira ação visível mais cedo.

## 2. Peso

1. Informe a medida; a data e hora começam no momento de abertura da tela e o botão **Agora** atualiza esse valor se a página ficou aberta.
2. O histórico começa em hoje e permite escolher qualquer dia até a data atual. A lista mostra apenas as medidas do dia escolhido; o gráfico continua mostrando todas as medidas e informa esse escopo. O IMC só aparece com altura informada. A categoria usa faixas de referência para adultos de 18 a 59 anos, sem cor de julgamento ou diagnóstico. O botão de informação abre a fórmula, todas as faixas, a fonte oficial e a justificativa dos limites de entrada.
3. **Repetir** preenche o valor anterior, limpa a observação antiga e define data/hora atual. A pessoa confere antes de salvar um novo registro.
4. **Excluir** remove uma medida incorreta; **Desfazer** restaura exatamente o registro anterior.

**Em experimento:** editar peso, data/hora e observação de uma medida histórica sem excluir e recriar (`weight-history-edit`, issue #92). O controle mantém o fluxo atual.
**Em experimento:** quando o dia selecionado não tem medidas, abrir diretamente o último dia anterior com medida (`weight-history-last-day-shortcut`, issue #96). O controle mantém a escolha manual.

## 3. Atividades físicas

1. Os atalhos mostram primeiro as atividades registradas mais recentemente, sem repetir nomes. Tocar em uma delas recupera duração e calorias do último registro para revisão. As vagas restantes mostram sugestões gerais; também é possível buscar no catálogo de mais de 50 atividades ou digitar livremente.
2. Para uma atividade do catálogo, o app sugere calorias a partir de MET, duração e último peso; sem peso, indica a referência de 70 kg. A pessoa pode ajustar, limpar ou voltar à estimativa. O botão de informação mostra a fórmula, o MET e código da atividade escolhida e o link para a fonte.
3. **Agora** corrige a hora sugerida quando necessário.
4. O histórico começa em hoje e permite escolher qualquer dia até a data atual pelo mesmo seletor da home. A busca por nome, sem distinção de acentos ou maiúsculas, atua dentro do dia escolhido; a tela informa quantidade e minutos exibidos. **Repetir** preenche nome, duração e calorias anteriores com data/hora atual; **Excluir** tem desfazer. Valores estimados e informados são identificados.
5. O cartão de minutos acompanha a data escolhida no histórico e soma todas as atividades desse dia, independentemente da busca por nome. Dias vazios mostram zero, sem penalização.

**Próxima melhoria possível:** edição de detalhes de uma atividade passada quando o histórico crescer.

## 4. Alimentação

1. Descreva a refeição; calorias continuam opcionais. Alternativamente, escolha ou tire uma foto, confirme a análise com Gemini e revise alimentos, quantidades e calorias antes de salvar.
2. Uma refeição frequente pode ser usada como modelo: descrição e calorias são copiadas, mas a data/hora é atualizada e a pessoa revisa antes de salvar.
3. Uma refeição equivocada pode ser excluída e restaurada com **Desfazer**.
4. O histórico começa em hoje, permite escolher outro dia e buscar pelo nome de uma refeição dentro desse dia. O total geral fica identificado separadamente do recorte.

**Próxima melhoria possível:** edição direta de uma refeição passada.

## 5. Medicação

1. Cadastre nome, dose, unidade livre com sugestões e vários horários opcionais. Os horários ficam salvos no navegador; avisos neste dispositivo são ativados separadamente, com permissão do sistema.
2. **Editar** corrige o medicamento sem apagar os registros de uso. A dose mantém a precisão informada.
3. **Registrar uso** exige uma ação da pessoa e continua disponível após o primeiro registro do dia como **Registrar outro uso**. A tela informa quantos usos foram registrados hoje e quando ocorreu o último. **Remover último** corrige um toque acidental sem apagar os demais; o histórico permite remover qualquer registro individual.
4. **Excluir medicamento** informa quantos registros de uso ligados serão removidos e pede confirmação. O banner de desfazer restaura medicamento e registros juntos.
5. O histórico de usos começa em hoje e permite escolher outro dia e buscar pelo nome do medicamento. A lista de medicamentos cadastrados e o contador de hoje continuam independentes da data consultada.

**Próxima melhoria possível:** permitir frequências que não sejam diárias, sem sugerir orientação clínica. A entrega agendada ainda precisa ser confirmada em dispositivos reais.

## 6. Hidratação

1. Os atalhos de 200, 250 e 500 ml registram água em um toque; um campo permite qualquer volume válido.
2. O total de hoje e o histórico se atualizam imediatamente. No histórico, a pessoa pode escolher outro dia e ver o volume e a quantidade de registros desse dia; o destaque de hoje permanece identificado separadamente.
3. **Repetir** registra o mesmo volume de uma entrada anterior com o horário atual. **Excluir** e **Desfazer** corrigem um toque acidental.
4. A pessoa pode guardar vários horários de lembrete. O controle “Avisos neste dispositivo” explica quando os avisos estão ativos e permite enviar um teste, ativar ou desativar.

## 7. Mais áreas e navegação

1. A barra inferior mantém cinco destinos legíveis no celular.
2. A barra inferior mostra **Hoje, Medidas, Atividade, Água e Mais** no controle. No experimento de 50%, mostra **Hoje, Atividade, Refeição, Água e Mais**; Medidas aparece em Mais. A página de consulta por dia mantém Hoje marcado.
3. **Mais** abre Alimentação no controle ou Medidas na variante, além de Medicação, Hábitos e Configurações. Ele permanece marcado como área ativa quando uma dessas páginas está aberta.
4. No desktop, a barra lateral mostra todas as áreas diretamente.
5. Em Hábitos, uma visão semanal mostra em quais dias cada hábito atual tem registros informados, sem tratar dias vazios como falha. O painel permite consultar semanas anteriores e abrir o histórico do dia tocado. O histórico começa em hoje e permite escolher outro dia e buscar pelo nome do hábito. A lista de hábitos cadastrados e o contador de hoje continuam independentes da data consultada.

## 8. Configurações e dados

1. O perfil mantém nome opcional e altura usada apenas para contextualizar o IMC. Alturas fora de 50–250 cm e pesos acima de 350 kg são recusados como provável erro de digitação; valores negativos já são inválidos.
2. O backup JSON pode ser exportado. Antes de importar, o app valida o arquivo e compara seus registros com os deste navegador nas oito categorias, mostrando exclusividades e conteúdo diferente por identificador, além de alterações no perfil e nos horários de água. Uma mudança local exige nova conferência; a confirmação deixa claro que a operação substitui os dados. Quando existem dados locais, prepara uma cópia anterior para download.
3. Google Drive permite conectar uma conta opcionalmente pelo topo e sincroniza alterações automaticamente enquanto a página está aberta. A sessão pode continuar após recarregar; se a renovação do Google falhar, a pessoa conecta novamente. Configurações mostra a última cópia e oferece sincronização manual. Alterações concorrentes exigem escolha explícita; ao restaurar a versão remota, o app prepara um JSON local antes da substituição. O uso local não depende de login.

**Próxima melhoria possível:** comparar lado a lado a cópia escolhida e os dados locais, além de mostrar a data da última cópia feita pela pessoa. O app não consegue garantir que um download iniciado foi guardado em local seguro.

## 9. Instalação, apoio e privacidade

1. **Instalar no celular** oferece passos para Safari no iPhone e Chrome no Android. No iPhone, a tela distingue um atalho que abre no navegador de um app instalado que abre sem barra de endereço; isso ajuda a entender por que a permissão de avisos pode não aparecer.
2. **Apoiar** explica que a contribuição por Pix é opcional e mostra um QR code e uma chave para copiar.
3. **Como seus dados são usados** explica armazenamento local, cópia no Drive, avisos e métricas, com um contato para dúvidas. Um banner discreto oferece aceitar ou recusar métricas e diagnósticos, com detalhes sob um ícone de informação; a escolha também pode ser alterada em Configurações. Sem aceite, não há coleta dessas métricas nem envio de diagnósticos pelo app.

## Regras de experiência aplicadas

- O botão **Desfazer** fica disponível durante a sessão, inclusive depois de navegar. Ele deixa de valer quando a pessoa o dispensa, importa outro backup ou recarrega o app.
- Reutilizar um registro cria uma nova entrada; nunca altera automaticamente a anterior. Hidratação repete em um toque; as outras áreas abrem um rascunho para revisão.
- Ações de registro e exclusão usam rótulos visíveis e áreas de toque adequadas para celular. Dados de saúde não são enviados ao projeto.
- Sincronização aparece como ativa após conectar a conta. Avisos aparecem como ativos após a inscrição do dispositivo; essa indicação não garante que o sistema exibirá cada notificação.
