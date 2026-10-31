import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { CATEGORY_LABEL } from "@/lib/orcaobra/rules";

export const Route = createFileRoute("/_authenticated/painel/regras")({
  head: () => ({ meta: [{ title: "Complementos — OrçaObra" }, { name: "robots", content: "noindex" }] }),
  component: Regras,
});

type Cat = "pisos" | "sanitarios" | "pintura";
const empty = { category: "pisos" as Cat, trigger: "", complement: "", condition: "", clarifying_question: "", explanation: "" };

function Regras() {
  const { user, isAdmin } = Route.useRouteContext();
  const qc = useQueryClient();
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { data } = useQuery({
    queryKey: ["rules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("association_rules").select("*").order("category").order("created_at");
      if (error) throw error;
      return data;
    },
  });
  if (!isAdmin) return <p>Apenas administradores.</p>;
  const refresh = () => qc.invalidateQueries({ queryKey: ["rules"] });

  async function update(id: string, patch: { active?: boolean; reviewed?: boolean; reviewed_by?: string | null; reviewed_at?: string | null }) {
    const { error } = await supabase.from("association_rules").update(patch).eq("id", id);
    if (error) toast.error(error.message.includes("revisada") ? "Revise a regra antes de ativar." : "Não foi possível salvar.");
    refresh();
  }
  async function create() {
    if (!form.trigger || !form.complement || !form.explanation) return void toast.error("Preencha gatilho, complemento e explicação.");
    if (saving) return;
    setSaving(true);
    const values = { ...form, condition: form.condition || null, clarifying_question: form.clarifying_question || null };
    const { error } = editingId
      ? await supabase.from("association_rules").update(values).eq("id", editingId)
      : await supabase.from("association_rules").insert(values);
    setSaving(false);
    if (error) return void toast.error("Não foi possível salvar.");
    toast.success(editingId ? "Alterações salvas. Conteúdo alterado exige nova revisão." : "Regra criada como rascunho.");
    setForm(empty);
    setEditingId(null);
    refresh();
  }

  const pending = (data ?? []).filter((r) => !r.reviewed).length;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-primary">Regras de complementos</h1>
      <p className="text-sm text-muted-foreground">
        Somente regras <strong>revisadas e ativas</strong> são usadas nas sugestões aos clientes. {pending > 0 && <span className="font-semibold text-accent-foreground">{pending} aguardando revisão.</span>}
      </p>
      {(["pisos", "sanitarios", "pintura"] as Cat[]).map((cat) => (
        <section key={cat} className="rounded-xl border border-border bg-card">
          <h2 className="border-b border-border px-4 py-3 font-semibold">{CATEGORY_LABEL[cat]}</h2>
          <ul className="divide-y divide-border">
            {(data ?? []).filter((r) => r.category === cat).map((r) => (
              <li key={r.id} className="grid gap-2 p-4 md:grid-cols-[1fr_auto] md:items-center">
                <div className="text-sm">
                  <div><span className="text-muted-foreground">{r.trigger} →</span> <strong>{r.complement}</strong></div>
                  <div className="text-xs text-muted-foreground">{r.explanation}{r.condition ? ` · Condição: ${r.condition}` : ""}</div>
                  {r.reviewed_at && <div className="text-[11px] text-muted-foreground">Revisada em {new Date(r.reviewed_at).toLocaleDateString("pt-BR")}</div>}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <Button size="sm" variant="outline" onClick={() => {
                    setEditingId(r.id);
                    setForm({ category: r.category as Cat, trigger: r.trigger, complement: r.complement, condition: r.condition ?? "", clarifying_question: r.clarifying_question ?? "", explanation: r.explanation });
                    document.getElementById("rule-form")?.scrollIntoView({ block: "center" });
                  }}>Editar</Button>
                  {r.reviewed ? (
                    <Button size="sm" variant="ghost" onClick={() => update(r.id, { reviewed: false, active: false, reviewed_by: null, reviewed_at: null })}>Desfazer revisão</Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => update(r.id, { reviewed: true, reviewed_by: user.id, reviewed_at: new Date().toISOString() })}>Marcar como revisada</Button>
                  )}
                  <label className="flex items-center gap-1.5">
                    <Switch checked={r.active} disabled={!r.reviewed} onCheckedChange={(v) => update(r.id, { active: v })} aria-label="Ativa" /> Ativa
                  </label>
                  <Button size="sm" variant="ghost" onClick={() => confirm("Excluir esta regra?") && supabase.from("association_rules").delete().eq("id", r.id).then(refresh)}>Excluir</Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section id="rule-form" className="space-y-2 rounded-xl border border-dashed border-border bg-card p-4">
        <h2 className="font-semibold">{editingId ? "Editar regra" : "Nova regra"}</h2>
        <div className="grid gap-2 md:grid-cols-2">
          <select aria-label="Categoria" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as Cat })} className="h-9 rounded-md border border-input bg-card px-2 text-sm">
            {(["pisos", "sanitarios", "pintura"] as Cat[]).map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
          <Input placeholder="Produto ou atividade (gatilho)" value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })} />
          <Input placeholder="Complemento sugerido" value={form.complement} onChange={(e) => setForm({ ...form, complement: e.target.value })} />
          <Input placeholder="Condição (opcional)" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} />
          <Input placeholder="Pergunta de esclarecimento (opcional)" value={form.clarifying_question} onChange={(e) => setForm({ ...form, clarifying_question: e.target.value })} />
          <Input placeholder="Explicação ao cliente" value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} />
        </div>
        <div className="flex gap-2"><Button onClick={create} disabled={saving}>{editingId ? "Salvar alterações" : "Adicionar (como rascunho)"}</Button>
        {editingId && <Button variant="outline" onClick={() => { setEditingId(null); setForm(empty); }}>Cancelar</Button>}</div>
      </section>
    </div>
  );
}
