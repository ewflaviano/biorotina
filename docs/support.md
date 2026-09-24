# Apoio ao projeto

A página `/apoiar` usa o QR Code Pix estático fornecido pelo proprietário em `pix-qr-code.pdf` (23/09/2026). O payload completo e a chave aparecem em [`src/support/pix.ts`](../src/support/pix.ts); o QR vetorial correspondente está em [`public/pix-biorotina.svg`](../public/pix-biorotina.svg). O código de pagamento é copiado no navegador e colado no app do banco: a Biorotina não processa nem observa pagamentos.

O QR original foi decodificado e seu CRC validado. O QR gerado para o site foi decodificado novamente com o mesmo payload. O nome do recebedor no QR está abreviado a 25 caracteres (`INOVAPROG DESENVOLVIMENTO`); o CNPJ mostrado na página vem do PDF. Se a chave Pix for excluída ou portada, substitua **ambos** o payload em `pix.ts` e o SVG antes de republicar. Confira o novo recebedor e teste a leitura com um app bancário.

O app não sabe se houve uma contribuição e não mostra metas, progresso ou confirmação de pagamento. Não adicionar essas informações sem um fluxo próprio e autorização da pessoa.

## Opiniões dos usuários

A mesma página oferece um campo de mensagem para ideias, elogios e problemas. Ao tocar em **Enviar feedback**, o navegador envia apenas o texto digitado (até 800 caracteres) para `/api/feedback`. O serviço encaminha a mensagem por e-mail via Amazon SES para a caixa do projeto; não armazena o conteúdo em banco nem o registra em logs. Se houver falha, o texto permanece no formulário e pode ser copiado. Nenhum dado da conta ou dos registros é incluído automaticamente; a página orienta a não escrever dados de saúde ou informações pessoais. Trata-se de um envio explícito, independente da opção de métricas/telemetria.

O endpoint público limita cinco tentativas por conexão a cada dia (chave derivada e temporária, sem guardar o endereço IP no contador), cem envios globais por dia e a rota a um pedido por segundo. Uma tentativa que falha no SES também ocupa um espaço do limite diário. Não enviar o corpo do pedido, a resposta do SES ou identificadores de entrega aos logs. O SES deve ter remetente e destinatário verificados na região de implantação; enquanto a conta estiver no sandbox, o destinatário verificado é obrigatório. Depois de habilitar o SES no limite IAM e na role da função, testar um único envio em produção e conferir a caixa de entrada.
