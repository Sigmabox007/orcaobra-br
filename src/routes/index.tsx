import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { PublicShell } from "@/components/orcaobra/brand";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { interpretRequest, suggestComplements, submitRequest } from "@/lib/orcaobra/public.functions";
import { MAX_TEXT, CATEGORY_LABEL } from "@/lib/orcaobra/rules";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OrçaObra — Monte seu pedido de materiais de construção" },
      { name: "description", content: "Descreva sua obra ou reforma e receba ajuda para montar um pedido de orçamento completo na A.S. Figueiredo." },
      { property: "og:title", content: "OrçaObra — Seu orçamento mais completo" },
      { property: "og:description", content: "Descreva o que precisa para a obra; a IA ajuda a não esquecer nada e a loja prepara o orçamento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

type Item = { name: string; quantity: string };
type Interp = { category: "pisos" | "sanitarios" | "pintura" | "outro"; activity: string; items: Item[]; missing_info: string[]; questions: string[] };
type Sugg = { rule_id: string; name: string; reason: string; accepted: boolean };
type Step = "pedido" | "perguntas" | "sugestoes" | "resumo" | "contato";

const STEPS: { id: Step; label: string }[] = [
  { id: "pedido", label: "Pedido" },
  { id: "perguntas", label: "Detalhes" },
  { id: "sugestoes", label: "Complementos" },
  { id: "resumo", label: "Resumo" },
  { id: "contato", label: "Envio" },
];

function getSessionId() {
  let id = sessionStorage.getItem("oo_sid");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("oo_sid", id);
  }
  return id;
}

/** One key per order attempt; reused on retries so the database can return the same protocol. */
function getSubmissionKey() {
  let id = sessionStorage.getItem("oo_submit_key");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("oo_submit_key", id);
  }
  return id;
}

function Index() {
  const navigate = useNavigate();
  const interpretFn = useServerFn(interpretRequest);
  const suggestFn = useServerFn(suggestComplements);
  const submitFn = useServerFn(submitRequest);

  const [step, setStep] = useState<Step>("pedido");
  const [text, setText] = useState("");
  const [analyzedText, setAnalyzedText] = useState("");
  const [interp, setInterp] = useState<Interp | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<Sugg[]>([]);
  const [suggestKey, setSuggestKey] = useState("");
  const [aiFailed, setAiFailed] = useState(false);
  const [aiNotice, setAiNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [hp, setHp] = useState("");
  const [error, setError] = useState("");
  const [sid, setSid] = useState("");

  useEffect(() => setSid(getSessionId()), []);

  const fallback = (msg: string) => {
    setAiFailed(true);
    setAiNotice(msg);
  };

  async function analyze() {
    setError("");
    if (text.trim().length < 3) return setError("Descreva o que você precisa.");
    if (text === analyzedText && interp) return setStep(interp.questions.length ? "perguntas" : "sugestoes");
    setBusy(true);
    try {
      const r = await interpretFn({ data: { text, sessionId: sid } });
      setAnalyzedText(text);
      if (r.ok) {
        setInterp(r.result);
        setItems(r.result.items);
        setAnswers(r.result.questions.map(() => ""));
        setAiFailed(false);
        setAiNotice("");
        setSuggestions([]);
        setSuggestKey("");
        setStep(r.result.questions.length ? "perguntas" : "sugestoes");
        if (!r.result.questions.length) void loadSuggestions(r.result, []);
      } else {
        setInterp(null);
        setItems([]);
        fallback("O assistente não está disponível agora. Você pode continuar com o seu pedido normalmente.");
        setStep("resumo");
      }
    } catch {
      setInterp(null);
      setItems([]);
      fallback("O assistente não está disponível agora. Você pode continuar com o seu pedido normalmente.");
      setStep("resumo");
    } finally {
      setBusy(false);
    }
  }

  async function loadSuggestions(i: Interp, ans: string[]) {
    const qa = i.questions.map((q, idx) => ({ question: q, answer: ans[idx] ?? "" })).filter((a) => a.answer.trim());
    const key = JSON.stringify([analyzedText || text, qa]);
    if (key === suggestKey) return;
    setBusy(true);
    try {
      const r = await suggestFn({ data: { text: analyzedText || text, category: i.category, answers: qa, sessionId: sid } });
      setSuggestions(r.suggestions.map((s) => ({ ...s, accepted: false })));
      setSuggestKey(key);
      if (!r.ok) setAiNotice("Não foi possível buscar sugestões agora. Você pode seguir com o seu pedido.");
    } catch {
      setSuggestions([]);
      setAiNotice("Não foi possível buscar sugestões agora. Você pode seguir com o seu pedido.");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    setError("");
    if (!name.trim() || name.trim().length < 2) return setError("Informe seu nome.");
    if (!consent) return setError("É preciso autorizar o contato para enviarmos o orçamento.");
    setBusy(true);
    try {
      const qa = (interp?.questions ?? []).map((q, idx) => ({ question: q, answer: answers[idx] ?? "" }));
      const r = await submitFn({
        data: {
          name,
          whatsapp: phone,
          notes,
          consent: true,
          honeypot: hp,
          originalText: text,
          interpretation: interp ? { category: interp.category, activity: interp.activity, items: interp.items, missing_info: interp.missing_info } : null,
          clarifications: qa,
          items: items.filter((i) => i.name.trim()),
          suggestions,
          aiFailed: aiFailed || !interp,
          submissionKey: getSubmissionKey(),
        },
      });
      // A definitive answer from the server (success or refusal) ends this attempt; only a
      // lost connection keeps the key so the retry recovers the same protocol.
      sessionStorage.removeItem("oo_submit_key");
      if (!r.ok) return setError(r.error);
      sessionStorage.setItem(
        "oo_last",
        JSON.stringify({ protocol: r.protocol, items: items.filter((i) => i.name.trim()).length + suggestions.filter((s) => s.accepted).length }),
      );
      navigate({ to: "/confirmacao" });
    } catch {
      setError("Confira os dados e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  const stepIdx = STEPS.findIndex((s) => s.id === step);

  return (
    <PublicShell>
      <ol className="mb-8 flex gap-1.5" aria-label="Etapas">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex-1">
            <div className={`h-1.5 rounded-full ${i <= stepIdx ? "bg-highlight" : "bg-secondary"}`} />
            <span className={`mt-1.5 block text-[11px] ${i === stepIdx ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{s.label}</span>
          </li>
        ))}
      </ol>

      {aiNotice && <p role="status" className="mb-4 rounded-lg bg-accent px-4 py-3 text-sm text-accent-foreground">{aiNotice}</p>}

      {step === "pedido" && (
        <section className="space-y-5">
          <h1 className="text-3xl font-bold leading-tight text-primary md:text-4xl">O que você precisa para sua obra ou reforma?</h1>
          <p className="text-muted-foreground">Escreva do seu jeito. Não precisa saber o nome técnico dos produtos.</p>
          <div>
            <Label htmlFor="pedido" className="sr-only">Seu pedido</Label>
            <Textarea
              id="pedido"
              value={text}
              maxLength={MAX_TEXT}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              placeholder="Ex.: Preciso de 20 m² de piso para área externa"
              className="bg-card text-base"
            />
            <p className="mt-1 text-right text-xs text-muted-foreground">{text.length}/{MAX_TEXT}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {["Preciso de 20 m² de piso para área externa", "Quero um vaso sanitário", "Vou pintar um quarto", "Preciso instalar uma pia"].map((ex) => (
              <button key={ex} type="button" onClick={() => setText(ex)} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs hover:border-highlight">
                {ex}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button size="lg" className="w-full" onClick={analyze} disabled={busy || !sid}>
            {busy ? "Analisando seu pedido…" : "Continuar"}
          </Button>
        </section>
      )}

      {step === "perguntas" && interp && (
        <section className="space-y-5">
          <h2 className="text-2xl font-bold text-primary">Só alguns detalhes</h2>
          <p className="text-muted-foreground">Isso ajuda a loja a acertar no orçamento. Pode pular o que não souber.</p>
          {interp.questions.map((q, i) => (
            <div key={i} className="space-y-1.5">
              <Label htmlFor={`q${i}`}>{q}</Label>
              <Input id={`q${i}`} maxLength={300} value={answers[i] ?? ""} onChange={(e) => setAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))} className="bg-card" />
            </div>
          ))}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep("pedido")}>Voltar</Button>
            <Button
              className="flex-1"
              disabled={busy}
              onClick={() => {
                setStep("sugestoes");
                void loadSuggestions(interp, answers);
              }}
            >
              Continuar
            </Button>
          </div>
        </section>
      )}

      {step === "sugestoes" && (
        <section className="space-y-5">
          <h2 className="text-2xl font-bold text-primary">Algo mais para a obra?</h2>
          {busy ? (
            <p className="text-muted-foreground">Procurando itens que costumam ser úteis…</p>
          ) : suggestions.length === 0 ? (
            <p className="text-muted-foreground">Não temos sugestões para este pedido. Você pode seguir normalmente.</p>
          ) : (
            <>
              <p className="text-muted-foreground">
                Para ajudar você a não esquecer nada na obra, separamos alguns itens que também podem ser úteis. Deseja incluir algum deles no orçamento?
              </p>
              <ul className="space-y-3">
                {suggestions.map((s, i) => (
                  <li key={s.rule_id}>
                    <label className={`flex cursor-pointer gap-3 rounded-xl border bg-card p-4 transition ${s.accepted ? "border-highlight ring-1 ring-highlight" : "border-border"}`}>
                      <Checkbox
                        checked={s.accepted}
                        onCheckedChange={(v) => setSuggestions((arr) => arr.map((x, j) => (j === i ? { ...x, accepted: v === true } : x)))}
                        className="mt-0.5"
                        aria-label={`Incluir ${s.name}`}
                      />
                      <span className="flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{s.name}</span>
                          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground">Sugestão</span>
                        </span>
                        <span className="mt-1 block text-sm text-muted-foreground">{s.reason}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">A loja confirmará a compatibilidade e a disponibilidade de cada item.</p>
            </>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(interp?.questions.length ? "perguntas" : "pedido")}>Voltar</Button>
            <Button className="flex-1" disabled={busy} onClick={() => setStep("resumo")}>
              {suggestions.some((s) => s.accepted) ? "Continuar" : "Seguir sem complementos"}
            </Button>
          </div>
        </section>
      )}

      {step === "resumo" && (
        <section className="space-y-5">
          <h2 className="text-2xl font-bold text-primary">Confira seu pedido</h2>
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold text-muted-foreground">O que você escreveu</h3>
            <p className="mt-1 whitespace-pre-wrap">{text}</p>
            {interp && <p className="mt-2 text-xs text-muted-foreground">Categoria: {CATEGORY_LABEL[interp.category]}</p>}
            {interp?.activity && <p className="mt-2 text-sm"><strong>Serviço ou necessidade:</strong> {interp.activity}</p>}
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Produtos solicitados</h3>
            {items.length === 0 && <p className="text-sm text-muted-foreground">Nenhum produto específico informado.</p>}
            <ul className="space-y-2">
              {items.map((it, i) => (
                <li key={i} className="flex gap-2">
                  <Input aria-label="Produto" value={it.name} maxLength={120} onChange={(e) => setItems((a) => a.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  <Input aria-label="Quantidade" value={it.quantity} maxLength={40} placeholder="Qtd." className="w-28" onChange={(e) => setItems((a) => a.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />
                  <Button variant="ghost" size="sm" aria-label="Remover item" onClick={() => setItems((a) => a.filter((_, j) => j !== i))}>✕</Button>
                </li>
              ))}
            </ul>
            <Button variant="link" className="px-0" onClick={() => setItems((a) => [...a, { name: "", quantity: "" }])}>+ Adicionar item</Button>
          </div>
          {interp && interp.questions.some((_, i) => answers[i]?.trim()) && (
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Detalhes informados</h3>
              <dl className="space-y-1 text-sm">
                {interp.questions.map((q, i) => answers[i]?.trim() ? (<div key={i}><dt className="text-muted-foreground">{q}</dt><dd>{answers[i]}</dd></div>) : null)}
              </dl>
            </div>
          )}
          {suggestions.some((s) => s.accepted) && (
            <div className="rounded-xl border border-highlight/60 bg-accent p-4">
              <h3 className="mb-2 text-sm font-semibold text-accent-foreground">Complementos que você escolheu</h3>
              <ul className="list-inside list-disc text-sm">{suggestions.filter((s) => s.accepted).map((s) => <li key={s.rule_id}>{s.name}</li>)}</ul>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Preços e disponibilidade serão informados pela loja no orçamento.</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(interp ? "sugestoes" : "pedido")}>Voltar</Button>
            <Button className="flex-1" onClick={() => setStep("contato")}>Continuar</Button>
          </div>
        </section>
      )}

      {step === "contato" && (
        <section className="space-y-5">
          <h2 className="text-2xl font-bold text-primary">Para onde enviamos o orçamento?</h2>
          <div className="space-y-1.5">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className="bg-card" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="whats">WhatsApp com DDD</Label>
            <Input id="whats" type="tel" inputMode="tel" autoComplete="tel" placeholder="(21) 98765-4321" maxLength={25} value={phone} onChange={(e) => setPhone(e.target.value)} className="bg-card" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="obs">Observações (opcional)</Label>
            <Textarea id="obs" maxLength={500} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-card" />
          </div>
          <input type="text" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" value={hp} onChange={(e) => setHp(e.target.value)} name="website" />
          <label className="flex gap-3 text-sm">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
            <span>
              Autorizo a A.S. Figueiredo a entrar em contato pelo WhatsApp informado somente sobre este orçamento. Veja a{" "}
              <a href="/privacidade" target="_blank" className="underline">política de privacidade</a>.
            </span>
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep("resumo")}>Voltar</Button>
            <Button className="flex-1" size="lg" onClick={submit} disabled={busy}>{busy ? "Enviando…" : "Enviar pedido de orçamento"}</Button>
          </div>
        </section>
      )}
    </PublicShell>
  );
}
