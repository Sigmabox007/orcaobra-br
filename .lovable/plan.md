# OrçaObra — Auditoria e plano de evolução comercial

Etapa somente de auditoria. Nada foi alterado. Ao aprovar, eu apenas salvo este relatório como `docs/auditoria-comercial.md`; nenhuma fase de desenvolvimento começa sem nova aprovação sua.

## 1. Funcionalidades atuais (verificadas no código e no banco)

Implementado:
- Pedido público em etapas: texto livre, interpretação pela IA, até 3 perguntas, até 5 complementos opcionais, contato com consentimento, protocolo aleatório, página de confirmação.
- Painel: início com indicadores (exclui testes), lista e detalhe de pedidos, mudança de status com histórico, registro de retornos, anotações internas, link de WhatsApp manual.
- Complementos: criar, editar, revisar, ativar; editar o conteúdo volta a regra para rascunho (proteção no banco).
- Configurações de limites de IA e de envios (somente administrador).
- Marcação de teste (somente administrador, protegida no banco) e exclusão de pedido com protocolo digitado.
- Política de privacidade, fontes locais, favicon próprio, 56 testes automáticos.

Parcial:
- Papel "vendedor": existe no banco e no menu, mas não há conta de vendedor nem teste com esse perfil.
- Loja: tabela `stores` existe com 1 loja; o pedido grava a "primeira loja" encontrada, não uma loja escolhida.
- Retenção (12 meses pedidos / 6 meses registros): só procedimento manual documentado.

Não existe:
- Várias lojas, cadastro de loja, convite de usuários, gestão de equipe pela tela.
- Planos, assinatura, cobrança, limites por loja, painel geral da plataforma.
- Notificação de novo pedido, busca/filtros avançados, exportação, catálogo de produtos.

## 2. Banco de dados

Estado real: 1 loja, 10 pedidos (todos marcados como teste), 22 regras (3 revisadas e ativas), 2 administradores, 0 vendedores, 14 registros de uso de IA.

```text
stores 1──n quote_requests ──┬─ request_items        (apaga junto)
                             ├─ suggested_complements (apaga junto) ── association_rules (fica nulo)
                             ├─ status_history       (apaga junto)
                             └─ followups            (apaga junto)
user_roles ── usuários de login   (sem loja)
association_rules, app_settings, ai_usage, submit_log   (sem loja — globais)
```

Uso de `store_id`: existe só em `quote_requests`. Nenhuma política de segurança usa a loja; qualquer membro da equipe vê todos os pedidos. Regras, configurações, limites e papéis são únicos para todo o sistema.

Políticas: visitantes anônimos não acessam nenhuma tabela; equipe lê; só administrador apaga pedidos, altera regras e configurações; `submit_log` totalmente fechado; papéis só leitura.

## 3. Autenticação e permissões

- Login por e-mail/senha, cadastro público desligado, recuperação de senha.
- Papéis em tabela separada, nunca gravados pelo app (bom: sem autopromoção).
- Riscos: papéis não ligados a loja; criar vendedor exige intervenção manual no banco; vendedor pode alterar qualquer campo de qualquer pedido (a política de edição não limita colunas); sem registro de quem acessou o quê; sem segundo fator.

## 4. Inteligência artificial

- Interpretação e sugestão com saída em formato fixo, texto do cliente tratado como não confiável, contatos mascarados antes do envio.
- Sugestões só podem apontar para regras revisadas e ativas; conferido de novo no envio.
- Limites: global diário, por origem (hora/dia), por sessão, liga/desliga. Falha ou limite: o pedido segue sem IA (`ai_failed`).
- Lacunas: categorias fixas no código (pisos, sanitários, pintura); limites globais, não por loja; custo não medido em dinheiro nem por loja; sem alerta quando o limite é atingido.

## 5. Segurança e privacidade

Pontos fortes: escrita pública só por funções do servidor com validação; identificador de origem com chave secreta (falha fechada); limite de envios; campo-isca contra robôs; registros de erro só com códigos.

Riscos: retenção manual; sem cópia de segurança/restauração testada por nós; sem monitoramento ou alerta de erros; inserções secundárias do envio (itens, sugestões, histórico) não verificam erro — pedido pode ficar incompleto sem aviso.

## 6. Operação diária da loja — o que falta

Aviso de novo pedido (e-mail), filtros e busca por status/data/protocolo, paginação, atribuição de pedido a vendedor, gestão de equipe pela tela, exportação simples, lembretes de retorno.

## 7. Expansão para várias lojas — o que falta

`store_id` em todas as tabelas de loja; vínculo usuário-loja com papel; políticas de segurança por loja; endereço público por loja (ex.: `/l/af-figueiredo`); regras, configurações, limites e identidade (nome, WhatsApp, CNPJ, privacidade) por loja.

## 8. Monetização — o que falta

Planos e assinatura, cobrança, limites por plano (pedidos/mês, chamadas de IA, usuários), bloqueio suave ao exceder, papel de administrador da plataforma (separado do admin da loja), painel geral. Fora do escopo atual definido por vocês ("pagamentos"); precisa de decisão explícita.

## Resumo da arquitetura

Site público + painel na mesma aplicação; ações públicas só por funções do servidor; painel lê e grava diretamente sob políticas de segurança; regras de negócio puras centralizadas e testadas; IA pelo gateway da Lovable.

## Riscos críticos

| Prioridade | Risco |
|---|---|
| P0 | Sem isolamento por loja: segunda loja veria pedidos da primeira |
| P0 | Configurações e regras globais: uma loja alteraria as de outra |
| P1 | Envio pode gravar pedido incompleto sem aviso |
| P1 | Vendedor pode editar qualquer campo; equipe gerida manualmente |
| P1 | Retenção e cópia de segurança manuais/não testadas |
| P2 | Custo de IA sem medição por loja; categorias fixas |
| P2 | Sem aviso de novo pedido nem monitoramento de erros |

## O que pode ser aproveitado sem reconstrução

Fluxo do cliente, interpretação e sugestões, regras puras e testes, mascaramento, limites, protocolo, painel, histórico, exclusão segura, privacidade, identidade visual.

## Plano em fases pequenas

Cada fase é aprovada separadamente, preserva a loja piloto e termina com build e testes.

**Fase 0 — Segurança da base (sem mudar comportamento)**
Verificar erros nas gravações do envio; teste com perfil vendedor; documentar cópia de segurança.
Aceite: falha simulada em item retorna erro; vendedor não acessa Complementos/Configurações; 56+ testes passam.

**Fase 1 — Loja em todas as tabelas**
Adicionar loja a regras, configurações, uso de IA, envios, histórico, retornos; preencher tudo com a loja piloto.
Aceite: contagens antes/depois idênticas; nenhum registro sem loja; site público igual.

**Fase 2 — Equipe por loja**
Vínculo usuário-loja com papel; migrar os 2 administradores para a loja piloto.
Aceite: os dois admins continuam entrando e vendo tudo como hoje.

**Fase 3 — Isolamento por loja**
Políticas de segurança filtram pela loja do usuário.
Aceite: usuário de uma loja de teste B não vê nem altera nada da loja piloto, e vice-versa.

**Fase 4 — Endereço e identidade por loja**
Página pública por loja; endereço atual continua levando à loja piloto; dados e privacidade por loja.
Aceite: pedido em `/` e em `/l/<loja>` cai na loja certa.

**Fase 5 — Limites e IA por loja**
Limites e medição de uso por loja; categorias por loja.
Aceite: esgotar limite da loja B não afeta a piloto.

**Fase 6 — Operação**
Gestão de equipe pela tela, filtros, busca, paginação, aviso por e-mail de novo pedido.
Aceite: admin convida vendedor sem mexer no banco; novo pedido gera e-mail.

**Fase 7 — Administração da plataforma**
Papel de dono da plataforma, cadastro de lojas, painel geral.
Aceite: só esse papel cria lojas; admin de loja não vê outras lojas.

**Fase 8 — Planos e cobrança** (requer decisão sobre provedor e preços)
Planos, assinatura, limites por plano, bloqueio suave.
Aceite: loja sem plano ativo não recebe novos pedidos com IA, mas dados ficam acessíveis.

## Preservação da loja piloto

- Mudanças de banco só aditivas; colunas novas preenchidas com a loja piloto antes de qualquer regra nova.
- Contagem de registros antes/depois de cada fase; nenhuma exclusão.
- Testar cada fase primeiro com uma loja de teste fictícia.
- Endereço publicado continua funcionando igual; não publicar sem sua autorização.

## Detalhes técnicos

- Isolamento via função `is_store_member(uid, store_id)` com SECURITY DEFINER, usada em todas as políticas; papéis em `store_members(user_id, store_id, role)`; papel de plataforma em `user_roles`.
- Funções públicas passam a resolver a loja pelo endereço (slug) no servidor, nunca pelo navegador.
- Gravações do envio passarão a uma função de banco transacional para evitar pedido incompleto.
