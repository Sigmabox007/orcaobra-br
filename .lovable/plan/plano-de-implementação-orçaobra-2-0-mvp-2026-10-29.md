# Plano de Implementação — OrçaObra 2.0 (MVP)

## 1. Resumo da solução
Aplicativo web mobile-first, em português, com duas áreas isoladas:
- **Área pública (cliente):** assistente guiado por IA que transforma um pedido livre em uma solicitação organizada, com perguntas de esclarecimento (até 3) e até 5 complementos opcionais.
- **Painel administrativo (loja):** login, dashboard com indicadores reais, lista e detalhe de solicitações, status, acompanhamento, botão de WhatsApp (link oficial wa.me) e revisão das regras de complementos.

Loja única (A.S. Figueiredo), com o campo de loja já presente nas tabelas para expansão futura, sem SaaS multiempresa agora.

## 2. Fluxo do cliente
```text
Página inicial -> "O que você precisa para sua obra ou reforma?"
  -> [Analisar pedido] (1 chamada de IA)
  -> Perguntas de esclarecimento (0 a 3, respostas curtas/opções)
  -> [Ver sugestões] (1 chamada de IA, com respostas)
  -> Cartões de complementos (todos desmarcados por padrão)
  -> Resumo (editável, sem preços/estoque)
  -> Contato: nome, WhatsApp, observações, consentimento
  -> Confirmação com protocolo (ex.: OO-2026-000123)
```
Se a IA falhar em qualquer etapa: aviso discreto e opção "Continuar com meu pedido original" até o envio.

## 3. Fluxo do vendedor
```text
Login -> Dashboard (indicadores) -> Lista (busca, filtros, ordenação, destaque "precisa de retorno")
  -> Detalhe: contato, pedido original, interpretação da IA, perguntas/respostas,
     sugestões x aceitas, observações internas, histórico de status
  -> Alterar status / registrar acompanhamento / abrir WhatsApp com mensagem pré-preenchida
```
Proprietário (admin) também gerencia usuários autorizados e regras de complementos.

## 4. Telas
Públicas: `/` (início + assistente em etapas), `/confirmacao` (sem identificador na URL), `/privacidade`.
Admin: `/entrar`, `/painel` (dashboard), `/painel/pedidos`, `/painel/pedidos/$id`, `/painel/regras`, `/painel/configuracoes` (limites de IA), `/painel/usuarios` (P1).

## 5. Banco de dados mínimo (Lovable Cloud)
- `stores` — loja piloto (nome, WhatsApp).
- `user_roles` — papéis `admin` e `seller` (tabela separada, função de verificação segura).
- `quote_requests` — protocolo, nome, WhatsApp, observações, consentimento + data, texto original, interpretação da IA (JSON), perguntas/respostas (JSON), categoria, status, `needs_followup_at`, `last_followup_at`, notas internas, flag `ai_failed`, flag `is_test`.
- `request_items` — itens (origem: `original` | `complement`), nome, quantidade informada, observação.
- `suggested_complements` — o que a IA sugeriu e se foi aceito (para métrica e auditoria).
- `association_rules` — categoria, atividade/produto gatilho, complemento, condição, pergunta de esclarecimento, explicação, `reviewed`, `reviewed_by`, `reviewed_at`, `active`.
- `status_history` — status anterior/novo, quem alterou, quando, observação.
- `followups` — registros de acompanhamento do vendedor.
- `ai_usage` — registro de cada chamada de IA (data, tipo, sucesso, identificador anônimo de origem), sem texto do cliente nem dados pessoais.
- `app_settings` — limites configuráveis de IA (diário global, por origem/hora, por pedido).

### Regras iniciais (revisão humana obrigatória)
Regras-semente das 3 categorias entram na migração como **rascunho**: `reviewed = false`, `active = false`. Só ficam visíveis para clientes depois que um administrador as revisa e ativa no painel (registrando quem e quando). Sem regras revisadas aplicáveis, o cliente prossegue normalmente sem sugestões.

### Dados de teste
Pedidos fictícios ficam marcados com `is_test = true`, exibem um selo "TESTE" no painel e são **excluídos de todos os indicadores** e da lista padrão (filtro opcional "mostrar testes"). Nomes e telefones fictícios são obviamente falsos (ex.: "Cliente Teste 01", número inválido). Antes de divulgar o link, um botão de admin remove todos os dados de teste.

## 6. Estratégia de IA
- Modelo padrão do Lovable AI Gateway, chamado apenas no servidor.
- **Chamada 1 — Interpretar:** retorna JSON estruturado: produtos, quantidades, atividade, categoria (pisos/sanitários/pintura/outro), informações ausentes, até 3 perguntas.
- **Chamada 2 — Sugerir:** recebe pedido + respostas + **somente as regras ativas e revisadas da categoria**; escolhe no máximo 5, com explicação. Só são aceitos IDs de regras existentes; a IA não inventa itens. Sem regras aplicáveis, a chamada 2 nem é feita.
- **Dados enviados à IA:** apenas o texto do pedido e as respostas de esclarecimento. A IA é chamada **antes** do formulário de contato, então nome e telefone nunca são enviados. Padrões que pareçam telefone/e-mail no texto são mascarados antes do envio.
- **Proteção contra instruções embutidas:** instruções fixas no papel de sistema; texto do cliente vai delimitado e rotulado como dado não confiável; a saída é validada por esquema rígido (campos, tamanhos, IDs de regras permitidos) e qualquer coisa fora disso é descartada. O cliente não consegue mudar o comportamento, porque a IA só pode devolver o formato esperado.
- Prompt de sistema proíbe preço, estoque, garantia de compatibilidade, quantidades técnicas, itens "obrigatórios" e orientação estrutural/elétrica.
- Fallback: falha, timeout ou limite atingido -> fluxo segue sem IA, pedido salvo com `ai_failed`.

### Volume e custo estimados
- Base: 25 pedidos/dia x 2 análises = **~50 chamadas/dia, ~1.500/mês**. Somando abandonos e reanálises, considerar até ~100/dia.
- O custo real por chamada depende do tamanho do texto e do modelo, então **não prometemos custo baixo**: ele será medido nas primeiras semanas.
- **Monitoramento:** contagem diária no painel (a partir de `ai_usage`), mais o histórico de uso e créditos do Lovable AI no workspace. Revisão semanal no piloto.

### Limites configuráveis (editáveis pelo admin)
- Por origem anônima (hash de IP + sessão): ex. 6 análises/hora e 20/dia. Cobre clientes legítimos que refazem um pedido.
- Por pedido: no máximo 2 interpretações + 2 sugestões (reanalisar após edição conta).
- Teto diário global: ex. 300 chamadas. Ao ser atingido, a IA é pausada até o dia seguinte e os clientes seguem pelo fluxo sem IA (nunca são bloqueados de enviar o pedido).
- Texto do pedido limitado (ex.: 1.500 caracteres); honeypot e intervalo mínimo entre envios.

## 7. Base de associações
Tela `/painel/regras`: listar, criar, editar, revisar, ativar/desativar. Uma regra só pode ser ativada depois de marcada como revisada por um administrador. Cartões ao cliente sempre trazem "Sugestão — a loja confirmará a compatibilidade". Nenhuma afirmação de que a loja vende o item.

## 8. Segurança
- RLS em todas as tabelas: público **não lê nada**; inserção pública só via função de servidor validada (não direto na tabela).
- Leitura/edição de pedidos apenas para `seller`/`admin`; regras, limites e usuários apenas `admin`.
- Validação de entradas no servidor (tamanhos, formato de WhatsApp BR, consentimento obrigatório).
- **Confirmação do protocolo:** o protocolo exibido é aleatório e não sequencial (ex.: `OO-7KQ4-M2XD`). A tela `/confirmacao` mostra apenas o que a própria sessão do navegador acabou de enviar (mantido em memória/armazenamento da sessão), sem consultar o banco e sem dados pessoais. Não existe rota pública para consultar pedido por protocolo, então não há enumeração.
- Antiabuso: limites da seção 6, honeypot, intervalo mínimo entre envios.
- Cadastro público desativado. Chaves só no servidor; nenhum segredo no código.

### Primeiro administrador (sem cadastro público)
1. O cadastro aberto fica desativado nas configurações de autenticação.
2. Você me informa o e-mail da proprietária. Eu crio esse usuário pelo Lovable Cloud (convite/link para definir senha) e insiro o papel `admin` em `user_roles` por migração/comando de servidor, nunca pelo app.
3. `user_roles` não aceita inserção/alteração por nenhum usuário pelo app (sem política de escrita no MVP); ninguém consegue se promover.
4. Vendedores adicionais no P0: criados da mesma forma, sob pedido. Tela de convite pelo painel fica no P1.

## 9. Custos e dependências
- Lovable Cloud (banco, autenticação): consumo conforme uso.
- Lovable AI: consumo por chamada, estimado na seção 6 e medido no piloto; protegido por limites.
- Sem serviços externos, sem API do WhatsApp, sem ERP.

## 10. Prioridades e ordem de construção

### P0 — essencial para o piloto
1. Identidade visual e ativação do Lovable Cloud.
2. Banco, papéis, RLS, regras-semente em rascunho, dados de teste marcados.
3. Fluxo do cliente sem IA (pedido -> resumo -> contato -> confirmação) — garante o fallback.
4. IA (interpretar + sugerir) com validação, limites e registro de uso.
5. Complementos opcionais (desmarcados por padrão).
6. Primeiro admin seguro e login.
7. Painel: lista, detalhe, status com histórico, acompanhamento, WhatsApp.
8. Revisão/ativação das regras e ajuste dos limites de IA.
9. Dashboard básico (contagens por status, excluindo testes) e contagem de uso de IA.
10. Página de privacidade e consentimento.
11. Testes de segurança (acesso não autorizado, enumeração, abuso, falha da IA, celular) e publicação.

### P1 — depois do piloto
Gestão de usuários pelo painel (convites, remoção), métricas adicionais (taxa de aceite de complementos, tempo de resposta, conversão), filtros e exportações avançadas, melhorias administrativas.

## 11. O que permanece manual
Consulta de preço e estoque no Gdoor, envio do orçamento pelo WhatsApp (vendedor confirma e envia), registro da venda e emissão fiscal no sistema da loja, criação de usuários no P0, revisão das regras.

## 12. Riscos e simplificações
- **IA sugerir algo inadequado:** restrita a regras revisadas, máximo de 5.
- **Abuso / gasto inesperado:** limites por origem, por pedido e teto diário, com fallback sem IA.
- **Nenhuma regra revisada no lançamento:** o app funciona sem sugestões; a loja precisa revisar as regras antes de divulgar.
- **Adoção pelos clientes:** depende de divulgar o link no WhatsApp da loja.
- **LGPD:** consentimento explícito e página de privacidade simples; texto jurídico final deve ser revisado pela loja.
- Simplificação: perguntas de esclarecimento como texto curto ou opções sugeridas pela IA.

## Detalhes técnicos
TanStack Start + server functions (`createServerFn`) para IA e envio público; middleware de autenticação nas funções do painel; `@lovable.dev/ai-gateway` com tipos gerados; papéis via `has_role()` security definer; limites contados em `ai_usage` no banco (não em memória). Testes unitários para regras críticas: limite de 5 sugestões, consentimento obrigatório, transições de status, validação de WhatsApp, limites de IA, exclusão de testes dos indicadores, regra não revisada nunca enviada à IA, mascaramento de contato no texto.
