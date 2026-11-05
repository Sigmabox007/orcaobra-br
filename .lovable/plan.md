# Fase 0A — Integridade transacional dos pedidos (plano técnico)

Somente plano. Nada será implementado, migrado ou alterado antes da sua aprovação.

## 1. Situação atual (verificada no código)

Função responsável: `submitRequest` em `src/lib/orcaobra/public.functions.ts`, executada só no servidor com a chave privilegiada.

Sequência atual, em chamadas separadas (sem transação):
1. Valida dados (zod), WhatsApp, campo-isca, consentimento.
2. Calcula a origem (HMAC, falha fechada) e confere o limite de envios por hora em `submit_log`.
3. Busca a loja e confere as sugestões contra regras revisadas e ativas.
4. Insere `quote_requests` (até 3 tentativas se o protocolo colidir).
5. Insere `request_items` — erro ignorado.
6. Insere `suggested_complements` — erro ignorado.
7. Insere `status_history` — erro ignorado.
8. Insere `submit_log` — erro ignorado.
9. Retorna o protocolo, mesmo que 5–8 tenham falhado.

Risco: pedido sem itens, sem complementos ou sem histórico, e o cliente vê "sucesso".

## 2. Solução proposta

Uma única função no banco, `public.submit_quote_request(payload jsonb)`, que grava tudo dentro de uma transação: pedido, itens, complementos, histórico inicial e registro de envio. Qualquer erro desfaz tudo.

O servidor continua fazendo, antes de chamar a função, todas as proteções atuais: validação, origem com chave, limite de envios, conferência das regras, limites da IA (que nem passam por aqui). Nada disso muda.

### Acesso restrito
- `SECURITY INVOKER`, `search_path` fixo.
- `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated`; `GRANT EXECUTE ... TO service_role` apenas.
- Visitantes e equipe não podem chamá-la; só o servidor do app.

### Protocolo só após gravação completa
O protocolo é gerado dentro da função; ela só o devolve se tudo foi gravado. O servidor só retorna `ok: true` com protocolo após resposta sem erro; em qualquer erro, retorna a mensagem genérica atual. A tela de confirmação já depende desse retorno (será reconferido).

### Reenvio sem duplicar
- Nova coluna opcional `quote_requests.submission_key uuid` com índice único (aditiva, nula para os pedidos antigos).
- O navegador gera uma chave por pedido no assistente e a reenvia em novas tentativas (clique duplo, rede instável).
- Se a chave já existe, a função devolve o protocolo do pedido já gravado, sem criar outro nem contar novo envio.
- Colisão de protocolo: tentado de novo dentro da função (até 5 vezes).

## 3. Efeito na versão publicada

O banco é o mesmo para a prévia e para o site publicado: a migração vale na hora, sem republicar. Por isso a sequência é só aditiva:

1. Migração: criar coluna nula + índice único + função nova. O site publicado não usa nenhum dos dois e continua funcionando igual.
2. Alterar o código (servidor e assistente) para usar a função. Só vale na prévia.
3. Testar na prévia.
4. Publicação somente com sua autorização. O código antigo continua compatível com o banco novo, permitindo voltar atrás.

Nenhuma coluna ou tabela é removida ou alterada; nenhum pedido existente é tocado.

## 4. Arquivos e funções afetados

- Migração nova: coluna `submission_key`, índice único, função `submit_quote_request`, permissões.
- `src/lib/orcaobra/public.functions.ts`: `submitRequest` passa a montar o pacote e chamar a função; aceita `submissionKey` (uuid) no schema; remove as inserções soltas.
- `src/lib/orcaobra/rules.ts`: função pura `buildSubmitPayload` (monta o pacote a partir dos dados validados), testável.
- `src/routes/index.tsx`: gerar e guardar a chave de envio do assistente; nenhuma mudança visual.
- `src/integrations/supabase/types.ts`: regenerado.
- `AGENTS.md`: regra "envio do pedido só pela função transacional".

Não muda: interface, textos, papéis, usuários, limites de IA, regras, privacidade, multi-loja.

## 5. Testes previstos

Automatizados (vitest, sem banco):
- `buildSubmitPayload`: itens, complementos aceitos/recusados, sugestões inválidas descartadas, chave preservada.
- `submitRequest` com cliente simulado: erro da função → `ok: false` sem protocolo; sucesso → protocolo; limite de envios ainda bloqueia; origem ausente ainda falha fechada.

Integração no banco, sem afetar dados da loja (cada teste dentro de uma transação que é desfeita no final — `BEGIN ... ROLLBACK`):
- Pedido válido: grava pedido, itens, complementos, histórico e registro de envio.
- Falha simulada em cada etapa obrigatória (item inválido, complemento com regra inexistente, status inválido): nenhuma linha fica em nenhuma tabela.
- Mesma chave enviada duas vezes: um só pedido, mesmo protocolo.
- Permissões: como visitante anônimo e como usuário logado, chamar a função retorna "permissão negada".

Ponta a ponta na prévia: enviar um pedido pelo assistente, ver a confirmação, conferir no painel e marcá-lo como teste (admin). Este é o único registro novo criado.

Regressão: os 56 testes atuais; contagem de registros por tabela antes e depois (diferença esperada: só o pedido de teste da prévia).

## 6. Riscos

- Banco compartilhado: mitigado por migração apenas aditiva.
- Erro na função bloquearia novos pedidos na prévia: testado antes de publicar; a publicada segue no caminho antigo.
- Chave de reenvio forjada não dá acesso a nada: só devolve o protocolo do mesmo envio, que o cliente já recebeu.

## 7. Recuperação

- Backup externo já verificado por vocês.
- Contagens antes/depois registradas no relatório.
- Desfazer: voltar o código para a versão anterior (compatível); a função e a coluna podem ficar sem uso. Remoção só com nova aprovação.
- Nenhum dado existente é alterado, então não há dado a restaurar.

## Entrega

Relatório `relatorio-fase-0a.md` com o que mudou, contagens, resultados dos testes e o que não foi verificado. Sem publicação.
