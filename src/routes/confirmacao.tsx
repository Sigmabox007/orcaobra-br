import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PublicShell } from "@/components/orcaobra/brand";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/confirmacao")({
  head: () => ({
    meta: [
      { title: "Pedido enviado — OrçaObra" },
      { name: "description", content: "Seu pedido de orçamento foi registrado." },
      { property: "og:title", content: "Pedido enviado — OrçaObra" },
      { property: "og:description", content: "Seu pedido de orçamento foi registrado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Confirmacao,
});

// Shows only what this browser session just sent. Never reads the database.
function Confirmacao() {
  const [last, setLast] = useState<{ protocol: string; items: number } | null | undefined>(undefined);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("oo_last");
      setLast(raw ? JSON.parse(raw) : null);
    } catch {
      setLast(null);
    }
  }, []);

  return (
    <PublicShell>
      {last === undefined ? null : last ? (
        <section className="space-y-5 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success text-success-foreground text-3xl" aria-hidden>✓</div>
          <h1 className="text-3xl font-bold text-primary">Pedido registrado!</h1>
          <p className="text-muted-foreground">Guarde o número do seu protocolo:</p>
          <p className="font-display text-3xl font-bold tracking-widest text-highlight">{last.protocol}</p>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            A equipe da loja vai conferir os {last.items} item(ns) e entrar em contato pelo WhatsApp informado assim que o orçamento estiver pronto, dentro do horário de atendimento.
          </p>
          <Button asChild variant="outline"><Link to="/">Fazer outro pedido</Link></Button>
        </section>
      ) : (
        <section className="space-y-4 text-center">
          <h1 className="text-2xl font-bold text-primary">Nenhum pedido recente nesta sessão</h1>
          <Button asChild><Link to="/">Fazer um pedido</Link></Button>
        </section>
      )}
    </PublicShell>
  );
}
