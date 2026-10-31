import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { StatusBadge, TestBadge } from "@/components/orcaobra/status-badge";
import { CATEGORY_LABEL, STATUSES, STATUS_LABEL, whatsappLink, requestedProducts, pendingClarifications, type Status } from "@/lib/orcaobra/rules";

export const Route = createFileRoute("/_authenticated/painel/pedidos/$id")({
  head: () => ({ meta: [{ title: "Pedido — OrçaObra" }, { name: "description", content: "Detalhes e acompanhamento de um pedido de orçamento OrçaObra." }, { property: "og:title", content: "Pedido — OrçaObra" }, { property: "og:description", content: "Detalhes e acompanhamento de um pedido de orçamento OrçaObra." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { name: "robots", content: "noindex" }] }),
  component: Detalhe,
});

const fmt = (d: string) => new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

function Detalhe() {
  const { id } = Route.useParams();
  const { user, isAdmin } = Route.useRouteContext();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["request", id],
    queryFn: async () => {
      const [r, items, sugg, hist, fu] = await Promise.all([
        supabase.from("quote_requests").select("*").eq("id", id).single(),
        supabase.from("request_items").select("*").eq("request_id", id).order("created_at"),
        supabase.from("suggested_complements").select("*").eq("request_id", id),
        supabase.from("status_history").select("*").eq("request_id", id).order("created_at", { ascending: false }),
        supabase.from("followups").select("*").eq("request_id", id).order("created_at", { ascending: false }),
      ]);
      if (r.error) throw r.error;
      return { r: r.data, items: items.data ?? [], sugg: sugg.data ?? [], hist: hist.data ?? [], fu: fu.data ?? [] };
    },
  });

  const [newStatus, setNewStatus] = useState<Status>("recebido");
  const [statusNote, setStatusNote] = useState("");
  const [notes, setNotes] = useState("");
  const [followNote, setFollowNote] = useState("");
  const [followDate, setFollowDate] = useState("");
  const [msg, setMsg] = useState("");
  const [savingTest, setSavingTest] = useState(false);

  useEffect(() => {
    if (!data) return;
    setNewStatus(data.r.status);
    setNotes(data.r.internal_notes ?? "");
    setFollowDate(data.r.needs_followup_at ? data.r.needs_followup_at.slice(0, 10) : "");
    const first = data.r.customer_name.split(" ")[0];
    setMsg(`Olá, ${first}! Aqui é da A.S. Figueiredo Materiais de Construção, sobre o seu pedido de orçamento ${data.r.protocol}.`);
  }, [data]);

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const { r, items, sugg, hist, fu } = data;
  const interp = r.ai_interpretation as { activity?: string; missing_info?: string[] } | null;
  const clar = (r.clarifications as { question: string; answer: string }[]) ?? [];
  const products = [...requestedProducts(items.filter((i) => i.origin !== "complement"), r.original_text, interp?.activity), ...items.filter((i) => i.origin === "complement")];
  const pending = pendingClarifications(clar);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["request", id] });
    qc.invalidateQueries({ queryKey: ["requests"] });
    qc.invalidateQueries({ queryKey: ["indicators"] });
    qc.invalidateQueries({ queryKey: ["test-count"] });
  };

  async function saveStatus() {
    if (newStatus === r.status) return void toast.info("Status não mudou.");
    const { error } = await supabase.from("quote_requests").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return void toast.error("Não foi possível salvar.");
    await supabase.from("status_history").insert({ request_id: id, from_status: r.status, to_status: newStatus, changed_by: user.id, note: statusNote || null });
    setStatusNote("");
    toast.success("Status atualizado.");
    refresh();
  }
  async function setTest(value: boolean) {
    if (!isAdmin || savingTest) return;
    setSavingTest(true);
    const { error } = await supabase.from("quote_requests").update({ is_test: value, updated_at: new Date().toISOString() }).eq("id", id);
    setSavingTest(false);
    if (error) return void toast.error("Não foi possível alterar a classificação.");
    toast.success(value ? "Pedido marcado como teste." : "Classificação de teste removida.");
    refresh();
  }
  async function saveNotes() {
    const { error } = await supabase
      .from("quote_requests")
      .update({ internal_notes: notes || null, needs_followup_at: followDate ? new Date(`${followDate}T09:00:00`).toISOString() : null })
      .eq("id", id);
    if (error) return void toast.error("Não foi possível salvar.");
    toast.success("Informações salvas.");
    refresh();
  }
  async function addFollowup() {
    const { error } = await supabase.from("followups").insert({ request_id: id, user_id: user.id, note: followNote || null });
    if (error) return void toast.error("Não foi possível registrar.");
    await supabase.from("quote_requests").update({ last_followup_at: new Date().toISOString() }).eq("id", id);
    setFollowNote("");
    toast.success("Acompanhamento registrado.");
    refresh();
  }

  return (
    <div className="space-y-5">
      <Link to="/painel/pedidos" className="text-sm text-muted-foreground underline">← Pedidos</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-primary">{r.customer_name}</h1>
        <span className="font-mono text-sm text-muted-foreground">{r.protocol}</span>
        <StatusBadge status={r.status} />
        {r.is_test && <TestBadge />}
        {r.ai_failed && <span className="text-xs text-muted-foreground">(enviado sem IA)</span>}
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title="Pedido original">
            <p className="whitespace-pre-wrap">{r.original_text}</p>
            <p className="mt-2 text-xs text-muted-foreground">Recebido em {fmt(r.created_at)}{r.category ? ` · ${CATEGORY_LABEL[r.category] ?? r.category}` : ""}</p>
          </Card>
          <Card title="Itens do pedido">
            {products.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto específico informado.</p>}
            <ul className="divide-y divide-border text-sm">
              {products.map((i) => (
                <li key={i.id} className="flex justify-between gap-2 py-2">
                  <span>{i.name}{i.origin === "complement" && <span className="ml-2 rounded bg-accent px-1.5 text-[10px] font-semibold uppercase text-accent-foreground">complemento aceito</span>}</span>
                  <span className="text-muted-foreground">{i.quantity ?? ""}</span>
                </li>
              ))}
            </ul>
          </Card>
          {(interp || clar.length > 0) && (
            <Card title="Interpretação da IA">
              {interp?.activity && <p className="text-sm"><strong>Serviço ou necessidade:</strong> {interp.activity}</p>}
              {interp?.missing_info && interp.missing_info.length > 0 && (
                <p className="mt-1 text-sm"><strong>Informações inicialmente identificadas pela IA:</strong> {interp.missing_info.join("; ")}</p>
              )}
              {clar.length > 0 && (
                <><h3 className="mt-3 text-sm font-semibold">Perguntas e respostas</h3><dl className="mt-2 space-y-1 text-sm">{clar.map((c, i) => <div key={i}><dt className="text-muted-foreground">{c.question}</dt><dd>{c.answer.trim() || "Sem resposta"}</dd></div>)}</dl></>
              )}
              {pending.length > 0 && <p className="mt-2 text-sm"><strong>Perguntas sem resposta:</strong> {pending.map((c) => c.question).join("; ")}</p>}
            </Card>
          )}
          {sugg.length > 0 && (
            <Card title="Complementos sugeridos">
              <ul className="space-y-1 text-sm">
                {sugg.map((s) => <li key={s.id}>{s.accepted ? "✅" : "—"} {s.name} <span className="text-muted-foreground">· {s.reason}</span></li>)}
              </ul>
            </Card>
          )}
          {r.customer_notes && <Card title="Observações do cliente"><p className="text-sm">{r.customer_notes}</p></Card>}
        </div>

        <div className="space-y-5">
          {isAdmin && <Card title="Classificação do pedido"><label className="flex items-center gap-3 text-sm"><Switch aria-label="Marcar como teste" checked={r.is_test} disabled={savingTest} onCheckedChange={setTest} />Marcar como teste</label></Card>}
          <Card title="Contato">
            <p className="text-sm">WhatsApp: <span className="font-mono">{r.customer_whatsapp}</span></p>
            <Label htmlFor="wmsg" className="mt-3 block text-xs">Mensagem (você confirma antes de enviar)</Label>
            <Textarea id="wmsg" rows={4} value={msg} onChange={(e) => setMsg(e.target.value)} className="mt-1 text-sm" />
            <Button asChild className="mt-2 w-full bg-success text-success-foreground hover:bg-success/90">
              <a href={whatsappLink(r.customer_whatsapp, msg)} target="_blank" rel="noopener noreferrer">Abrir conversa no WhatsApp</a>
            </Button>
          </Card>
          <Card title="Status">
            <select aria-label="Novo status" value={newStatus} onChange={(e) => setNewStatus(e.target.value as Status)} className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm">
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <Input placeholder="Observação (opcional)" value={statusNote} onChange={(e) => setStatusNote(e.target.value)} className="mt-2" />
            <Button onClick={saveStatus} className="mt-2 w-full">Salvar status</Button>
          </Card>
          <Card title="Anotações da loja">
            <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Preços consultados, observações internas…" className="text-sm" />
            <Label htmlFor="fdate" className="mt-2 block text-xs">Retornar ao cliente em</Label>
            <Input id="fdate" type="date" value={followDate} onChange={(e) => setFollowDate(e.target.value)} className="mt-1" />
            <Button variant="outline" onClick={saveNotes} className="mt-2 w-full">Salvar</Button>
          </Card>
          <Card title="Acompanhamento">
            <Input placeholder="O que foi feito? (opcional)" value={followNote} onChange={(e) => setFollowNote(e.target.value)} />
            <Button variant="outline" onClick={addFollowup} className="mt-2 w-full">Registrar que acompanhei</Button>
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">{fu.map((f) => <li key={f.id}>{fmt(f.created_at)} — {f.note ?? "acompanhado"}</li>)}</ul>
          </Card>
          <Card title="Histórico de status">
            <ul className="space-y-1 text-xs">
              {hist.map((h) => (
                <li key={h.id}>
                  <span className="text-muted-foreground">{fmt(h.created_at)}</span> — {h.from_status ? `${STATUS_LABEL[h.from_status]} → ` : ""}{STATUS_LABEL[h.to_status]}{h.note ? ` (${h.note})` : ""}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}
