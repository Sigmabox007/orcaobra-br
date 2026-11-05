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

### Campos aceitos (validação no banco)
A função lê do pacote só uma lista fechada de campos: nome, WhatsApp, observações do cliente, texto original, interpretação, esclarecimentos, itens, sugestões (id da regra, motivo, aceito), falha da IA, chave de envio, origem.
- Qualquer campo fora da lista faz a função recusar o pacote inteiro.
- Definidos sempre pelo banco, nunca pelo pacote: status `recebido`, marcação de teste falsa, observações internas vazias, datas de retorno vazias, loja (busca a piloto), data de consentimento (`now()`), autor do histórico vazio.
- Limites de tamanho e quantidade conferidos de novo no banco (texto, até 30 itens, até 5 sugestões, até 3 esclarecimentos).
- Sugestões: o nome do complemento vem da regra no banco, e só se ela estiver revisada e ativa; regra inválida recusa o pedido.
- Nenhum campo de papel ou permissão existe no pacote; a função não toca em `user_roles`.

### Reenvio sem duplicar (idempotência)
- Novas colunas opcionais em `quote_requests` (aditivas, nulas nos pedidos antigos): `submission_key uuid` com índice único, `submission_hash text` (resumo SHA-256 do conteúdo do pedido) e `submission_origin text` (identificador de origem já com chave, igual ao de `submit_log`).
- O navegador gera uma chave por pedido no assistente e a reenvia nas novas tentativas (clique duplo, conexão caiu).
- O resumo é calculado dentro do banco a partir dos campos aceitos, em forma padronizada; o navegador não o informa.
- Mesma chave + mesmo resumo + mesma origem: devolve o protocolo já gravado, sem criar outro.
- Mesma chave com conteúdo diferente: recusa ("conflito"), sem gravar nem revelar nada.
- Mesma chave e conteúdo vindos de outra origem: recusa com a mesma mensagem genérica, sem protocolo nem dados.
- Recuperação só vale por 24 horas após a gravação.
- Colisão de protocolo: tentado de novo dentro da função (até 5 vezes).

### Limite de envios e concorrência
Hoje existe condição de corrida: o servidor conta os envios da origem e só depois grava; duas solicitações simultâneas podem ler a mesma contagem e ambas passarem do limite.
Correção dentro da Fase 0A: a conferência do limite passa para dentro da função transacional.
1. Trava por origem durante a transação (`pg_advisory_xact_lock` sobre o identificador da origem): envios simultâneos da mesma origem passam um de cada vez.
2. Com a trava, verifica primeiro se a chave já existe (recuperação, ver acima). Recuperação legítima não conta como envio e não é bloqueada pelo limite.
3. Só então conta `submit_log` da última hora, lendo o limite atual de `app_settings` (valor não muda), e recusa se atingido.
4. Grava pedido, itens, complementos, histórico e `submit_log`; a trava é liberada no fim.
A conferência atual no servidor continua como primeira barreira (sem custo para o banco); a do banco é a definitiva. Origens diferentes não se bloqueiam entre si.

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
- Idempotência: mesma chave com texto, item ou WhatsApp diferente é recusada e não cria pedido; mesma chave e conteúdo idêntico devolve o mesmo protocolo.
- Campos proibidos: pacote com status, marcação de teste, observações internas, loja, autor ou campo desconhecido é recusado; pedido válido sempre nasce `recebido`, não teste, sem observações internas.
- Concorrência: duas sessões simultâneas da mesma origem no limite (uma espera a trava da outra) — só uma grava; origens diferentes gravam em paralelo.
- Reenvio: com a origem no limite, a recuperação do pedido já gravado devolve o protocolo; a mesma chave e conteúdo de outra origem não devolve protocolo nem dado; após 24 horas a recuperação é recusada.

Ponta a ponta na prévia: enviar um pedido pelo assistente, ver a confirmação, conferir no painel e marcá-lo como teste (admin). Este é o único registro novo criado.

Regressão: os 56 testes atuais; contagem de registros por tabela antes e depois (diferença esperada: só o pedido de teste da prévia).

## 6. Riscos

- Banco compartilhado: mitigado por migração apenas aditiva.
- Erro na função bloquearia novos pedidos na prévia: testado antes de publicar; a publicada segue no caminho antigo.
- Chave de reenvio forjada não dá acesso a nada: exige o mesmo conteúdo completo e a mesma origem, e só devolve o protocolo.
- Usuários atrás da mesma rede (mesma origem) passam a enviar um de cada vez; o atraso é de milissegundos.
- Clientes cuja rede muda entre tentativas (Wi-Fi para 4G) não recuperam o protocolo: o reenvio é recusado e o pedido original continua gravado; a equipe o vê no painel. Risco aceito para não expor pedidos a outras origens.

## 7. Recuperação

- Backup externo já verificado por vocês.
- Contagens antes/depois registradas no relatório.
- Desfazer: voltar o código para a versão anterior (compatível); a função e a coluna podem ficar sem uso. Remoção só com nova aprovação.
- Nenhum dado existente é alterado, então não há dado a restaurar.

## Entrega

Relatório `relatorio-fase-0a.md` com o que mudou, contagens, resultados dos testes e o que não foi verificado. Sem publicação.
