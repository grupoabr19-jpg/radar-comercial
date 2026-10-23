# Descoberta mensal de prospects por CNAE

O workflow `Descobrir prospects por CNAE` roda todo dia 15, às 06:17 no horário de Brasília, e também pode ser iniciado manualmente em **Actions**.

## Configuração obrigatória

No GitHub, acesse **Settings → Secrets and variables → Actions → Secrets** e crie:

- `NEON_DATABASE_URL`: string de conexão pooled do Neon usada pela aplicação.

O token público atual do compartilhamento da Receita já possui um valor padrão. Se a Receita trocar o compartilhamento, crie a variável `RFB_SHARE_TOKEN` em **Variables** sem alterar o código.

## Funcionamento

1. Aplica as migrações do banco.
2. Detecta a competência mais recente na pasta pública da Receita Federal.
3. Lê os CNPJs dos clientes e as cidades das rotas no Neon.
4. Processa os arquivos de estabelecimentos um por vez, sem descompactar a base inteira.
5. Aprende os CNAEs mais frequentes nos clientes conhecidos.
6. Mantém apenas empresas ativas, nas cidades das rotas e nos CNAEs-alvo.
7. Exclui CNPJs e raízes empresariais já presentes no ERP.
8. Carrega no máximo 5.000 prospects por execução e grava a competência e as razões da recomendação.

Os ZIPs nacionais ficam apenas no disco temporário do runner e são apagados após cada parte. Nenhum arquivo da Receita é salvo como artifact ou commitado no repositório.

## Execução manual

Em **Actions → Descobrir prospects por CNAE → Run workflow**, é possível informar:

- `snapshot`: competência específica no formato `AAAA-MM`;
- `max_prospects`: limite de oportunidades carregadas no Neon.

O histórico fica na tabela `discovery_runs`. Os CNAEs aprendidos ficam em `prospecting_cnaes` e podem ser ativados, desativados ou ter o peso ajustado futuramente pela interface administrativa.
