# Apoio ao projeto

A página `/apoiar` usa o QR Code Pix estático fornecido pelo proprietário em `pix-qr-code.pdf` (23/09/2026). O payload completo e a chave aparecem em [`src/support/pix.ts`](../src/support/pix.ts); o QR vetorial correspondente está em [`public/pix-biorotina.svg`](../public/pix-biorotina.svg). O código de pagamento é copiado no navegador e colado no app do banco: a Biorotina não processa nem observa pagamentos.

O QR original foi decodificado e seu CRC validado. O QR gerado para o site foi decodificado novamente com o mesmo payload. O nome do recebedor no QR está abreviado a 25 caracteres (`INOVAPROG DESENVOLVIMENTO`); o CNPJ mostrado na página vem do PDF. Se a chave Pix for excluída ou portada, substitua **ambos** o payload em `pix.ts` e o SVG antes de republicar. Confira o novo recebedor e teste a leitura com um app bancário.

O app não sabe se houve uma contribuição e não mostra metas, progresso ou confirmação de pagamento. Não adicionar essas informações sem um fluxo próprio e autorização da pessoa.
