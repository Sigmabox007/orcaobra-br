import { createFileRoute } from "@tanstack/react-router";
import { PublicShell } from "@/components/orcaobra/brand";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Privacidade — OrçaObra" },
      { name: "description", content: "Como o OrçaObra e a A.S. Figueiredo usam seus dados de contato." },
      { property: "og:title", content: "Privacidade — OrçaObra" },
      { property: "og:description", content: "Como seus dados de contato são usados nos pedidos de orçamento." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Privacidade,
});

function Privacidade() {
  return (
    <PublicShell>
      <article className="space-y-4 text-sm leading-relaxed">
        <h1 className="text-2xl font-bold text-primary">Privacidade</h1>
        <p>O OrçaObra ajuda você a montar um pedido de orçamento para a A.S. Figueiredo Materiais de Construção.</p>
        <h2 className="text-lg font-semibold">Quais dados coletamos</h2>
        <p>Nome, número de WhatsApp, observações e a descrição dos materiais que você informar.</p>
        <h2 className="text-lg font-semibold">Para que usamos</h2>
        <p>Somente para preparar e enviar o orçamento solicitado e acompanhar esse pedido. Não enviamos propaganda.</p>
        <h2 className="text-lg font-semibold">Inteligência artificial</h2>
        <p>
          A descrição do pedido e as respostas aos detalhes são analisadas por inteligência artificial para organizar o pedido e sugerir itens complementares. Seu nome e telefone não são enviados à IA, e números de telefone ou e-mails escritos no pedido são removidos antes da análise.
        </p>
        <h2 className="text-lg font-semibold">Quem tem acesso</h2>
        <p>Apenas funcionários autorizados da loja, com login.</p>
        <h2 className="text-lg font-semibold">Seus direitos</h2>
        <p>Você pode pedir para consultar, corrigir ou excluir seus dados falando com a loja pelo WhatsApp.</p>
        <p className="text-xs text-muted-foreground">Texto provisório do piloto; deve ser revisado pela loja.</p>
      </article>
    </PublicShell>
  );
}
