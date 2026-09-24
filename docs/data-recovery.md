# Proteção e recuperação das tabelas

As tabelas DynamoDB de avisos (`PushTable`) e cobrança (`BillingTable`) usam
recuperação por ponto no tempo (PITR) por 35 dias, proteção contra exclusão e
`Retain` na remoção ou substituição pelo CloudFormation. PITR tem cobrança
contínua proporcional ao tamanho das tabelas, independente do tamanho da
janela configurada. A janela só começa a acumular a partir da ativação.

Um restauro do DynamoDB **cria outra tabela**; ele não substitui a original nem
altera a aplicação automaticamente. Antes de qualquer restauro em produção:

1. Registrar a hora do incidente e escolher um instante recuperável anterior;
   conferir `EarliestRestorableDateTime` e `LatestRestorableDateTime` na AWS.
2. Restaurar para uma tabela **nova e temporária** na mesma região. Nunca usar
   o nome físico atual como destino nem excluir as tabelas de origem.
3. Conferir apenas estrutura, contagens e itens técnicos necessários, evitando
   exportar dados ou segredos em logs ou tickets.
4. Recriar no destino os recursos que o restauro não preserva, principalmente
   TTL, PITR, proteção contra exclusão, alarmes e permissões. Confirmar também
   o índice de próximos avisos da tabela de push.
5. Planejar uma janela de manutenção, reconciliar pagamentos com o Asaas e só
   então decidir se a aplicação deve apontar para a tabela restaurada ou se
   itens específicos podem ser recuperados. Não trocar a tabela automaticamente:
   eventos de pagamento, cotas de IA e inscrições de avisos podem ter mudado
   após o ponto escolhido.

Testar esse procedimento primeiro com dados sintéticos fora de produção.
Evitar um restauro real sem aprovação específica para o incidente.

Referências: [PITR e cobrança](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/PointInTimeRecovery_Howitworks.html),
[o que o restauro não preserva](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/PointInTimeRecovery.Tutorial.html)
e [propriedades da tabela no CloudFormation](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-dynamodb-table.html).
