import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { MAX_TEXT, MAX_QUESTIONS, eligibleRules, generateProtocol, normalizeWhatsapp, sanitizeSuggestions, buildRequestItems } from "./rules";

const sessionId = z.string().min(8).max(64);

export const interpretRequest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ text: z.string().trim().min(3).max(MAX_TEXT), sessionId }).parse(d))
  .handler(async ({ data }) => {
    const ai = await import("./ai.server");
    const origin = await ai.originHash().catch(() => null);
    if (!origin) {
      console.error("origin id unavailable", "origin_secret_missing");
      return { ok: false as const, reason: "error" };
    }
    const gate = await ai.guardAi(origin, data.sessionId);
    if (!gate.ok) return { ok: false as const, reason: "limit" };
    try {
      const result = await ai.interpret(data.text);
      await ai.logUsage("interpret", origin, data.sessionId, true);
      return { ok: true as const, result };
    } catch (e) {
      console.error("interpret failed", ai.describeAiError(e));
      await ai.logUsage("interpret", origin, data.sessionId, false);
      return { ok: false as const, reason: "error" };
    }
  });

export const suggestComplements = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        text: z.string().trim().min(3).max(MAX_TEXT),
        category: z.enum(["pisos", "sanitarios", "pintura", "outro"]),
        answers: z.array(z.object({ question: z.string().max(200), answer: z.string().max(300) })).max(MAX_QUESTIONS),
        sessionId,
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    if (data.category === "outro") return { ok: true as const, suggestions: [] };
    const ai = await import("./ai.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("association_rules")
      .select("id, trigger, complement, condition, explanation, reviewed, active")
      .eq("category", data.category)
      .eq("reviewed", true)
      .eq("active", true);
    const rules = eligibleRules(rows ?? []);
    if (rules.length === 0) return { ok: true as const, suggestions: [] };
    const origin = await ai.originHash().catch(() => null);
    if (!origin) {
      console.error("origin id unavailable", "origin_secret_missing");
      return { ok: false as const, reason: "error", suggestions: [] };
    }
    const gate = await ai.guardAi(origin, data.sessionId);
    if (!gate.ok) return { ok: false as const, reason: "limit", suggestions: [] };
    try {
      const raw = await ai.suggest(data.text, data.answers, rules);
      await ai.logUsage("suggest", origin, data.sessionId, true);
      return { ok: true as const, suggestions: sanitizeSuggestions(raw, rules) };
    } catch (e) {
      console.error("suggest failed", ai.describeAiError(e));
      await ai.logUsage("suggest", origin, data.sessionId, false);
      return { ok: false as const, reason: "error", suggestions: [] };
    }
  });

const submitSchema = z.object({
  name: z.string().trim().min(2).max(80),
  whatsapp: z.string().max(25),
  notes: z.string().trim().max(500).optional().default(""),
  consent: z.literal(true),
  honeypot: z.string().max(0).optional().default(""),
  originalText: z.string().trim().min(3).max(MAX_TEXT),
  interpretation: z
    .object({
      category: z.string().max(20),
      activity: z.string().max(120),
      items: z.array(z.object({ name: z.string().max(120), quantity: z.string().max(40) })).max(20),
      missing_info: z.array(z.string().max(160)).max(5),
    })
    .nullable(),
  clarifications: z.array(z.object({ question: z.string().max(200), answer: z.string().max(300) })).max(MAX_QUESTIONS),
  items: z.array(z.object({ name: z.string().trim().min(1).max(120), quantity: z.string().max(40) })).max(30),
  suggestions: z
    .array(z.object({ rule_id: z.string().uuid(), name: z.string().max(120), reason: z.string().max(240), accepted: z.boolean() }))
    .max(5),
  aiFailed: z.boolean(),
});

export type SubmitInput = z.input<typeof submitSchema>;

export const submitRequest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => submitSchema.parse(d))
  .handler(async ({ data }) => {
    const phone = normalizeWhatsapp(data.whatsapp);
    if (!phone) return { ok: false as const, error: "Informe um WhatsApp válido com DDD." };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { originHash } = await import("./ai.server");
    const origin = await originHash().catch(() => null);
    if (!origin) {
      console.error("origin id unavailable", "origin_secret_missing");
      return { ok: false as const, error: "Não foi possível registrar agora. Tente novamente." };
    }
    const { data: settings } = await supabaseAdmin.from("app_settings").select("submits_per_origin_hour").eq("id", 1).single();
    const { count } = await supabaseAdmin
      .from("submit_log")
      .select("id", { count: "exact", head: true })
      .eq("origin_hash", origin)
      .gte("created_at", new Date(Date.now() - 3600_000).toISOString());
    if ((count ?? 0) >= (settings?.submits_per_origin_hour ?? 5))
      return { ok: false as const, error: "Muitos envios em pouco tempo. Tente novamente mais tarde." };

    const { data: store } = await supabaseAdmin.from("stores").select("id").limit(1).single();
    // Only accept suggestions that point at reviewed, active rules.
    const ruleIds = data.suggestions.map((s) => s.rule_id);
    const { data: okRules } = ruleIds.length
      ? await supabaseAdmin.from("association_rules").select("id, complement").in("id", ruleIds).eq("reviewed", true).eq("active", true)
      : { data: [] as { id: string; complement: string }[] };
    const valid = new Map((okRules ?? []).map((r) => [r.id, r.complement]));
     const suggestions = data.suggestions.flatMap((s) => {
       const name = valid.get(s.rule_id);
       return name ? [{ ...s, name }] : [];
     });

    let protocol = "";
    let requestId = "";
    for (let i = 0; i < 3 && !requestId; i++) {
      protocol = generateProtocol();
      const { data: row, error } = await supabaseAdmin
        .from("quote_requests")
        .insert({
          store_id: store?.id ?? null,
          protocol,
          customer_name: data.name,
          customer_whatsapp: phone,
          customer_notes: data.notes || null,
          consent_at: new Date().toISOString(),
          original_text: data.originalText,
          ai_interpretation: data.interpretation,
          clarifications: data.clarifications,
          category: data.interpretation?.category ?? null,
          ai_failed: data.aiFailed,
        })
        .select("id")
        .single();
      if (row) requestId = row.id;
      else if (error && error.code !== "23505") {
        // Log only the error code: Postgres "details" can echo the full row (name, WhatsApp, order text).
        console.error("submit insert failed", error.code);
        return { ok: false as const, error: "Não foi possível registrar agora. Tente novamente." };
      }
    }
    if (!requestId) return { ok: false as const, error: "Não foi possível registrar agora. Tente novamente." };

    const items = buildRequestItems(data.items, suggestions).map((i) => ({ ...i, request_id: requestId }));
    if (items.length) await supabaseAdmin.from("request_items").insert(items);
    if (suggestions.length)
      await supabaseAdmin
        .from("suggested_complements")
        .insert(suggestions.map((s) => ({ request_id: requestId, rule_id: s.rule_id, name: s.name, reason: s.reason, accepted: s.accepted })));
    await supabaseAdmin.from("status_history").insert({ request_id: requestId, to_status: "recebido", note: "Pedido enviado pelo cliente" });
    await supabaseAdmin.from("submit_log").insert({ origin_hash: origin });
    return { ok: true as const, protocol };
  });
