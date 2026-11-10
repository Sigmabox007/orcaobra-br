# Correções finais do MVP
- [x] Controle administrativo de classificação de teste com proteção no banco.
- [x] Separar necessidade de produtos no resumo e no pedido salvo.
- [x] Mostrar esclarecimentos respondidos sem rotulá-los como pendentes.
- [x] Editar regras existentes e exigir nova revisão após alteração.
- [x] Executar testes e validações com relatório objetivo.
# Revisão final de privacidade
- [x] Auditar dados, IA, logs, acessos e terceiros.
- [x] Corrigir filtro de contatos enviado à IA, com testes.
- [x] Remover dados pessoais de log de erro do envio.
- [x] Reescrever página de Privacidade com dados oficiais da loja.
- [x] Documentar procedimento manual de retenção e pendências.
- [x] Botão de exclusão de pedido real no painel (feito na última rodada).
# Última rodada antes do piloto
- [x] Exclusão segura de pedido pelo administrador (protocolo digitado, aviso, sem executar).
- [x] Identificador de origem com HMAC-SHA256 e chave secreta.
- [x] Fontes hospedadas localmente.
- [x] Retenção de 6 meses dos registros de segurança — procedimento manual.
- [x] Verificar retenção dos fornecedores de IA nas documentações oficiais.
- [x] Build, testes, preservação dos dados e relatório curto.
# Auditoria comercial
- [x] Relatório e plano revisado salvos em docs/auditoria-comercial.md.
- [ ] Fase 0 — aguardando aprovação.
## Fase 1 — preparação do banco
- [x] Registrar confirmação do proprietário da exportação atualizada, baixada e guardada; restauração não testada.
- [x] Apresentar o SQL da Fase 1 para autorização antes de aplicar.
- [x] Aplicar exclusivamente a migração da Fase 1 após autorização do SQL.
- [x] Conferir contagens, integridade, administradores, gravações e regressão; emitir relatório sem publicação.
- [ ] Testes reais de vendedor da Fase 0B — dependem de conta de vendedor e autorização do procedimento; não executados nesta fase.
## Fase 2 — vínculo de usuários à loja
- [x] Exportação pós-Fase 1 confirmada (orcaobra-br_261108.backup, 443 KB; restauração não testada).
- [x] Pré-requisitos conferidos e SQL apresentado (docs/fase-2-sql-proposto.md).
- [x] Autorização do SQL corrigido recebida em 08/11/2026.
- [x] Migração store_members (SQL revisado, sem FK a auth.users) aplicada após autorização; verificações em relatorio-fase-2.md.
- [ ] Painel aberto como André/Ariane após a Fase 2 — não verificado.
## Pré-Fase 3
- [x] Plano revisão 1 (R1–R7) apresentado.
- [x] Etapa 2 aplicada após autorização restrita (relatorio-pre-fase-3-etapa-2.md).
- [x] Etapa 3 aplicada após autorização restrita (relatorio-pre-fase-3-etapa-3.md); teste funcional com sessões reais pendente.
- [ ] Etapa 4 — interrompida antes da aplicação: comparação literal de search_path incompatível e contagem global de FKs a auth.users divergente no SQL anexado; aguarda SQL revisado e aprovação explícita (relatorio-pre-fase-3-etapa-4.md).
- [ ] Etapas 5–7 — não autorizadas.
## Fase 3 — bloqueante
- [ ] Mecanismo seguro de revogação/limpeza de vínculos de contas excluídas, definido e testado antes de qualquer política usar store_members.
