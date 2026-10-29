// Pure business rules shared by client and server. Keep free of I/O.

export const MAX_SUGGESTIONS = 5;
export const MAX_QUESTIONS = 3;
export const MAX_TEXT = 1500;

export const STATUSES = [
  "recebido",
  "esclarecimento",
  "preparacao",
  "orcamento_enviado",
  "aguardando_retorno",
  "convertido",
  "perdido",
] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<Status, string> = {
  recebido: "Recebido",
  esclarecimento: "Precisa de esclarecimento",
  preparacao: "Em preparação",
  orcamento_enviado: "Orçamento enviado",
  aguardando_retorno: "Aguardando retorno",
  convertido: "Convertido em venda",
  perdido: "Perdido ou encerrado",
};

export const CATEGORY_LABEL: Record<string, string> = {
  pisos: "Pisos e revestimentos",
  sanitarios: "Instalações sanitárias",
  pintura: "Pintura",
  outro: "Outro",
};

/** Normalizes a Brazilian WhatsApp number to digits with DDD (10–11 digits). Returns null if invalid. */
export function normalizeWhatsapp(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  if (d.startsWith("0")) return null;
  if (d.length === 11 && d[2] !== "9") return null;
  return d;
}

export function whatsappLink(digits: string, message: string): string {
  return `https://wa.me/55${digits}?text=${encodeURIComponent(message)}`;
}

/** Masks phone numbers and e-mails before text is sent to the AI. */
export function maskContacts(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[e-mail removido]")
    .replace(/(\+?\d[\d\s().-]{7,}\d)/g, "[telefone removido]");
}

/** Random, non-sequential protocol like OO-7KQ4-M2XD. */
export function generateProtocol(rand: (n: number) => Uint8Array = defaultRand): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = rand(8);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `OO-${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
}
function defaultRand(n: number) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

export type RuleForAI = { id: string; complement: string; explanation: string; reviewed: boolean; active: boolean };

/** Only rules reviewed by a human AND active may ever reach the AI or the customer. */
export function eligibleRules<T extends { reviewed: boolean; active: boolean }>(rules: T[]): T[] {
  return rules.filter((r) => r.reviewed && r.active);
}

/** Keeps only suggestions pointing at allowed rule ids, dedupes, caps at MAX_SUGGESTIONS. */
export function sanitizeSuggestions(
  raw: { rule_id: string; reason?: string }[],
  allowed: { id: string; complement: string; explanation: string }[],
): { rule_id: string; name: string; reason: string }[] {
  const byId = new Map(allowed.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const out: { rule_id: string; name: string; reason: string }[] = [];
  for (const s of raw) {
    const rule = byId.get(s.rule_id);
    if (!rule || seen.has(rule.id)) continue;
    seen.add(rule.id);
    const reason = (s.reason ?? "").trim().slice(0, 240) || rule.explanation;
    out.push({ rule_id: rule.id, name: rule.complement, reason });
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

export type Limits = {
  ai_enabled: boolean;
  ai_daily_global_limit: number;
  ai_per_origin_hour: number;
  ai_per_origin_day: number;
  ai_per_session: number;
};
export type UsageCounts = { globalToday: number; originHour: number; originDay: number; session: number };

/** Decides if one more AI call is allowed. Returning a reason means: skip AI, continue without it. */
export function checkAiLimit(l: Limits, u: UsageCounts): { ok: true } | { ok: false; reason: string } {
  if (!l.ai_enabled) return { ok: false, reason: "disabled" };
  if (u.globalToday >= l.ai_daily_global_limit) return { ok: false, reason: "global_daily" };
  if (u.originHour >= l.ai_per_origin_hour) return { ok: false, reason: "origin_hour" };
  if (u.originDay >= l.ai_per_origin_day) return { ok: false, reason: "origin_day" };
  if (u.session >= l.ai_per_session) return { ok: false, reason: "session" };
  return { ok: true };
}

export type CountableRequest = { status: Status; is_test: boolean; needs_followup_at: string | null };

/** Dashboard indicators. Test data is always excluded. */
export function computeIndicators(rows: CountableRequest[], now = new Date()) {
  const real = rows.filter((r) => !r.is_test);
  const by = (s: Status) => real.filter((r) => r.status === s).length;
  return {
    total: real.length,
    novos: by("recebido"),
    aguardandoOrcamento: by("esclarecimento") + by("preparacao"),
    orcamentosEnviados: by("orcamento_enviado"),
    aguardandoRetorno: by("aguardando_retorno"),
    convertidos: by("convertido"),
    encerrados: by("perdido"),
    precisamRetorno: real.filter(
      (r) => r.needs_followup_at !== null && new Date(r.needs_followup_at) <= now && r.status !== "convertido" && r.status !== "perdido",
    ).length,
  };
}
