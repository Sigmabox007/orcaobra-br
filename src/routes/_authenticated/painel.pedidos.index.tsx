import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge, TestBadge } from "@/components/orcaobra/status-badge";
import { CATEGORY_LABEL, STATUSES, STATUS_LABEL, type Status } from "@/lib/orcaobra/rules";

export const Route = createFileRoute("/_authenticated/painel/pedidos/")({
  head: () => ({ meta: [{ title: "Pedidos — OrçaObra" }, { name: "description", content: "Lista de pedidos de orçamento da loja no OrçaObra." }, { property: "og:title", content: "Pedidos — OrçaObra" }, { property: "og:description", content: "Lista de pedidos de orçamento da loja no OrçaObra." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: Pedidos,
});

function Pedidos() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | Status | "retorno">("");
  const [order, setOrder] = useState<"desc" | "asc">("desc");
  const [showTests, setShowTests] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["requests", order],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quote_requests")
        .select("id, protocol, customer_name, original_text, category, status, created_at, needs_followup_at, is_test")
        .order("created_at", { ascending: order === "asc" })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });
  const now = new Date();
  const rows = useMemo(
    () =>
      (data ?? []).filter((r) => {
        if (!showTests && r.is_test) return false;
        if (status === "retorno") {
          if (!r.needs_followup_at || new Date(r.needs_followup_at) > now) return false;
        } else if (status && r.status !== status) return false;
        if (q) {
          const s = q.toLowerCase();
          return [r.protocol, r.customer_name, r.original_text].some((f) => f.toLowerCase().includes(s));
        }
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, q, status, showTests],
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-primary">Pedidos</h1>
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Buscar por nome, protocolo ou texto" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs bg-card" />
        <select aria-label="Filtrar status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="h-9 rounded-md border border-input bg-card px-2 text-sm">
          <option value="">Todos os status</option>
          <option value="retorno">Precisam de retorno</option>
          {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select aria-label="Ordenar" value={order} onChange={(e) => setOrder(e.target.value as "asc" | "desc")} className="h-9 rounded-md border border-input bg-card px-2 text-sm">
          <option value="desc">Mais recentes</option>
          <option value="asc">Mais antigos</option>
        </select>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={showTests} onCheckedChange={(v) => setShowTests(v === true)} /> Mostrar testes</label>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nenhum pedido encontrado.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => {
              const late = r.needs_followup_at && new Date(r.needs_followup_at) <= now && r.status !== "convertido" && r.status !== "perdido";
              return (
                <li key={r.id}>
                  <Link to="/painel/pedidos/$id" params={{ id: r.id }} className={`flex flex-col gap-1 p-4 hover:bg-muted sm:flex-row sm:items-center sm:gap-4 ${late ? "border-l-4 border-highlight" : ""}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{r.customer_name}</span>
                        <span className="font-mono text-xs text-muted-foreground">{r.protocol}</span>
                        {r.is_test && <TestBadge />}
                        {late && <span className="text-xs font-semibold text-accent-foreground">• retornar</span>}
                      </div>
                      <p className="truncate text-sm text-muted-foreground">{r.original_text}</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {r.category && <span>{CATEGORY_LABEL[r.category] ?? r.category}</span>}
                      <span>{new Date(r.created_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</span>
                      <StatusBadge status={r.status} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
