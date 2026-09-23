# Revisão de UX/UI — Biorotina

Revisão do fluxo no navegador em largura de celular, da navegação e das ações disponíveis em cada página. O objetivo é permitir registrar, conferir e corrigir dados com pouco esforço. Esta revisão não substitui testes com pessoas usuárias.

## 1. Hoje

1. A pessoa abre o app e vê o estado do dia sem precisar entrar em uma conta.
2. Cinco atalhos levam diretamente ao registro de água, peso, atividade, refeição ou medicação.
3. Os cartões mostram medidas do dia e abrem o histórico correspondente. Registros recentes incluem também usos de medicamento informados pela pessoa.

**Ajuste feito:** removemos o bloco introdutório grande que empurrava as métricas para baixo no celular. Os atalhos deixam a primeira ação visível mais cedo.

## 2. Peso

1. Informe a medida; a data e hora começam no momento de abertura da tela e o botão **Agora** atualiza esse valor se a página ficou aberta.
2. O histórico e o gráfico mostram as medidas anteriores; o IMC só aparece com altura informada. A categoria usa faixas de referência para adultos de 18 a 59 anos, sem cor de julgamento ou diagnóstico. O botão de informação abre a fórmula, todas as faixas, a fonte oficial e a justificativa dos limites de entrada.
3. **Usar como modelo** preenche o valor anterior, limpa a observação antiga e define data/hora atual. A pessoa confere antes de salvar um novo registro.
4. **Excluir** remove uma medida incorreta; **Desfazer** restaura exatamente o registro anterior.

**Próxima melhoria possível:** edição direta de uma medida histórica, sem precisar excluir e recriar.

## 3. Atividades físicas

1. Os atalhos mostram primeiro as atividades registradas mais recentemente, sem repetir nomes. Tocar em uma delas recupera duração e calorias do último registro para revisão. As vagas restantes mostram sugestões gerais; também é possível buscar no catálogo de mais de 50 atividades ou digitar livremente.
2. Para uma atividade do catálogo, o app sugere calorias a partir de MET, duração e último peso; sem peso, indica a referência de 70 kg. A pessoa pode ajustar, limpar ou voltar à estimativa. O botão de informação mostra a fórmula, o MET e código da atividade escolhida e o link para a fonte.
3. **Agora** corrige a hora sugerida quando necessário.
4. O histórico oferece **Usar como modelo** para preencher nome, duração e calorias anteriores com data/hora atual; **Excluir** tem desfazer. Valores estimados e informados são identificados.
5. O resumo e o gráfico mostram tempo registrado, sem penalizar dias vazios.

**Próxima melhoria possível:** filtros de período e edição de detalhes de uma atividade passada quando o histórico crescer.

## 4. Alimentação

1. Descreva a refeição; calorias continuam opcionais.
2. Uma refeição frequente pode ser usada como modelo: descrição e calorias são copiadas, mas a data/hora é atualizada e a pessoa revisa antes de salvar.
3. Uma refeição equivocada pode ser excluída e restaurada com **Desfazer**.

**Próxima melhoria possível:** edição direta e agrupamento por dia para históricos extensos.

## 5. Medicação

1. Cadastre nome, dose, unidade livre com sugestões e horário de referência opcional. O horário ainda não ativa notificações.
2. **Editar** corrige o medicamento sem apagar os registros de uso. A dose mantém a precisão informada.
3. **Registrar uso** exige uma ação da pessoa e continua disponível após o primeiro registro do dia como **Registrar outro uso**. A tela informa quantos usos foram registrados hoje e quando ocorreu o último. **Remover último** corrige um toque acidental sem apagar os demais; o histórico permite remover qualquer registro individual.
4. **Excluir medicamento** informa quantos registros de uso ligados serão removidos e pede confirmação. O banner de desfazer restaura medicamento e registros juntos.

**Próxima melhoria possível:** vários horários e frequências por medicamento quando a etapa de lembretes for implementada, com revisão cuidadosa da linguagem para não sugerir orientação clínica.

## 6. Hidratação

1. Os atalhos de 200, 250 e 500 ml registram água em um toque; um campo permite qualquer volume válido.
2. O total do dia e o histórico se atualizam imediatamente.
3. **Repetir** registra o mesmo volume de uma entrada anterior com o horário atual. **Excluir** e **Desfazer** corrigem um toque acidental.
4. A pessoa pode guardar vários horários desejados de lembrete. A tela informa que eles ainda não enviam notificações.

## 7. Mais áreas e navegação

1. A barra inferior mantém cinco destinos legíveis no celular.
2. **Mais** abre Alimentação, Medicação e Configurações. Ele permanece marcado como área ativa quando uma dessas páginas está aberta.
3. No desktop, a barra lateral mostra todas as áreas diretamente.

## 8. Configurações e dados

1. O perfil mantém nome opcional e altura usada apenas para contextualizar o IMC. Alturas fora de 50–250 cm e pesos acima de 350 kg são recusados como provável erro de digitação; valores negativos já são inválidos.
2. O backup JSON pode ser exportado. Antes de importar, o app valida o arquivo, mostra a data de alteração e a quantidade por categoria, e pede confirmação; quando existem dados locais, prepara uma cópia anterior para download.
3. Google Drive permite conectar uma conta opcionalmente, consultar a última cópia e sincronizar com um toque. Alterações concorrentes exigem escolha explícita; ao restaurar a versão remota, o app prepara um JSON local antes da substituição. O uso local não depende de login.

**Próxima melhoria possível:** comparar lado a lado a cópia escolhida e os dados locais, além de mostrar a data da última cópia feita pela pessoa. O app não consegue garantir que um download iniciado foi guardado em local seguro.

## Regras de experiência aplicadas

- O botão **Desfazer** fica disponível durante a sessão, inclusive depois de navegar. Ele deixa de valer quando a pessoa o dispensa, importa outro backup ou recarrega o app.
- Reutilizar um registro cria uma nova entrada; nunca altera automaticamente a anterior. Hidratação repete em um toque; as outras áreas abrem um rascunho para revisão.
- Ações de registro e exclusão usam rótulos visíveis e áreas de toque adequadas para celular. Dados de saúde não são enviados ao projeto.
- Notificações e sincronização só serão apresentadas como ativas quando essas integrações existirem e houver consentimento.
