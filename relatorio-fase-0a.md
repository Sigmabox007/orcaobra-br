# Fase 0A — Integridade transacional dos pedidos

Data: 06/11/2026. Não publicado.

## O que mudou
- Banco (mudança só aditiva): 3 colunas novas, opcionais, em `quote_requests` (`submission_key` com índice único, `submission_hash`, `submission_origin`) e a função `submit_quote_request`, que grava pedido, itens, complementos, histórico e registro de envio numa só transação. Só o servidor do app pode usá-la (visitante e equipe: negado, conferido).
- `src/lib/orcaobra/submit.ts` (novo): monta o pacote com a lista fechada de campos e interpreta a resposta do banco; protocolo só é devolvido após gravação completa.
- `src/lib/orcaobra/public.functions.ts`: `submitRequest` usa a função do banco; a contagem preliminar de envios no servidor foi removida (o banco decide, sob trava por origem). Validação, campo-isca e HMAC continuam.
- `src/routes/index.tsx`: chave de envio por pedido; só é reaproveitada se a conexão cair. Sem mudança visual.
- `AGENTS.md`: regra nova. Testes: `submit.test.ts`, `scripts/db-tests/`.

## Testes
- Automáticos: 69 passando (56 anteriores + 13 novos).
- Banco (tudo desfeito ao final, contagens idênticas antes/depois): pedido válido completo; falhas simuladas (regra inativa, item inválido após gravar o pedido, complemento inválido após gravar itens, dado inválido) sem registros parciais; idempotência (mesmo protocolo; conteúdo diferente recusado; outra origem recusada; após 24h recusado); campos proibidos recusados (status, teste, observações internas, loja, autor, desconhecido); cenário A (limite esgotado, recuperação devolve protocolo sem contar envio); cenário B (limite esgotado, pedido novo bloqueado); concorrência (mesma origem espera a trava, outra origem grava em paralelo).
- Ponta a ponta na prévia: pedido OO-P7X6-9BJG gravado completo pela função nova e confirmação exibida.

## Contagens
Antes: pedidos 10, itens 15, complementos 7, histórico 8, envios 7, retornos 1, papéis 2, lojas 1, regras 22.
Depois: pedidos 12, itens 17, complementos 9, histórico 10, envios 9; demais iguais.
Diferença: 2 pedidos de teste da prévia — OO-CXKF-UKUR (enviado antes de a prévia carregar o código novo, pelo caminho antigo) e OO-P7X6-9BJG (caminho novo). Ambos marcados como teste pelo admin. Nenhum registro antigo foi alterado ou excluído; usuários e papéis intactos.

## Não verificado
- Falha simulada nas etapas de histórico e registro de envio (sem permissão para injetar falha nessas tabelas); estão na mesma transação, então seguem a mesma regra.
- O site publicado continua no caminho antigo até a publicação, inclusive a condição de corrida do limite.

## Recuperação
Voltar o código anterior é compatível com o banco atual; colunas e função podem ficar sem uso.
