// Pure business rules shared by client and server. Keep free of I/O.

export const MAX_SUGGESTIONS = 5;
export const MAX_QUESTIONS = 3;
export const MAX_TEXT = 1500;

export type ProductItem = { name: string; quantity: string };

/** Discard legacy service-as-item fallbacks, never infer products or quantities. */
export function requestedProducts<T extends { name: string; quantity: string | null }>(items: T[], originalText: string, activity = ""): T[] {
  const normalize = (s: string) => s.trim().toLocaleLowerCase("pt-BR").replace(/[.!?]+$/, "");
  const service = /\b(pintar|instalar|reformar|construir|assentar|revestir)\b/i.test(originalText);
  return items.filter((item) => {
    if (!item.name.trim()) return false;
    if (item.quantity?.trim()) return true;
    const name = normalize(item.name);
    return !(service && (name === normalize(originalText) || name === normalize(originalText.slice(0, 120)) || (activity && name === normalize(activity))));
  });
}

/** Pending means an explicitly asked question without a stored answer, not initial AI guesses. */
export function pendingClarifications(answers: { question: string; answer: string }[]) {
  return answers.filter((a) => !a.answer.trim());
}

export function buildRequestItems(items: ProductItem[], suggestions: { name: string; accepted: boolean }[]) {
  return [
    ...items.filter((i) => i.name.trim()).map((i) => ({ origin: "original", name: i.name.trim(), quantity: i.quantity || null })),
    ...suggestions.filter((s) => s.accepted).map((s) => ({ origin: "complement", name: s.name, quantity: null })),
  ];
}

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

const EMAIL_RE = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/gu;
// Formatted CPF (000.000.000-00). Unformatted 11 digits are caught by the phone rule.
const CPF_RE = /(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/g;
// Brazilian phones: optional +55/55/0, DDD (with or without parentheses), mobile 9xxxx or landline [2-5]xxx, then 4 digits.
// Without DDD only formats that look like a local phone (98765-4321, 987654321, 3333-4444) are masked,
// so quantities, measures, CEPs and product/EAN codes stay intact.
const BR_PHONE_RE =
  /(?<!\d)(?:(?:\+\s?55[\s.-]?|55[\s.-]?|0)?(?:\(\s?[1-9]{2}\s?\)|[1-9]{2})[\s.-]?(?:9[\s.-]?\d{4}|[2-5]\d{3})[\s.-]?\d{4}|(?:9\d{4}[\s.-]?|[2-5]\d{3}[.-])\d{4})(?!\d)/g;
// International numbers written with a leading "+".
const INTL_PHONE_RE = /\+\d[\d\s().-]{7,}\d/g;

/** Masks e-mails, phone numbers and formatted CPFs in text sent to the AI. The stored original is never altered. */
export function maskContacts(text: string): string {
  return text
    .replace(EMAIL_RE, "[e-mail removido]")
    .replace(CPF_RE, "[documento removido]")
    .replace(BR_PHONE_RE, "[telefone removido]")
    .replace(INTL_PHONE_RE, "[telefone removido]");
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

/** Deletion confirmation: the typed protocol must match exactly (surrounding spaces ignored). */
export function protocolConfirmed(typed: string, protocol: string): boolean {
  return protocol.length > 0 && typed.trim() === protocol;
}

/**
 * Pseudonymous origin id for abuse limits: HMAC-SHA256(secret, ip + user agent), 32 hex chars.
 * Without the secret the id cannot be recomputed from a guessed IP. Throws when the secret is missing.
 */
export async function originId(secret: string | undefined, ip: string, userAgent: string): Promise<string> {
  if (!secret) throw new Error("origin_secret_missing");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`orcaobra:${ip}:${userAgent.slice(0, 80)}`));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
