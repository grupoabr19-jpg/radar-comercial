# Operação em produção

## Fluxo de dados

1. **Clientes do ERP:** importar a base completa. Ela é a referência para histórico e para impedir que uma empresa já cadastrada seja tratada como prospect novo.
2. **Rotas e visitas:** importar a planilha operacional. Ela fica em staging e alimentará o planejamento depois de confirmarmos as colunas da última aba.
3. **Candidatos externos:** importar uma base empresarial pública ou licenciada. Somente esta origem cria prospects automaticamente. Antes disso, o sistema compara CNPJ e nome + cidade com o ERP.
4. **Conferência:** cada carga mantém arquivo, aba, campos detectados, contagens e motivo das rejeições/duplicidades.

Importar a base do ERP não “descobre” empresas novas. Para descoberta real é necessária uma fonte externa de CNPJ/empresas, respeitando licença e finalidade. O sistema já recebe essa base por Excel; uma integração automática pode usar a mesma camada depois.

## Variáveis do Render

- `DATABASE_URL`: URL com pool do Neon, usada pela aplicação.
- `DATABASE_URL_UNPOOLED`: URL direta do Neon, usada somente nas migrações.
- `ADMIN_EMAIL`: e-mail do administrador.
- `ADMIN_PASSWORD_HASH`: hash criado com `npm run hash-password -- "senha longa"`.
- `SESSION_SECRET`: gerada pelo Blueprint do Render.

## Publicação

O Render precisa acessar um repositório GitHub, GitLab ou Bitbucket. Depois de criar/vincular o repositório, o Blueprint `render.yaml` cria o serviço e solicita as variáveis secretas. Na primeira inicialização, as migrações são aplicadas com trava transacional antes de o servidor aceitar tráfego.

O plano gratuito no Blueprint serve para validação online e pode hibernar. Para operação contínua, altere `plan` depois de aprovar o custo mensal no Render.
