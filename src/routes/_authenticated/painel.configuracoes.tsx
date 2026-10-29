import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_authenticated/painel/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — OrçaObra" }, { name: "robots", content: "noindex" }] }),
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
  const { isAdmin } = Route.useRouteContext();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await supabase.from("app_settings").select("*").eq("id", 1).single()).data,
  });
  const { data: testCount } = useQuery({
    queryKey: ["test-count"],
    queryFn: async () => (await supabase.from("quote_requests").select("id", { count: "exact", head: true }).eq("is_test", true)).count ?? 0,
  });
  const [form, setForm] = useState<Record<string, number | boolean>>({});
  useEffect(() => { if (data) setForm(data); }, [data]);
  if (!isAdmin) return <p>Apenas administradores.</p>;

  async function save() {
    const patch: Record<string, number | boolean> = { ai_enabled: !!form.ai_enabled };
    for (const [k] of FIELDS) {
      const v = Number(form[k]);
      if (!Number.isInteger(v) || v < 0 || v > 100000) return toast.error("Use números inteiros válidos.");
      patch[k] = v;
    }
    const { error } = await supabase.from("app_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", 1);
    if (error) return toast.error("Não foi possível salvar.");
    toast.success("Limites salvos.");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }
  async function deleteTests() {
    if (!confirm("Excluir todos os pedidos de teste? Essa ação não pode ser desfeita.")) return;
    const { error } = await supabase.from("quote_requests").delete().eq("is_test", true);
    if (error) return toast.error("Não foi possível excluir.");
    toast.success("Pedidos de teste excluídos.");
    qc.invalidateQueries();
  }

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold text-primary">Configurações</h1>
      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <h2 className="font-semibold">Limites da inteligência artificial</h2>
        <p className="text-xs text-muted-foreground">Quando um limite é atingido, o cliente continua e envia o pedido normalmente, só que sem a ajuda da IA.</p>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={!!form.ai_enabled} onCheckedChange={(v) => setForm({ ...form, ai_enabled: v })} /> Assistente de IA ligado
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
