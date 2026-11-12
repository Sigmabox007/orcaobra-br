import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: () => { throw new Error("no real db"); } } }));
vi.mock("@lovable.dev/ai-gateway", () => ({ generateResponse: vi.fn(), GatewayError: class {} }));
vi.mock("@tanstack/react-start/server", () => ({ getRequestHeader: () => undefined }));

import { PILOT_STORE_ID, fetchPilotRules, fetchAllowedRuleIds, logUsage } from "./ai.server";

function mockDb(rows: unknown[]) {
  const calls: [string, ...unknown[]][] = [];
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in"]) q[m] = (...a: unknown[]) => (calls.push([m, ...a]), q);
  q["then"] = (r: (v: unknown) => unknown) => r({ data: rows });
  q["insert"] = (v: unknown) => (calls.push(["insert", v]), Promise.resolve({ error: null }));
  return { db: { from: (t: string) => (calls.push(["from", t]), q) } as never, calls };
}

describe("pilot store scoping", () => {
  it("pilot store id is the A.S. Figueiredo id", () => {
    expect(PILOT_STORE_ID).toBe("cd677879-a4a7-4487-bf89-411797fec356");
  });
  it("suggestion rules are filtered by pilot store_id", async () => {
    const { db, calls } = mockDb([]);
    await fetchPilotRules("pisos", db);
    expect(calls).toContainEqual(["eq", "store_id", PILOT_STORE_ID]);
    expect(calls).toContainEqual(["eq", "reviewed", true]);
    expect(calls).toContainEqual(["eq", "active", true]);
  });
  it("allowed rule ids are filtered by pilot store_id", async () => {
    const { db, calls } = mockDb([{ id: "a" }]);
    const set = await fetchAllowedRuleIds(["a", "b"], db);
    expect(calls).toContainEqual(["eq", "store_id", PILOT_STORE_ID]);
    expect([...set]).toEqual(["a"]);
  });
  it("ai_usage insert carries pilot store_id", async () => {
    const { db, calls } = mockDb([]);
    await logUsage("suggest", "o", "session-1", true, db);
    const ins = calls.find((c) => c[0] === "insert")!;
    expect((ins[1] as { store_id: string }).store_id).toBe(PILOT_STORE_ID);
  });
});
