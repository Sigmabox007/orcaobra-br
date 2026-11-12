import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: vi.fn() }, rpc: vi.fn() } }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@tanstack/react-start", () => {
  const chain: Record<string, unknown> = {};
  chain.middleware = () => chain;
  chain.inputValidator = () => chain;
  chain.handler = () => chain;
  return { createServerFn: () => chain };
});

import { runDeleteQuoteRequest, PILOT_STORE_ID } from "./admin.functions";
import { resolvePanelAccess, PILOT_STORE_ID as ROUTE_STORE } from "@/routes/_authenticated/route";

const ID = "11111111-1111-4111-8111-111111111111";
const PILOT = "cd677879-a4a7-4487-bf89-411797fec356";

function mockDb(opts: {
  roles?: { seller?: boolean; admin?: boolean };
  rpcError?: boolean;
  row?: { protocol: string } | null;
  readError?: boolean;
  count?: number;
}) {
  const calls: { op: string; filters: [string, unknown][] }[] = [];
  const rpc = vi.fn(async (_fn: string, args: { _min_role: "seller" | "admin" }) =>
    opts.rpcError ? { data: null, error: { code: "X" } } : { data: Boolean(opts.roles?.[args._min_role]), error: null },
  );
  const from = vi.fn((table: string) => {
    expect(table).toBe("quote_requests");
    const rec = { op: "", filters: [] as [string, unknown][] };
    calls.push(rec);
    const q: Record<string, unknown> = {
      select: () => ((rec.op = "select"), q),
      delete: () => ((rec.op = "delete"), q),
      eq: (c: string, v: unknown) => (rec.filters.push([c, v]), q),
      maybeSingle: async () => (opts.readError ? { data: null, error: { code: "R" } } : { data: opts.row ?? null, error: null }),
    };
    q["then"] = (res: (v: unknown) => unknown) => res({ error: null, count: opts.count ?? 1 });
    return q;
  });
  return { db: { rpc, from }, rpc, from, calls };
}

const admin = { seller: true, admin: true };

describe("deleteQuoteRequest store scope", () => {
  it("uses the pilot store constant", () => {
    expect(PILOT_STORE_ID).toBe(PILOT);
    expect(ROUTE_STORE).toBe(PILOT);
  });

  it("active admin deletes scoped by id, store_id and protocol", async () => {
    const m = mockDb({ roles: admin, row: { protocol: "OB-1" } });
    expect(await runDeleteQuoteRequest(m.db, { id: ID, protocol: "OB-1" })).toEqual({ ok: true });
    expect(m.rpc).toHaveBeenCalledWith("can_access_store", { _store: PILOT, _min_role: "admin" });
    expect(m.calls[0].filters).toEqual([["id", ID], ["store_id", PILOT]]);
    expect(m.calls[1]).toEqual({ op: "delete", filters: [["id", ID], ["store_id", PILOT], ["protocol", "OB-1"]] });
  });

  for (const [name, opts] of [
    ["seller", { roles: { seller: true, admin: false } }],
    ["no membership", { roles: {} }],
    ["revoked membership", { roles: { seller: false, admin: false } }],
    ["rpc error", { rpcError: true }],
  ] as const) {
    it(`${name}: denied before any order read`, async () => {
      const m = mockDb({ ...opts, row: { protocol: "OB-1" } });
      const r = await runDeleteQuoteRequest(m.db, { id: ID, protocol: "OB-1" });
      expect(r).toEqual({ ok: false, error: "Somente administradores podem excluir pedidos." });
      expect(m.from).not.toHaveBeenCalled();
    });
  }

  it("order read failure stops without delete", async () => {
    const m = mockDb({ roles: admin, readError: true });
    expect((await runDeleteQuoteRequest(m.db, { id: ID, protocol: "OB-1" })).ok).toBe(false);
    expect(m.calls).toHaveLength(1);
  });

  it("wrong protocol stops without delete", async () => {
    const m = mockDb({ roles: admin, row: { protocol: "OB-1" } });
    expect(await runDeleteQuoteRequest(m.db, { id: ID, protocol: "OB-2" })).toEqual({ ok: false, error: "O protocolo digitado não confere." });
    expect(m.calls).toHaveLength(1);
  });
});

describe("panel access contract", () => {
  it("admin gets staff+admin with storeId", async () => {
    expect(await resolvePanelAccess(mockDb({ roles: admin }).db.rpc as never)).toEqual({ isStaff: true, isAdmin: true, storeId: PILOT });
  });
  it("seller is staff, not admin", async () => {
    expect(await resolvePanelAccess(mockDb({ roles: { seller: true } }).db.rpc as never)).toMatchObject({ isStaff: true, isAdmin: false });
  });
  it("no/revoked membership and rpc error fail closed", async () => {
    expect(await resolvePanelAccess(mockDb({ roles: {} }).db.rpc as never)).toMatchObject({ isStaff: false, isAdmin: false });
    expect(await resolvePanelAccess(mockDb({ rpcError: true }).db.rpc as never)).toMatchObject({ isStaff: false, isAdmin: false });
  });
});
