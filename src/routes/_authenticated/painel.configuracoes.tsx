import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PILOT_STORE_ID } from "./route";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/painel/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — OrçaObra" }, { name: "description", content: "Configurações de limites e dados de teste do OrçaObra." }, { property: "og:title", content: "Configurações — OrçaObra" }, { property: "og:description", content: "Configurações de limites e dados de teste do OrçaObra." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: Config,
});

const FIELDS = [
  ["ai_daily_global_limit", "Teto diário de análises (toda a loja)"],
  ["ai_per_origin_hour", "Análises por aparelho, por hora"],
  ["ai_per_origin_day", "Análises por aparelho, por dia"],
  ["ai_per_session", "Análises por visita"],
  ["submits_per_origin_hour", "Envios de pedido por aparelho, por hora"],
] as const;

function Config() {
  const { isAdmin, isStaff, storeId } = Route.useRouteContext();
  const validStore = isStaff && isAdmin && storeId === PILOT_STORE_ID;
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings"],
    enabled: validStore,
    queryFn: async () => {
      if (!validStore) throw new Error("Invalid store context");
      const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).single();
      if (error) throw error;
      return data;
    },
  });
  const { data: testCount } = useQuery({
    queryKey: ["test-count", storeId],
    enabled: validStore,
    queryFn: async () => {
      if (!validStore) throw new Error("Invalid store context");
      const { count, error } = await supabase.from("quote_requests").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("is_test", true);
      if (error) throw error;
      return count ?? 0;
    },
  });
  const [form, setForm] = useState<Record<string, number | boolean>>({});
  useEffect(() => { if (data) { const { updated_at: _u, ...rest } = data; setForm(rest); } }, [data]);
  if (!validStore) return <p>Apenas administradores.</p>;

  async function save() {
    if (!validStore) return;
    const patch: Record<string, number | boolean> = { ai_enabled: !!form["ai_enabled"] };
    for (const [k] of FIELDS) {
      const v = Number(form[k]);
      if (!Number.isInteger(v) || v < 0 || v > 100000) return void toast.error("Use números inteiros válidos.");
      patch[k] = v;
    }
    const { error } = await supabase.from("app_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) return void toast.error("Não foi possível salvar.");
    toast.success("Limites salvos.");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }
  async function deleteTests() {
    if (!validStore) return;
    if (!confirm("Excluir todos os pedidos de teste? Essa ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("quote_requests").delete().eq("store_id", storeId).eq("is_test", true);
    if (error) return void toast.error("Não foi possível excluir.");
    toast.success("Pedidos de teste excluídos.");
    for (const key of ["test-count", "requests", "request", "indicators"]) {
      qc.invalidateQueries({ queryKey: [key, storeId] });
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold text-primary">Configurações</h1>
      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold">Limites da inteligência artificial</h2>
        <p className="text-xs text-muted-foreground">Quando um limite é atingido, o cliente continua e envia o pedido normalmente, só que sem a ajuda da IA.</p>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={!!form["ai_enabled"]} onCheckedChange={(v) => setForm({ ...form, ai_enabled: v })} /> Assistente de IA ligado
        </label>
        {FIELDS.map(([k, label]) => (
          <div key={k} className="space-y-1">
            <Label htmlFor={k}>{label}</Label>
            <Input id={k} type="number" min={0} value={String(form[k] ?? "")} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} />
          </div>
        ))}
        <Button onClick={save}>Salvar limites</Button>
      </section>
      <section className="space-y-2 rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold">Dados de teste</h2>
        <p className="text-sm text-muted-foreground">Existem {testCount ?? "–"} pedidos de teste. Exclua-os antes de divulgar o link aos clientes.</p>
        <Button variant="destructive" onClick={deleteTests} disabled={!testCount}>Excluir pedidos de teste</Button>
      </section>
    </div>
  );
}
