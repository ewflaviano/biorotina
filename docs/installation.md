# Adicionar à tela inicial

O app já tem manifest, ícones, modo `standalone` e metadados da Apple. No mobile, a tela inicial mostra um convite discreto depois da escolha sobre métricas; o convite pode ser dispensado e não aparece quando o app já foi instalado. A página `/instalar`, acessível em **Mais áreas**, mantém as instruções disponíveis.

O botão **Instalar Biorotina** só aparece se o navegador emitir `beforeinstallprompt`. Em outros casos, mostramos as instruções do menu do navegador. No iPhone, a instalação é feita pelo menu de compartilhamento; não há botão programático equivalente. Fontes: [MDN, instalação de PWAs](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable), [MDN, beforeinstallprompt](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeinstallprompt_event), [Apple, apps web na tela inicial](https://developer.apple.com/videos/play/wwdc2023/10120/).

Apps adicionados à tela inicial no iPhone podem usar armazenamento separado do Safari. Por isso, a página orienta conectar e sincronizar o Google Drive antes de instalar quando já houver registros locais, e conectar novamente no app instalado. A instalação não promete funcionamento sem conexão; isso depende de uma estratégia posterior de cache e sincronização offline.
