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
Públicas: `/` (início + assistente em etapas), `/confirmacao/$protocolo`, `/privacidade`.
Admin: `/entrar`, `/painel` (dashboard), `/painel/pedidos`, `/painel/pedidos/$id`, `/painel/regras`, `/painel/usuarios` (somente admin).

## 5. Banco de dados mínimo (Lovable Cloud)
- `stores` — loja piloto (nome, WhatsApp).
- `user_roles` — papéis `admin` e `seller` (tabela separada, função de verificação segura).
- `quote_requests` — protocolo, nome, WhatsApp, observações, consentimento + data, texto original, interpretação da IA (JSON), perguntas/respostas (JSON), categoria, status, `needs_followup_at`, `last_followup_at`, notas internas, flag `ai_failed`.
- `request_items` — itens (origem: `original` | `complement`), nome, quantidade informada, observação.
- `suggested_complements` — o que a IA sugeriu e se foi aceito (para métrica e auditoria).
- `association_rules` — categoria, atividade/produto gatilho, complemento, condição, pergunta de esclarecimento, explicação, `reviewed`, `active`.
- `status_history` — status anterior/novo, quem alterou, quando, observação.
- `followups` — registros de acompanhamento do vendedor.

Regras-semente para as 3 categorias (pisos, sanitários, pintura) inseridas na migração. Dados fictícios de teste também via migração, marcados como fictícios.

## 6. Estratégia de IA
- Modelo padrão do Lovable AI Gateway, chamado apenas no servidor.
- **Chamada 1 — Interpretar:** retorna JSON estruturado: produtos, quantidades, atividade, categoria (pisos/sanitários/pintura/outro), informações ausentes, até 3 perguntas.
- **Chamada 2 — Sugerir:** recebe pedido + respostas + **somente as regras ativas e revisadas da categoria**; escolhe no máximo 5, com explicação. A IA seleciona a partir da base, não inventa itens soltos.
- Prompt de sistema proíbe preço, estoque, garantia de compatibilidade, quantidades técnicas, itens "obrigatórios" e orientação estrutural/elétrica. Texto do cliente vai delimitado como dado não confiável.
- Validação no servidor do JSON retornado (esquema), cortes de tamanho, limite de 5 sugestões.
- Custo: 2 chamadas por pedido, nunca por tecla; resultado guardado no estado da sessão para não repetir ao voltar.
- Fallback: falha/timeout -> fluxo segue sem IA, pedido salvo com `ai_failed`.

## 7. Base de associações
Tela `/painel/regras`: listar, criar, editar, ativar/desativar e marcar como revisada. Só regras ativas e revisadas alimentam a IA. Cartões ao cliente sempre trazem "Sugestão — a loja confirmará a compatibilidade". Nenhuma afirmação de que a loja vende o item.

## 8. Segurança
- RLS em todas as tabelas: público **não lê nada**; inserção pública só via função de servidor validada (não direto na tabela).
- Leitura/edição de pedidos apenas para `seller`/`admin`; regras e usuários apenas `admin`.
- Validação de entradas no servidor (tamanhos, formato de WhatsApp BR, consentimento obrigatório).
- Antiabuso: limite por IP/telefone (ex.: 5 envios/hora e limite de chamadas de IA), campo honeypot.
- Cadastro público desativado; o primeiro admin é criado manualmente por você (convite), sem admin automático.
- Chaves só no servidor; nenhum segredo no código.

## 9. Custos e dependências
- Lovable Cloud (banco, autenticação) — uso dentro do plano.
- Lovable AI — consumo por pedido (~2 chamadas). Com ~25 pedidos/dia, custo baixo; monitorável.
- Sem serviços externos, sem API do WhatsApp, sem ERP.

## 10. Ordem de construção
1. Identidade visual (cores informadas, tipografia, componentes base) e ativação do Lovable Cloud.
2. Banco, papéis, RLS, regras-semente e dados fictícios.
3. Fluxo do cliente sem IA (pedido -> resumo -> contato -> protocolo) — garante o fallback.
4. Integração de IA (interpretar + sugerir) com validação e limites.
5. Login e painel: lista, detalhe, status, histórico, acompanhamento, WhatsApp.
6. Dashboard com indicadores reais.
7. Tela de regras e gestão de usuários.
8. Testes dos 15 critérios (incluindo acesso não autorizado, celular e falha de IA), varredura de segurança e publicação.

## 11. O que permanece manual
Consulta de preço e estoque no Gdoor, envio do orçamento pelo WhatsApp (vendedor confirma e envia), registro da venda e emissão fiscal no sistema da loja, convite de novos usuários, revisão das regras.

## 12. Riscos e simplificações
- **IA sugerir algo inadequado:** mitigado por restringir à base revisada e limitar a 5.
- **Abuso do formulário público / custo de IA:** limites por IP/telefone e honeypot.
- **Base de regras pequena:** começamos com ~10 regras por categoria; a loja amplia pelo painel.
- **Adoção pelos clientes:** depende de divulgar o link no WhatsApp da loja.
- **LGPD:** consentimento explícito e página de privacidade simples; texto jurídico final deve ser revisado pela loja.
- Simplificação proposta: perguntas de esclarecimento como texto curto ou opções sugeridas pela IA (sem formulários dinâmicos complexos).

## Detalhes técnicos
TanStack Start + server functions (`createServerFn`) para IA e envio público; middleware de autenticação nas funções do painel; `@lovable.dev/ai-gateway` com tipos gerados; papéis via `has_role()` security definer; testes unitários para regras críticas (limite de 5 sugestões, consentimento obrigatório, transições de status, validação de WhatsApp).
