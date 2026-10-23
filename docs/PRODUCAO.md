# Operação em produção

## Fluxo de dados

1. **Clientes do ERP:** importar a base completa. Ela é a referência para histórico e para impedir que uma empresa já cadastrada seja tratada como prospect novo.
2. **Rotas e visitas:** importar a planilha operacional. Ela fica em staging e alimentará o planejamento depois de confirmarmos as colunas da última aba.
3. **Candidatos externos:** importar uma base empresarial pública ou licenciada. Somente esta origem cria prospects automaticamente. Antes disso, o sistema compara CNPJ e nome + cidade com o ERP.
4. **Conferência:** cada carga mantém arquivo, aba, campos detectados, contagens e motivo das rejeições/duplicidades.

Importar a base do ERP não “descobre” empresas novas. Para descoberta real é necessária uma fonte externa de CNPJ/empresas, respeitando licença e finalidade. O sistema já recebe essa base por Excel; uma integração automática pode usar a mesma camada depois.

A aba **Base de clientes** da planilha de planejamento pode ser importada como **Clientes do ERP**. O formato mínimo reconhecido é `Código do cliente`, `CNPJ`, `CEP` e `Endereço`; cidade e UF são extraídas do final do endereço quando estiver no padrão `Cidade/UF`. Se a razão social não estiver disponível, o cadastro recebe temporariamente `Cliente <código>` e continua servindo para bloquear duplicidades por CNPJ. A inclusão de `Nome do cliente` ou `Razão social` continua recomendada para identificação humana.

O formulário aceita tanto um `.xlsx` quanto um link compartilhado do Google Sheets. Links são limitados ao domínio `docs.google.com`, exportados como Excel no momento da carga e sujeitos ao limite de 30 MB. A planilha precisa permitir leitura pelo link para que o servidor de produção consiga exportá-la.

## Variáveis do Render

- `DATABASE_URL`: URL com pool do Neon, usada pela aplicação.
- `DATABASE_URL_UNPOOLED`: URL direta do Neon, usada somente nas migrações.
- `ADMIN_EMAIL`: e-mail do administrador.
- `ADMIN_PASSWORD_HASH`: hash criado com `npm run hash-password -- "senha longa"`.
- `SESSION_SECRET`: gerada pelo Blueprint do Render.

## Publicação

O Render precisa acessar um repositório GitHub, GitLab ou Bitbucket. Depois de criar/vincular o repositório, o Blueprint `render.yaml` cria o serviço e solicita as variáveis secretas. Na primeira inicialização, as migrações são aplicadas com trava transacional antes de o servidor aceitar tráfego.

O plano gratuito no Blueprint serve para validação online e pode hibernar. Para operação contínua, altere `plan` depois de aprovar o custo mensal no Render.

## Regiões, raio e Waze

A carga do tipo **Rotas e visitas** reconhece, quando disponíveis, as colunas `Rota`, `Cidade Polo`, `Cidade`, `UF`, `Latitude`, `Longitude` e `Distância do Polo km`. Se a cidade-polo não estiver indicada, o sistema usa como polo a cidade mais frequente de cada rota/região.

O seletor de raio mostra:

- cidades explicitamente relacionadas à rota;
- cidades adicionais com coordenadas conhecidas que estejam dentro do raio;
- quantidade de prospects encontrados nessas cidades ou geograficamente dentro do raio.

O Waze aceita somente um destino por deep link. Por isso, uma rota com várias visitas é compartilhada como uma sequência numerada de links: cada parada possui **Abrir no Waze**, e o botão de WhatsApp envia o roteiro completo com um link por trecho. Coordenadas são usadas preferencialmente; na ausência delas, o sistema envia o endereço para pesquisa no Waze.

## Geolocalização do vendedor

Na tela **Planejar rota**, o botão **Usar minha localização** solicita ao navegador a posição atual do dispositivo. A aplicação usa latitude e longitude somente para consultar prospects no raio selecionado; a posição do vendedor não é armazenada no banco e não há rastreamento contínuo.

O recurso exige HTTPS (ou `localhost`) e permissão explícita do usuário. Para que a busca retorne resultados, os prospects também precisam estar geocodificados, com latitude e longitude. O Waze utiliza a posição atual do dispositivo como origem e cada visita compartilhada como destino.
