import { normalizeWhatsapp } from "./rules";

/** Fields accepted by the database function submit_quote_request — nothing administrative. */
export type SubmitPayload = {
  name: string;
  whatsapp: string;
  notes: string;
  original_text: string;
  interpretation: { category: string; activity: string; items: { name: string; quantity: string }[]; missing_info: string[] } | null;
  clarifications: { question: string; answer: string }[];
  items: { name: string; quantity: string }[];
  suggestions: { rule_id: string; reason: string; accepted: boolean }[];
  ai_failed: boolean;
  submission_key: string;
  origin: string;
};

export type SubmitData = {
  name: string;
  whatsapp: string;
  notes: string;
  originalText: string;
  interpretation: SubmitPayload["interpretation"];
  clarifications: SubmitPayload["clarifications"];
  items: { name: string; quantity: string }[];
  suggestions: { rule_id: string; name: string; reason: string; accepted: boolean }[];
  aiFailed: boolean;
  submissionKey: string;
};

/** Builds the exact payload for the database. Keeps only suggestions pointing at allowed rule ids. */
export function buildSubmitPayload(data: SubmitData, phone: string, origin: string, allowedRuleIds: Set<string>): SubmitPayload {
  return {
    name: data.name,
    whatsapp: phone,
    notes: data.notes ?? "",
    original_text: data.originalText,
    interpretation: data.interpretation,
    clarifications: data.clarifications,
    items: data.items.filter((i) => i.name.trim()).map((i) => ({ name: i.name.trim(), quantity: i.quantity ?? "" })),
    suggestions: data.suggestions
      .filter((s) => allowedRuleIds.has(s.rule_id))
      .map((s) => ({ rule_id: s.rule_id, reason: s.reason, accepted: s.accepted })),
    ai_failed: data.aiFailed,
    submission_key: data.submissionKey,
    origin,
  };
}

export const SUBMIT_ERROR = "Não foi possível registrar agora. Tente novamente.";
export const RATE_ERROR = "Muitos envios em pouco tempo. Tente novamente mais tarde.";

export type SubmitDeps = {
  origin: () => Promise<string | null>;
  allowedRuleIds: (ids: string[]) => Promise<Set<string>>;
  rpc: (payload: SubmitPayload) => Promise<{ data: unknown; error: { code?: string } | null }>;
  log: (msg: string, code: string) => void;
};

export type SubmitResult = { ok: true; protocol: string } | { ok: false; error: string };

/** Order submit flow. The database is the only authority for the rate limit and recovery. */
export async function runSubmit(data: SubmitData, deps: SubmitDeps): Promise<SubmitResult> {
  const phone = normalizeWhatsapp(data.whatsapp);
  if (!phone) return { ok: false, error: "Informe um WhatsApp válido com DDD." };
  const origin = await deps.origin().catch(() => null);
  if (!origin) {
    deps.log("origin id unavailable", "origin_secret_missing");
    return { ok: false, error: SUBMIT_ERROR };
  }
  const allowed = data.suggestions.length ? await deps.allowedRuleIds(data.suggestions.map((s) => s.rule_id)) : new Set<string>();
  const payload = buildSubmitPayload(data, phone, origin, allowed);
  const { data: res, error } = await deps.rpc(payload);
  if (error) {
    deps.log("submit rpc failed", error.code ?? "unknown");
    return { ok: false, error: SUBMIT_ERROR };
  }
  const r = (res ?? {}) as { status?: string; protocol?: string };
  if ((r.status === "created" || r.status === "recovered") && typeof r.protocol === "string" && r.protocol)
    return { ok: true, protocol: r.protocol };
  if (r.status === "rate_limited") return { ok: false, error: RATE_ERROR };
  deps.log("submit rejected", r.status ?? "unknown");
  return { ok: false, error: SUBMIT_ERROR };
}
