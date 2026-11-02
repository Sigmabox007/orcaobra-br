# Relatório — Última rodada antes do piloto

Data: 1º/11/2026 (horário de Brasília). Projeto **não publicado**. Nenhum pedido foi excluído ou alterado.

## 1. O que mudou

**Exclusão segura de pedidos**
- Página do pedido → bloco "Exclusão de dados" → botão **Excluir dados deste pedido**, visível só para administradores.
- A janela de confirmação avisa que a ação é irreversível, lista o que será apagado e alerta para verificar obrigações legais (alerta reforçado em pedido "Convertido em venda").
- O botão final só é liberado com o protocolo digitado exatamente (maiúsculas iguais; espaços nas pontas ignorados).
- No servidor: exige login, confere de novo se a pessoa é administradora, confere o protocolo e só então apaga, com as permissões da própria pessoa (a regra do banco "somente administradores excluem pedidos" continua valendo).
- Itens, complementos sugeridos, histórico de status e acompanhamentos são apagados junto, pelo próprio banco (exclusão em cascata). Os registros de segurança não guardam nome, telefone nem protocolo, então não ficam dados pessoais do pedido sem dono.
- Não há exclusão automática. Nenhuma alteração no banco de dados foi necessária.

**Código de origem protegido com chave**
- O código que identifica a origem nos limites de uso agora é HMAC-SHA256 com chave secreta (`ORIGIN_HASH_SECRET`), gerada e guardada no cofre de segredos do projeto. A chave não aparece no código, no navegador nem nos registros.
- Sem a chave, o sistema recusa a operação (não volta ao método antigo).
- Os limites continuam os mesmos. Efeito único: as contagens da última hora e do dia recomeçam do zero, porque os códigos antigos não batem com os novos.

**Fontes**
- Manrope e Sora agora vêm do próprio site (pacotes `@fontsource`, licença SIL Open Font License 1.1), com os mesmos pesos de antes. Nenhuma chamada ao Google foi feita na verificação. Aparência mantida.

**Página de Privacidade**
- Google Fonts removido da lista de fornecedores.
- Registros de segurança: "até 6 meses, exceto quando obrigações legais exigirem guarda por mais tempo".
- Registros técnicos: agora diz que o código é gerado "com chave secreta".
- Fornecedores de IA: frase sobre retenção baseada só no que foi confirmado (ver item 4).

## 2. Registros de segurança — prazo de 6 meses (procedimento manual)

São os registros de uso da IA e de envios. Eles guardam data, resultado, um código de origem e um identificador aleatório da visita, sem nome, telefone ou texto do pedido. Os limites de uso só consideram as últimas 24 horas, e o painel só mostra os últimos 7 dias. Por isso, apagar registros com mais de 6 meses não afeta nada no funcionamento.

**Como a loja cumpre o prazo:** o painel não tem acesso de exclusão a esses registros, de propósito. Uma vez por mês (junto com a revisão dos 12 meses dos pedidos), a pessoa responsável pede no chat do projeto na Lovable para executar:
```sql
delete from ai_usage   where created_at < now() - interval '6 months';
delete from submit_log where created_at < now() - interval '6 months';
```
Registre a data de cada revisão. O registro mais antigo é de 30/10/2026, então a primeira exclusão só será necessária a partir de 30/04/2027. Fora do alcance da loja: os registros de acesso da hospedagem e o histórico de uso de IA da Lovable seguem os prazos da própria Lovable.

## 3. Testes e validação
- **56 testes aprovados** (eram 50). Testes novos: confirmação exata do protocolo; código com chave (fixo, muda com outra chave, diferente do hash antigo, recusa sem chave); retenção de 6 meses na política.
- Compilação: OK.
- No navegador:
  - Fontes locais carregadas, nenhuma chamada ao Google.
  - Análise de um pedido de exemplo funcionou com o novo código (1 uso de IA registrado com sucesso).
  - Janela de exclusão aberta em um pedido de teste: botão bloqueado com o campo vazio ou com o protocolo em minúsculas, liberado com o protocolo exato. **O botão não foi clicado.**
  - No servidor: sem login, recusada; administrador com protocolo errado, "não confere"; pedido inexistente, "não encontrado".
- Dados preservados, conferidos antes e depois: 8 pedidos (8 de teste), 10 itens, 3 complementos, 6 históricos, 1 acompanhamento, 22 regras e 5 registros de envio. Os registros de uso da IA passaram de 9 para 10 por causa da análise de teste.
- Não testado: envio completo de um pedido com o novo código (para não criar pedido) e o perfil de vendedor.

## 4. Fornecedores de IA — o que diz a documentação oficial
**Confirmado (docs.lovable.dev):**
- *AI app context*: quando ativado, a Lovable guarda a solicitação e a resposta completas de cada chamada de IA por 90 dias, removendo segredos automaticamente. Vem **ativado por padrão nos planos Free e Pro** e desativado em Business e Enterprise. Pode ser desligado em More → AI ou nas configurações do projeto. Com ele desligado, ficam só resumos (status, modelo, custo).
- Os dados enviados pelos usuários finais do app não são usados para treinar os modelos da Lovable.
- Em Enterprise, só são usados modelos "sem retenção de dados" pelo fornecedor, a menos que um administrador permita modelos com retenção (mínimo de 30 dias, sem uso para treino, até 2 anos em caso de alerta de segurança ou ordem judicial).

**Confirmado (developers.openai.com, para clientes diretos da API):** por padrão, a OpenAI guarda registros de monitoramento de abuso, que podem incluir o conteúdo enviado, por até 30 dias. A retenção zero depende de aprovação prévia.

**Não confirmado:**
- Qual regra de retenção a OpenAI aplica às chamadas feitas pela Lovable em nome deste projeto. Isso depende do contrato entre a Lovable e a OpenAI, que não é público. A documentação dá a entender que os modelos GPT são "sem retenção", mas não diz isso de forma explícita.
- Qual é o plano do workspace e se o *AI app context* está ligado neste projeto.

## 5. Pendências realmente bloqueadoras
Nenhuma pendência técnica bloqueia o piloto. Antes de publicar, faltam decisões da loja:
1. Conferir o *AI app context* e, se a loja preferir, desligá-lo. Isso reduz a guarda do texto dos pedidos pela Lovable.
2. Revisão jurídica do texto da Política de Privacidade (já apontada antes).

## 6. Recomendação para o piloto
Pode iniciar o piloto. Depois de publicar, envie um pedido real de teste do começo ao fim, marque como teste e acompanhe pelo painel.

**Melhorias para depois (não implementadas):**
- Filtro "prazo vencido" na lista de pedidos.
- Botão no painel para limpar os registros de segurança com mais de 6 meses.
- Pedir à IA para não guardar as respostas, se o serviço permitir.
- Revalidação no celular e com perfil de vendedor.
- Atualizar o minimatch quando sair uma versão nova da Lovable.
