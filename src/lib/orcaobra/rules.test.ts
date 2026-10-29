import { describe, expect, it } from "vitest";
import {
  checkAiLimit,
  computeIndicators,
  eligibleRules,
  generateProtocol,
  maskContacts,
  normalizeWhatsapp,
  sanitizeSuggestions,
} from "./rules";

const limits = { ai_enabled: true, ai_daily_global_limit: 300, ai_per_origin_hour: 6, ai_per_origin_day: 20, ai_per_session: 4 };
const zero = { globalToday: 0, originHour: 0, originDay: 0, session: 0 };

describe("sugestões", () => {
  const allowed = Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, complement: `Item ${i}`, explanation: "x" }));
  it("limita a 5 sugestões", () => {
    expect(sanitizeSuggestions(allowed.map((r) => ({ rule_id: r.id })), allowed)).toHaveLength(5);
  });
  it("descarta itens que não existem na base", () => {
    expect(sanitizeSuggestions([{ rule_id: "inventado" }], allowed)).toHaveLength(0);
  });
  it("regra não revisada nunca é elegível", () => {
    expect(eligibleRules([{ reviewed: false, active: true }, { reviewed: true, active: false }])).toHaveLength(0);
  });
});

describe("limites de IA", () => {
  it("bloqueia no teto diário global", () => {
    expect(checkAiLimit(limits, { ...zero, globalToday: 300 }).ok).toBe(false);
  });
  it("bloqueia a 7ª análise na hora para a mesma origem", () => {
    expect(checkAiLimit(limits, { ...zero, originHour: 6 }).ok).toBe(false);
    expect(checkAiLimit(limits, { ...zero, originHour: 5 }).ok).toBe(true);
  });
  it("bloqueia após 4 chamadas na mesma sessão", () => {
    expect(checkAiLimit(limits, { ...zero, session: 4 }).ok).toBe(false);
  });
});

describe("WhatsApp", () => {
  it("aceita celular com DDD", () => expect(normalizeWhatsapp("(21) 98765-4321")).toBe("21987654321"));
  it("aceita com +55", () => expect(normalizeWhatsapp("+55 21 98765-4321")).toBe("21987654321"));
  it("rejeita número curto", () => expect(normalizeWhatsapp("98765-4321")).toBeNull());
});

describe("privacidade", () => {
  it("mascara telefone e e-mail antes de enviar à IA", () => {
    const out = maskContacts("me liga 21 98765-4321 ou joao@x.com, quero 20 m² de piso");
    expect(out).not.toContain("98765");
    expect(out).not.toContain("joao@x.com");
    expect(out).toContain("20 m²");
  });
  it("protocolo não é sequencial", () => {
    expect(generateProtocol()).toMatch(/^OO-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(generateProtocol()).not.toBe(generateProtocol());
  });
});

describe("indicadores", () => {
  it("exclui pedidos de teste", () => {
    const r = computeIndicators([
      { status: "recebido", is_test: true, needs_followup_at: null },
      { status: "recebido", is_test: false, needs_followup_at: null },
    ]);
    expect(r.total).toBe(1);
    expect(r.novos).toBe(1);
  });
});
