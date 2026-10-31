# Apoio ao projeto

A página `/apoiar` usa o QR Code Pix estático fornecido pelo proprietário em `pix-qr-code.pdf` (23/09/2026). O payload completo e a chave aparecem em [`src/support/pix.ts`](../src/support/pix.ts); o QR vetorial correspondente está em [`public/pix-biorotina.svg`](../public/pix-biorotina.svg). O código de pagamento é copiado no navegador e colado no app do banco: a Biorotina não processa nem observa pagamentos.

O QR original foi decodificado e seu CRC validado. O QR gerado para o site foi decodificado novamente com o mesmo payload. O nome do recebedor no QR está abreviado a 25 caracteres (`INOVAPROG DESENVOLVIMENTO`); o CNPJ mostrado na página vem do PDF. Se a chave Pix for excluída ou portada, substitua **ambos** o payload em `pix.ts` e o SVG antes de republicar. Confira o novo recebedor e teste a leitura com um app bancário.

O app não sabe se houve uma contribuição e não mostra metas, progresso ou confirmação de pagamento. Não adicionar essas informações sem um fluxo próprio e autorização da pessoa.

## Opiniões dos usuários

A mesma página oferece um botão para [abrir uma issue no GitHub](https://github.com/ewflaviano/biorotina/issues/new/choose), com os modelos de sugestão e relato de problema, e um link para o repositório para quem quiser colaborar com código. Os links abrem em outra aba. A página explica que é necessário ter uma conta no GitHub e que as issues são públicas; dados de saúde, informações pessoais e relatos de segurança devem seguir pelo e-mail privado.

O e-mail do projeto continua disponível como alternativa. Ao tocar no endereço, o navegador apenas o copia para a área de transferência; a pessoa escreve e envia a mensagem no aplicativo de e-mail que preferir. O site não abre um cliente de e-mail nem envia o conteúdo para a API.

O endpoint `/api/feedback` permanece no backend para diagnóstico futuro, mas não é chamado pelo site enquanto o erro 503 do SES está em investigação. Seus limites de cinco mensagens **enviadas com sucesso** por conexão, 20 tentativas por conexão e cem envios globais por dia continuam ativos. Os contadores anônimos expiram automaticamente e não guardam IP nem conteúdo das mensagens. Não enviar o corpo do pedido, a resposta do SES ou identificadores de entrega aos logs.
