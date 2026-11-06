import { describe, expect, it, vi } from "vitest";
import { buildSubmitPayload, runSubmit, RATE_ERROR, SUBMIT_ERROR, type SubmitData, type SubmitDeps } from "./submit";

const RULE_OK = "11111111-1111-4111-8111-111111111111";
const RULE_BAD = "22222222-2222-4222-8222-222222222222";
const KEY = "33333333-3333-4333-8333-333333333333";

const data: SubmitData = {
  name: "Maria",
  whatsapp: "(11) 99999-0000",
  notes: "",
  originalText: "10 caixas de piso",
  interpretation: null,
  clarifications: [],
  items: [{ name: " Piso 60x60 ", quantity: "10 cx" }, { name: "  ", quantity: "" }],
  suggestions: [
    { rule_id: RULE_OK, name: "Argamassa", reason: "assentar", accepted: true },
    { rule_id: RULE_BAD, name: "Inventado", reason: "x", accepted: true },
  ],
  aiFailed: true,
  submissionKey: KEY,
};

function deps(rpcResult: Awaited<ReturnType<SubmitDeps["rpc"]>>, over: Partial<SubmitDeps> = {}): SubmitDeps {
  return {
    origin: async () => "origin-abcdefghijklmnop",
    allowedRuleIds: async () => new Set([RULE_OK]),
    rpc: vi.fn(async () => rpcResult),
    log: () => {},
    ...over,
  };
}

describe("buildSubmitPayload", () => {
  const p = buildSubmitPayload(data, "5511999990000", "origin-x", new Set([RULE_OK]));
  it("sends only the fields the database accepts", () => {
    expect(Object.keys(p).sort()).toEqual(
      ["ai_failed", "clarifications", "interpretation", "items", "name", "notes", "origin", "original_text", "submission_key", "suggestions", "whatsapp"].sort(),
    );
  });
  it("drops blank items and trims names", () => expect(p.items).toEqual([{ name: "Piso 60x60", quantity: "10 cx" }]));
  it("drops suggestions for rules that are not reviewed and active, and never sends the display name", () =>
    expect(p.suggestions).toEqual([{ rule_id: RULE_OK, reason: "assentar", accepted: true }]));
  it("keeps the submission key", () => expect(p.submission_key).toBe(KEY));
});

describe("runSubmit", () => {
  it("returns the protocol only when the database confirms the full write", async () => {
    expect(await runSubmit(data, deps({ data: { status: "created", protocol: "OO-ABCD-EFGH" }, error: null }))).toEqual({ ok: true, protocol: "OO-ABCD-EFGH" });
  });
  it("returns the same protocol on a recovered retry", async () => {
    expect(await runSubmit(data, deps({ data: { status: "recovered", protocol: "OO-ABCD-EFGH" }, error: null }))).toEqual({ ok: true, protocol: "OO-ABCD-EFGH" });
  });
  it("database error: no protocol", async () => {
    expect(await runSubmit(data, deps({ data: null, error: { code: "22023" } }))).toEqual({ ok: false, error: SUBMIT_ERROR });
  });
  it("success without a protocol is treated as failure", async () => {
    expect(await runSubmit(data, deps({ data: { status: "created" }, error: null }))).toEqual({ ok: false, error: SUBMIT_ERROR });
  });
  it("rate limit decided by the database shows the current message", async () => {
    expect(await runSubmit(data, deps({ data: { status: "rate_limited" }, error: null }))).toEqual({ ok: false, error: RATE_ERROR });
  });
  it("key reused with different content or origin is refused without a protocol", async () => {
    expect(await runSubmit(data, deps({ data: { status: "rejected" }, error: null }))).toEqual({ ok: false, error: SUBMIT_ERROR });
  });
  it("fails closed when the origin id is unavailable, without calling the database", async () => {
    const d = deps({ data: { status: "created", protocol: "OO-ABCD-EFGH" }, error: null }, { origin: async () => null });
    expect(await runSubmit(data, d)).toEqual({ ok: false, error: SUBMIT_ERROR });
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it("rejects an invalid WhatsApp before touching the database", async () => {
    const d = deps({ data: null, error: null });
    expect((await runSubmit({ ...data, whatsapp: "123" }, d)).ok).toBe(false);
    expect(d.rpc).not.toHaveBeenCalled();
  });
  it("does no rate counting of its own: the database is always asked, so recovery is never pre-blocked", async () => {
    const d = deps({ data: { status: "recovered", protocol: "OO-ABCD-EFGH" }, error: null });
    await runSubmit(data, d);
    expect(d.rpc).toHaveBeenCalledTimes(1);
  });
});
