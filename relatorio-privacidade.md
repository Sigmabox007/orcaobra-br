# Relatório — Revisão final de privacidade e proteção de dados

Data: 1º/11/2026. Projeto não publicado. Nenhum pedido ou registro foi alterado ou excluído.

## a) Arquivos alterados
- `src/lib/orcaobra/rules.ts` — filtro de contatos (`maskContacts`) refeito: reconhece telefones brasileiros (com/sem DDD, +55, 0, parênteses), internacionais com “+”, e-mails (inclusive com acentos) e CPF formatado; deixou de apagar medidas, quantidades, CEPs e códigos de produto.
- `src/lib/orcaobra/ai-prompts.ts` (novo) — montagem única e testável do texto enviado à IA.
- `src/lib/orcaobra/ai.server.ts` — passa a usar `ai-prompts.ts`; comportamento das chamadas mantido.
- `src/lib/orcaobra/public.functions.ts` — falha ao gravar pedido registra só o código do erro (antes podia ecoar nome, WhatsApp e texto no log).
- `src/routes/privacidade.tsx` — política reescrita.
- `src/lib/orcaobra/ai-prompts.test.ts`, `src/test/privacy-page.test.tsx` (novos) — testes.
- `AGENTS.md`, `roadmap.md`, `relatorio-privacidade.md`.

## Auditoria
| Ponto | Constatação |
|---|---|
| Dados do pedido | nome, WhatsApp, observações, texto original, respostas, interpretação da IA, itens, complementos, data da autorização; status, histórico, anotações internas e retornos da equipe. |
| Metadados | `ai_usage` e `submit_log`: hash SHA-256 (truncado, sem chave secreta) de IP + navegador, id aleatório da sessão, tipo/sucesso, data. IP bruto não é gravado. É pseudonimização, não anonimização. |
| Navegador | público: `sessionStorage` (id aleatório e protocolo). Painel: sessão de login no armazenamento local. Sem cookies de publicidade ou análise próprios. |
| Terceiros | Lovable (hospedagem; banco Lovable Cloud em servidores AWS nos EUA), Lovable AI Gateway → OpenAI, Google Fonts (carregado do Google), WhatsApp/Meta (links wa.me). |
| Acesso | anônimos sem acesso a tabelas; leitura somente para equipe (`is_staff`); exclusão de pedidos só para administradores; papéis apenas em `user_roles`. |
| Logs | erros de IA registram só tipo/código; erro de gravação do pedido corrigido. |

## b) Dados enviados à IA (confirmado no código e em testes)
- Análise: somente a descrição do pedido, mascarada.
- Sugestões: descrição e respostas mascaradas + lista de regras revisadas/ativas (sem dados pessoais).
- Nome, WhatsApp e observações nunca entram nas funções que montam o texto da IA.
- Testes cobrem 13 formatos de telefone, e-mail e CPF, e 10 casos de medidas/quantidades/códigos preservados. Teste ao vivo: pedido com telefone no texto seguiu normalmente para as perguntas (nenhum pedido enviado).
- Limite: nomes, endereços ou formatos incomuns (ex.: número por extenso) não são removidos — a política avisa isso.

## c) Página de Privacidade
Inclui razão social, CNPJ, canal WhatsApp Business com link, categorias de dados e metadados, finalidades (sem publicidade), bases legais (art. 7º V, IX, II e VI), alcance da autorização de contato, explicação fiel da IA, fornecedores e transferência internacional, acesso, retenção (abertos x encerrados), direitos do art. 18 com procedimento, segurança sem garantia absoluta e data de atualização. O aviso “texto provisório” foi removido.

## d) Retenção de 12 meses — procedimento manual do piloto
“Encerrado” = status *Convertido em venda* ou *Perdido ou encerrado*; a data de encerramento é o último registro desse status no histórico.

Revisão mensal: identificar pedidos vencidos (somente leitura):
```sql
select q.protocol, q.status, max(h.created_at) as encerrado_em
from quote_requests q
join status_history h on h.request_id = q.id and h.to_status = q.status
where q.status in ('convertido','perdido')
group by q.id, q.protocol, q.status
having max(h.created_at) < now() - interval '12 months';
```
Confirmar com a loja se algum precisa ser guardado por obrigação legal; os demais são excluídos (itens, complementos, histórico e retornos são apagados junto, em cascata).

**Pendências**
1. O painel não tem botão para excluir um pedido real nem filtro de “prazo vencido”; hoje só exclui pedidos de teste. A exclusão é permitida a administradores no banco, mas precisa ser executada com suporte técnico. Os primeiros pedidos reais só vencem em 2027.
2. Pedidos de eliminação feitos por clientes antes do prazo têm a mesma limitação.
3. Registros técnicos (`ai_usage`, `submit_log`) não têm prazo definido pela loja; sugestão: 6 meses, na mesma revisão.

**Menor correção segura proposta (não implementada):** botão “Excluir dados deste pedido”, só para administradores, em pedidos encerrados há mais de 12 meses ou mediante solicitação do titular, com digitação do protocolo para confirmar; filtro “Retenção vencida” na lista. Não exige migração.

## e) Testes e build
- 50 testes automatizados aprovados (4 arquivos), incluindo 28 de mascaramento/conteúdo da IA e 3 da página de privacidade.
- Build mais recente: OK. Página de privacidade aberta no navegador sem erros; links do WhatsApp apontam para `wa.me/5521973627697`.

## f) Riscos e pendências antes de publicar
- Revisão jurídica do texto da política (não declara conformidade absoluta).
- Pendências de exclusão no painel (item d).
- Google Fonts envia IP ao Google; alternativa é hospedar as fontes no próprio site.
- O código de origem é um hash sem chave secreta; pode ser reidentificável com esforço. Melhoria futura: chave secreta no hash.
- Política de retenção/uso de dados dos fornecedores de IA não foi verificada de forma independente.
- Validação em celular não repetida; sem sessão separada com perfil vendedor.
