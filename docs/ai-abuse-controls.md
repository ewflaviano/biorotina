# Limites da análise de fotos

Antes de reservar cota ou chamar o Gemini, a API decodifica o Base64 e confere
se a imagem tem estrutura JPEG, início/fim válidos e dimensões entre 1 e 4096
pixels por lado. Isso rejeita texto ou arquivos arbitrários enviados como
`image/jpeg`; não substitui a análise de conteúdo da foto pelo modelo.

Cada conta Google pode iniciar até 40 pedidos de análise por dia, incluindo
falhas temporárias do provedor. Esse teto técnico é separado das 5 análises
grátis no total, das 10 análises diárias do plano e do limite de 5 resultados
inutilizáveis por dia. Uma falha 503 continua sem consumir uma análise bem-
sucedida; ela apenas ocupa uma das 40 tentativas para impedir repetição sem
limite. Ao chegar ao teto, o app pode continuar com registro manual e tentar
fotos novamente no dia seguinte.

Os contadores são atômicos no DynamoDB, indexados pelo identificador técnico
da conta e pelo dia no fuso de São Paulo, com expiração automática. Fotos,
resultados do Gemini e mensagens de erro não entram nesses contadores.
