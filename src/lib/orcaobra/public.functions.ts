import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { MAX_TEXT, MAX_QUESTIONS, eligibleRules, sanitizeSuggestions } from "./rules";
import { runSubmit } from "./submit";
import type { Json } from "@/integrations/supabase/types";

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
  submissionKey: z.string().uuid(),
});

export type SubmitInput = z.input<typeof submitSchema>;

export const submitRequest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => submitSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { originHash } = await import("./ai.server");
    // Single transactional database call: order, items, complements, history and submit log
    // are written together or not at all. Rate limit and retry recovery are decided there.
    return runSubmit(data, {
      origin: originHash,
      allowedRuleIds: async (ids) => {
        const { data: rows } = await supabaseAdmin.from("association_rules").select("id").in("id", ids).eq("reviewed", true).eq("active", true);
        return new Set((rows ?? []).map((r) => r.id));
      },
      rpc: async (payload) => {
        const { data: res, error } = await supabaseAdmin.rpc("submit_quote_request", { payload: payload as unknown as Json });
        return { data: res, error: error ? { code: error.code } : null };
      },
      log: (msg, code) => console.error(msg, code),
    });
  });
