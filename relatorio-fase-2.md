# OrçaObra — Relatório da Fase 2

Data: 08/11/2026, UTC.

**Execução interrompida na conferência preliminar. A migração NÃO foi executada. Nenhuma tentativa de correção foi feita. Nada publicado; Fase 3 não iniciada.**

## Autorização e backup

O proprietário autorizou exclusivamente o SQL corrigido de `docs/fase-2-sql-proposto.md`, em uma única transação, com interrupção e diagnóstico em caso de erro, antes de qualquer correção.

Backup pós-Fase 1 confirmado pelo proprietário: bucket `database_export_08_11_26`, arquivo `orcaobra-br_261108.backup`, 443 KB, de 08/11/2026, baixado e guardado em local seguro, preservando a exportação anterior. **Integridade e restauração não testadas; arquivo não verificado independentemente nesta execução.**

## Diagnóstico impeditivo

O SQL autorizado contém:

```sql
user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE
```

A regra vigente do Lovable Cloud permite essa referência direta a `auth.users` somente em `public.profiles` e `public.user_roles`. Novas tabelas de aplicação devem armazenar IDs de usuários como UUID simples ou referenciar `public.profiles` quando houver necessidade de campos de perfil. A tabela proposta `public.store_members` não está entre as exceções.

A justificativa da seção 2 do plano anterior, de que a exceção se estenderia a qualquer tabela de papéis, foi incorreta. A conferência das instruções da plataforma confirmou o conflito antes de qualquer aplicação.

**Não apliquei o SQL autorizado nem o substituí silenciosamente por outro.** Uma eventual revisão para `user_id uuid NOT NULL` removeria a referência direta e também a exclusão automática do vínculo ao apagar a conta; essa diferença exige nova conferência e autorização do proprietário. Essa revisão não foi realizada nesta etapa.

## Verificações realizadas

- Documento SQL e plano arquivado lidos; `REVOKE ALL` antes dos `GRANT`s está presente, assim como a consulta de permissões efetivas solicitada.
- Consulta somente de leitura: `to_regclass('public.store_members')` retornou NULL; a tabela ainda não existe.
- Consulta somente de leitura: 2 registros em `public.user_roles` e 1 loja. Nenhum usuário, vínculo, papel ou loja foi criado ou alterado.
- Testes automáticos existentes: **69 aprovados, 5 arquivos**, executados com `bunx vitest run`.

## Verificações não realizadas

Como a execução foi interrompida antes da migração, não há resultado pós-migração de contagens completas, digests, preservação linha a linha dos administradores, permissões efetivas de `store_members`, comparação do catálogo ou painel autenticado. Nenhum desses critérios é declarado aprovado.

Não houve alteração do código nem atualização dos tipos gerados. A compilação não foi executada manualmente, conforme as regras do ambiente; não havia registro de compilação automática disponível nos diagnósticos consultados. Portanto **a compilação desta etapa não é declarada verificada**.

## Próximo passo

Aguardar a decisão do proprietário sobre a revisão mínima do SQL diante da restrição da plataforma. Sem nova autorização, não executar migração nem correção. Nenhuma restauração ou reversão é necessária, pois o banco não foi alterado.