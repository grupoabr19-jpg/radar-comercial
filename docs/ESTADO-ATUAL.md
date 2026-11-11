# Radar Comercial — estado atual

Este documento resume o que está implementado e o que foi verificado no ambiente em 11/11/2026. Use-o como contexto ao pedir os próximos passos. **Não contém credenciais nem valores do `.env`.**

## Resumo

O Radar Comercial é uma aplicação interna de inteligência comercial do Grupo ABR. Reúne cadastro e consulta de clientes do ERP, importação de planilhas, gestão de prospects, territórios comerciais e planejamento de rotas e visitas.

## Arquitetura e execução

- **Servidor e API:** Node.js 22 e Express 5, com o ponto de entrada em `server/index.js`.
- **Interface:** HTML, CSS e JavaScript servidos pelo próprio Express a partir de `dist/`.
- **Banco:** PostgreSQL no Neon. A aplicação usa `DATABASE_URL`; as migrações preferem `DATABASE_URL_UNPOOLED` e recorrem à primeira URL se a conexão direta não for válida.
- **Hospedagem prevista:** Render, serviço web `radar-comercial`, região da Virgínia, configurado em `render.yaml`. O Blueprint prevê deploy automático em commits e plano gratuito. A configuração do repositório, sozinha, não confirma se o serviço Render está ativo nem qual é sua URL pública.
- **Início local:** `npm start` carrega `.env` se existir e inicia `server/index.js`. O servidor aplica migrações pendentes antes de começar a aceitar requisições. `npm run dev` inicia em modo watch.
- **Dependências principais:** `express`, `pg`, `multer`, `exceljs`, `helmet` e `compression`. O requisito declarado é Node `>=22 <23`.

## Autenticação e API

O login de administrador usa `ADMIN_EMAIL` e `ADMIN_PASSWORD`. As páginas e rotas `/api` exigem uma sessão assinada por `SESSION_SECRET`; o cookie é HttpOnly, SameSite Strict e, em produção, Secure. A sessão expira após 12 horas. `/api/health` é uma exceção pública que verifica a conexão ao banco.

Rotas implementadas em `server/index.js` incluem:

- `/api/auth/login`, `/api/auth/logout`, `/api/auth/session`
- `/api/health`, `/api/dashboard`
- `/api/customers`, `/api/customers/map`
- `/api/prospects`, `/api/prospects/nearby`
- `/api/cnaes`
- `/api/visits`
- `/api/imports`, `/api/sync/google-sheet`
- `/api/regions`, `/api/routes`, `/api/routes/:routeId/navigation`
- `/api/lookup/cep/:cep`, `/api/lookup/cnpj/:cnpj`

## Funcionalidades implementadas

1. **Clientes do ERP:** importação de planilhas Excel, deduplicação e consulta da carteira. A classificação de carteira considera, entre outros dados, tempo desde a última venda.
2. **Importação e auditoria:** arquivos Excel de até 30 MB são processados no servidor. Lotes e linhas importados registram origem, campos detectados, validações, aceitos, rejeitados e duplicados.
3. **Google Sheets:** exportação de uma planilha compartilhada como XLSX. A configuração local tem uma URL no domínio `docs.google.com` e ativa a sincronização automática; ela importa dados da aba operacional de varejo e, quando habilitada, da aba “Base de clientes”. O servidor exige que a planilha permita leitura por link.
4. **Prospects:** consulta, cadastro manual, prioridade, score, status, potencial estimado e pesquisa. A geolocalização manual usa o centro aproximado do município quando há cidade e UF reconhecidas.
5. **Territórios:** regiões comerciais, cidades associadas e expansão geográfica por raio a partir de um polo, usando coordenadas municipais.
6. **Rotas e visitas:** planejamento de rotas e paradas, registro de visitas, cálculo de proximidade e criação de links de navegação/compartilhamento do Waze.
7. **Consultas externas:** BrasilAPI para consulta de CEP e CNPJ; catálogo local de municípios em `data/municipios.json`.
8. **Descoberta de empresas:** workflow mensal do GitHub Actions que processa dados abertos de CNPJ da Receita Federal. Aprende CNAEs a partir dos clientes conhecidos, permite curadoria e pretende criar prospects em cidades cobertas pelas rotas.

## Banco: estado verificado

As duas URLs de conexão presentes no `.env` conectaram com SSL ao mesmo banco Neon `radar_comercial`, schema `public`, PostgreSQL 18.6. A verificação foi somente de leitura: não foram feitas importações, migrações ou atualizações. As seis migrações existentes no repositório estão aplicadas; não há migrações locais pendentes nem versões desconhecidas no banco.

Contagens observadas durante a consulta:

| Tabela | Linhas |
|---|---:|
| `erp_customers` | 23.308 |
| `import_rows` | 46.962 |
| `import_batches` | 3 |
| `route_regions` | 8 |
| `region_cities` | 365 |
| `municipalities` | 365 |
| `audit_events` | 25 |
| `schema_migrations` | 6 |
| `discovery_runs` | 1 |
| `prospects` | 0 |
| `prospecting_cnaes` | 0 |
| `prospecting_cnae_matches` | 0 |
| `planned_routes` | 0 |
| `route_stops` | 0 |
| `visits` | 0 |

As três importações registradas estão concluídas: uma de rotas (366 linhas aceitas) e duas do ERP (23.308 aceitas na mais recente; 23.262 aceitas e 25 rejeitadas na anterior).

## Migrações e modelo de dados

Os arquivos em `migrations/` cobrem:

- `001_initial`: clientes ERP, prospects, visitas, auditoria, lotes e linhas de importação.
- `002_regions_routes_waze`: municípios, territórios, cidades por região, rotas planejadas e paradas.
- `003_seed_current_sales_regions`: regiões comerciais iniciais e cidades associadas.
- `004_live_sheet_regions`: contatos e metadados de origem das regiões; tipo de cobertura das cidades.
- `005_cnpj_discovery`: CNAE e situação cadastral, execuções de descoberta e CNAEs-alvo.
- `006_cnae_curation`: estado de revisão/curadoria de CNAEs e relações entre CNAEs.

O registro da última execução de descoberta está `running`, sem conclusão. Não existem CNAEs curados ou prospects descobertos no banco consultado.

## Automação e pendências observadas

- A execução mais recente visível do workflow de descoberta, em 26/10/2026, falhou durante o processamento de um ZIP da Receita Federal: o download retomado não resultou em um arquivo ZIP válido. Ao tentar marcar a execução como falha, a conexão SSL com o Neon já havia sido encerrada, deixando o registro como `running`.
- O histórico disponível no GitHub Actions mostra seis execuções desse workflow, todas com conclusão `failure`. O diagnóstico mais recente aponta falha no download/arquivo e queda posterior da conexão do banco. A etapa de migrações daquela execução terminou com sucesso.
- `AUTO_SYNC_CUSTOMERS` aparece duplicada no `.env`, com valores iguais; a última ocorrência é a efetiva. Vale manter uma única definição.
- A configuração local informa as variáveis de banco, autenticação, porta, planilha e sincronização, mas os valores são omitidos deste documento e não devem ser incluídos em prompts ou logs.
- No ambiente em que a verificação foi feita, Node.js não estava disponível; por isso não foi possível iniciar o servidor nem executar `npm test`. A conexão real ao PostgreSQL foi validada separadamente com um cliente temporário e consultas somente de leitura.
- A configuração do Render e o acesso ao Neon demonstram o destino configurado, mas não confirmam disponibilidade pública, domínio do app ou estado atual do serviço hospedado.

## Implementação de macro-segmentação/lookalike em andamento

A migração `007_market_segments_and_route_endpoints.sql` ainda não foi aplicada. Ela preserva a taxonomia macro/micro da planilha, relaciona nomes de clientes de referência aos microssegmentos e cria `company_cnaes`, com o CNPJ, CNAE principal e array de CNAEs secundários. CNAEs principais já existentes são copiados para essa tabela como registros legados, que continuam elegíveis ao enriquecimento BrasilAPI para obter os CNAEs secundários.

O enriquecimento é feito em lotes pequenos e retomáveis. A reconciliação de nomes associa os clientes da Tabela 1 aos CNAEs da Tabela 2; relações CNAE–segmento são derivadas desses clientes de referência, sem presumir que a planilha forneça CNAEs. O script da Receita consulta os CNAEs principal e secundários desses clientes, encontra estabelecimentos na cobertura das regiões e grava a origem `Descoberta por CNAE/Lookalike`. O prospect recebe o segmento do cliente espelho quando há uma associação não ambígua; conflitos permanecem sem classificação automática.

As alterações de mapa e roteamento que já constam no repositório foram mantidas: tooltip com dados/segmento/status, identificação visual por tipo, sugestões geográficas A–B, inclusão manual e compartilhamento por WhatsApp com um link Waze individual para cada parada ordenada. O motorista abre cada link para navegar à próxima visita. Os pontos municipais e o corredor A–B são aproximações, não uma malha viária real.

O registro de visita também permite anexar opcionalmente a localização atual do celular e uma foto. A posição é capturada somente após ação explícita e consentimento do navegador; a imagem JPG, PNG ou WebP é limitada a 5 MB e guardada no PostgreSQL, em uma tabela separada. A foto só é entregue pela API autenticada.

Antes de executar a migração ou o enriquecimento em produção, instalar as dependências Node do projeto, rodar a suíte de testes, revisar a migração em ambiente de teste e confirmar a execução controlada dos lotes. Nenhuma migração foi executada nem nenhuma chamada em massa à BrasilAPI foi iniciada durante esta implementação.

## Arquivos úteis para continuar

- `server/index.js`: rotas HTTP, regras da API e inicialização do app.
- `server/db.js`: pool e consultas PostgreSQL.
- `server/migrate.js` e `migrations/`: aplicação e definição do schema.
- `server/importer.js`, `server/google-sheet.js` e `server/sheet-sync.js`: importação de planilhas e sincronização.
- `server/auth.js`: autenticação e sessões.
- `server/navigation.js`: distância e compartilhamento de rotas.
- `server/brasil-api.js`: consultas de CNPJ e CEP.
- `scripts/discover_prospects.py` e `scripts/cnae_curation.py`: descoberta e curadoria de CNAEs.
- `.github/workflows/discover-prospects.yml`: execução agendada/manual da descoberta.
- `render.yaml` e `docs/PRODUCAO.md`: configuração e operação previstas em produção.
- `package.json` e `test/`: comandos e testes existentes.

## Instrução sugerida para o próximo prompt

> Leia `docs/ESTADO-ATUAL.md` e os arquivos do sistema relacionados ao objetivo. Quero implementar: **[descrever o próximo passo]**. Preserve os dados existentes no Neon; não exponha nem altere segredos do `.env`. Antes de modificar o banco ou executar uma operação destrutiva, explique o impacto e peça confirmação. Faça alterações cirúrgicas, atualize a documentação relacionada e execute os testes disponíveis. Ao final, informe arquivos alterados, verificações realizadas e pendências.
