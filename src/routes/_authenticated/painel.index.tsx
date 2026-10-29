import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { computeIndicators, type Status } from "@/lib/orcaobra/rules";

export const Route = createFileRoute("/_authenticated/painel/")({
  head: () => ({ meta: [{ title: "Painel — OrçaObra" }, { name: "robots", content: "noindex" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { isAdmin } = Route.useRouteContext();
  const { data: rows } = useQuery({
    queryKey: ["indicators"],
    queryFn: async () => {
      const { data, error } = await supabase.from("quote_requests").select("status, is_test, needs_followup_at").limit(5000);
      if (error) throw error;
      return data as { status: Status; is_test: boolean; needs_followup_at: string | null }[];
    },
  });
  const { data: ai } = useQuery({
    queryKey: ["ai-usage-today"],
    queryFn: async () => {
      const d = new Date();
      d.setUTCHours(0, 0, 0, 0);
      const week = new Date(Date.now() - 7 * 86400_000).toISOString();
      const [today, fails, wk] = await Promise.all([
        supabase.from("ai_usage").select("id", { count: "exact", head: true }).gte("created_at", d.toISOString()),
        supabase.from("ai_usage").select("id", { count: "exact", head: true }).gte("created_at", d.toISOString()).eq("success", false),
        supabase.from("ai_usage").select("id", { count: "exact", head: true }).gte("created_at", week),
      ]);
      return { today: today.count ?? 0, fails: fails.count ?? 0, week: wk.count ?? 0 };
    },
  });
  const ind = computeIndicators(rows ?? []);
  const cards = [
    { label: "Total recebido", v: ind.total },
    { label: "Novos", v: ind.novos, hi: true },
    { label: "Aguardando orçamento", v: ind.aguardandoOrcamento },
    { label: "Orçamentos enviados", v: ind.orcamentosEnviados },
    { label: "Aguardando retorno", v: ind.aguardandoRetorno },
    { label: "Convertidos", v: ind.convertidos },
    { label: "Encerrados", v: ind.encerrados },
    { label: "Precisam de retorno hoje", v: ind.precisamRetorno, hi: true },
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-bold text-primary">Visão geral</h1>
        <Link to="/painel/pedidos" className="text-sm font-semibold text-highlight underline">Ver pedidos →</Link>
      </div>
      <p className="text-xs text-muted-foreground">Pedidos de teste não entram nestes números.</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-xl border p-4 ${c.hi && c.v > 0 ? "border-highlight bg-accent" : "border-border bg-card"}`}>
            <div className="font-display text-3xl font-bold">{rows ? c.v : "–"}</div>
            <div className="text-xs text-muted-foreground">{c.label}</div>
          </div>
        ))}
      </div>
      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold">Uso da inteligência artificial</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Hoje: <strong className="text-foreground">{ai?.today ?? "–"}</strong> análises ({ai?.fails ?? 0} com falha) · Últimos 7 dias: <strong className="text-foreground">{ai?.week ?? "–"}</strong>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Estimativa do piloto: cerca de 50 análises por dia (25 pedidos × 2). O consumo em créditos aparece no uso do workspace.
          {isAdmin && <> Ajuste os limites em <Link to="/painel/configuracoes" className="underline">Configurações</Link>.</>}
        </p>
      </section>
    </div>
  );
}
