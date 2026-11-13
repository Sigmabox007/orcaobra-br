import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, cleanup, waitFor } from "@testing-library/react";
import React from "react";

const m = vi.hoisted(() => ({
  context: { storeId: "cd677879-a4a7-4487-bf89-411797fec356", isStaff: true, isAdmin: true, user: { id: "user-1" } },
  queries: [] as { queryKey: unknown[]; enabled?: boolean; queryFn: () => Promise<unknown> }[],
  results: {} as Record<string, unknown>,
  calls: [] as { table: string; op: string; filters: [string, unknown][]; value?: unknown }[],
  parent: null as Record<string, unknown> | null,
  error: null as null | { code: string },
  zeroUpdated: false,
  invalidate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useRouteContext: () => m.context, useParams: () => ({ id: "order-1" }) }),
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));
vi.mock("./route", () => ({}));
vi.mock("@/routes/_authenticated/route", () => ({ PILOT_STORE_ID: "cd677879-a4a7-4487-bf89-411797fec356" }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: (typeof m.queries)[number]) => {
    m.queries.push(options);
    return { data: m.results[String(options.queryKey[0])], isLoading: false };
  },
  useQueryClient: () => ({ invalidateQueries: m.invalidate }),
}));
vi.mock("@/components/orcaobra/delete-request", () => ({ DeleteRequestCard: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const rec: (typeof m.calls)[number] = { table, op: "", filters: [] };
  m.calls.push(rec);
  const q: Record<string, unknown> = {};
  for (const op of ["select", "insert", "update", "delete"]) q[op] = (value: unknown) => {
    if (!rec.op || op !== "select") { rec.op = op; rec.value = value; }
    return q;
  };
  for (const op of ["eq", "gte"]) q[op] = (key: string, value: unknown) => { rec.filters.push([key, value]); return q; };
  for (const op of ["order", "limit"]) q[op] = () => q;
  const result = () => ({ data: table === "quote_requests" ? m.parent : [], error: m.error, count: 2 });
  q["single"] = async () => m.zeroUpdated && rec.op === "update" ? { data: null, error: { code: "PGRST116" } } : result();
  q["then"] = (resolve: (value: unknown) => unknown) => resolve(result());
  return q;
} } }));

import { Route as Dashboard } from "@/routes/_authenticated/painel.index";
import { Route as Orders } from "@/routes/_authenticated/painel.pedidos.index";
import { Route as Detail } from "@/routes/_authenticated/painel.pedidos.$id";
import { Route as Rules } from "@/routes/_authenticated/painel.regras";
import { Route as Config } from "@/routes/_authenticated/painel.configuracoes";

const PILOT = "cd677879-a4a7-4487-bf89-411797fec356";
// Route factories are mocked, but actual page query functions and event handlers run.
function mount(route: unknown) {
  const { options } = route as { options: { component: React.ComponentType } };
  return render(React.createElement(options.component));
}
function query(key: string) {
  const option = m.queries.find((q) => q.queryKey[0] === key);
  if (!option) throw new Error(`Missing query ${key}`);
  return option;
}
const parent = () => ({ id: "order-1", store_id: PILOT, status: "recebido", customer_name: "Teste", customer_whatsapp: "21900000000", protocol: "OB-MOCK", original_text: "tinta", created_at: "2026-11-12T12:00:00Z", internal_notes: null, needs_followup_at: null, clarifications: [], ai_interpretation: null });

beforeEach(() => {
  cleanup(); m.queries.length = 0; m.calls.length = 0; m.results = {};
  m.context = { storeId: PILOT, isStaff: true, isAdmin: true, user: { id: "user-1" } };
  m.parent = parent(); m.error = null; m.zeroUpdated = false; m.invalidate.mockClear();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("panel store scoping with isolated database mocks", () => {
  it("scopes indicators and all three AI counts and cache keys to pilot", async () => {
    mount(Dashboard);
    await query("indicators").queryFn(); await query("ai-usage-today").queryFn();
    expect(m.calls).toHaveLength(4);
    for (const call of m.calls) expect(call.filters).toContainEqual(["store_id", PILOT]);
    expect(query("indicators").queryKey).toEqual(["indicators", PILOT]);
    expect(query("ai-usage-today").queryKey).toEqual(["ai-usage-today", PILOT]);
  });
  it("does not hide AI query errors as zero counts", async () => {
    mount(Dashboard); m.error = { code: "ERROR" };
    await expect(query("ai-usage-today").queryFn()).rejects.toEqual(m.error);
  });
  it("scopes order list and its ordered cache key", async () => {
    mount(Orders); await query("requests").queryFn();
    expect(m.calls[0]?.filters).toEqual([["store_id", PILOT]]);
    expect(query("requests").queryKey).toEqual(["requests", PILOT, "desc"]);
  });
  it("validates parent before reading any of four child tables", async () => {
    mount(Detail); await query("request").queryFn();
    expect(m.calls[0]).toMatchObject({ table: "quote_requests", filters: [["id", "order-1"], ["store_id", PILOT]] });
    expect(m.calls.slice(1).map((c) => c.table)).toEqual(["request_items", "suggested_complements", "status_history", "followups"]);
    for (const c of m.calls.slice(1)) expect(c.filters).toContainEqual(["request_id", "order-1"]);
    expect(query("request").queryKey).toEqual(["request", PILOT, "order-1"]);
  });
  for (const failure of ["missing", "other store", "read error"] as const) it(`${failure} parent prevents all child reads`, async () => {
    mount(Detail);
    if (failure === "missing") m.parent = null;
    if (failure === "other store") m.parent = { ...parent(), store_id: "another-store" };
    if (failure === "read error") m.error = { code: "ERROR" };
    await expect(query("request").queryFn()).rejects.toBeDefined();
    expect(m.calls).toHaveLength(1);
  });
  for (const route of [Dashboard, Orders, Detail, Rules, Config]) {
    for (const invalid of [undefined, "another-store"]) it("invalid store disables reads, mutations and manual refetch", async () => {
      m.context.storeId = invalid as string;
      const ui = mount(route);
      for (const option of m.queries) {
        expect(option.enabled).toBe(false);
        await expect(option.queryFn()).rejects.toThrow("Invalid store context");
      }
      for (const button of ui.queryAllByRole("button")) fireEvent.click(button);
      expect(m.calls).toHaveLength(0);
    });
  }
  it("seller cannot query or mutate rules or settings", () => {
    m.context.isAdmin = false;
    mount(Rules); mount(Config);
    expect(m.queries.every((q) => q.enabled === false)).toBe(true);
    expect(m.calls).toHaveLength(0);
  });
  it("non-staff cannot read any panel data", () => {
    m.context.isStaff = false;
    for (const route of [Dashboard, Orders, Detail, Rules, Config]) mount(route);
    expect(m.queries.every((q) => q.enabled === false)).toBe(true);
  });
  for (const action of ["status", "notes", "followup"] as const) it(`${action} scopes parent writes and invalidations`, async () => {
    m.results["request"] = { r: parent(), items: [], sugg: [], hist: [], fu: [] };
    const ui = mount(Detail);
    if (action === "status") {
      fireEvent.change(ui.getByRole("combobox", { name: "Novo status" }), { target: { value: "em_analise" } });
      fireEvent.click(ui.getByRole("button", { name: "Salvar status" }));
    } else fireEvent.click(ui.getByRole("button", { name: action === "notes" ? "Salvar" : "Registrar que acompanhei", exact: true }));
    await waitFor(() => expect(m.invalidate).toHaveBeenCalled());
    const updates = m.calls.filter((c) => c.table === "quote_requests" && c.op === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.filters).toEqual([["id", "order-1"], ["store_id", PILOT]]);
    if (action === "followup") expect(m.calls[0]?.op).toBe("select");
    for (const key of ["requests", "indicators", "test-count"]) expect(m.invalidate).toHaveBeenCalledWith({ queryKey: [key, PILOT] });
    expect(m.invalidate).toHaveBeenCalledWith({ queryKey: ["request", PILOT, "order-1"] });
  });
  it("failed parent update never inserts status history", async () => {
    m.results["request"] = { r: parent(), items: [], sugg: [], hist: [], fu: [] }; m.zeroUpdated = true;
    const ui = mount(Detail);
    fireEvent.change(ui.getByRole("combobox", { name: "Novo status" }), { target: { value: "em_analise" } });
    fireEvent.click(ui.getByRole("button", { name: "Salvar status" }));
    await waitFor(() => expect(m.calls).toHaveLength(1));
    expect(m.calls.some((c) => c.table === "status_history")).toBe(false);
    expect(m.invalidate).not.toHaveBeenCalled();
  });
  it("revalidation failure prevents followup insert", async () => {
    m.results["request"] = { r: parent(), items: [], sugg: [], hist: [], fu: [] };
    const ui = mount(Detail); m.parent = null;
    fireEvent.click(ui.getByRole("button", { name: "Registrar que acompanhei" }));
    await waitFor(() => expect(m.calls).toHaveLength(1));
    expect(m.calls[0]?.table).toBe("quote_requests"); expect(m.invalidate).not.toHaveBeenCalled();
  });
  it("admin test classification writes are scoped; seller has no switch", async () => {
    m.results["request"] = { r: parent(), items: [], sugg: [], hist: [], fu: [] };
    const ui = mount(Detail); fireEvent.click(ui.getByRole("switch", { name: "Marcar como teste" }));
    await waitFor(() => expect(m.invalidate).toHaveBeenCalled());
    expect(m.calls[0]).toMatchObject({ op: "update", value: expect.objectContaining({ is_test: true }), filters: [["id", "order-1"], ["store_id", PILOT]] });
    cleanup(); m.context.isAdmin = false;
    expect(mount(Detail).queryByRole("switch", { name: "Marcar como teste" })).toBeNull();
  });
  it("rule insert uses explicit pilot store, not form/default", async () => {
    const ui = mount(Rules); await query("rules").queryFn();
    expect(m.calls[0]?.filters).toContainEqual(["store_id", PILOT]);
    for (const placeholder of ["Produto ou atividade (gatilho)", "Complemento sugerido", "Explicação ao cliente"]) fireEvent.change(ui.getByPlaceholderText(placeholder), { target: { value: "mock" } });
    fireEvent.click(ui.getByRole("button", { name: "Adicionar (como rascunho)" }));
    await waitFor(() => expect(m.invalidate).toHaveBeenCalledWith({ queryKey: ["rules", PILOT] }));
    expect(m.calls.find((c) => c.op === "insert")?.value).toMatchObject({ store_id: PILOT });
  });
  for (const action of ["edit", "review", "delete"] as const) it(`rule ${action} is scoped`, async () => {
    m.results["rules"] = [{ id: "rule-1", category: "pisos", trigger: "mock", complement: "mock", explanation: "mock", reviewed: false, active: false }];
    const ui = mount(Rules);
    if (action === "edit") {
      fireEvent.click(ui.getByRole("button", { name: "Editar", exact: true }));
      fireEvent.click(ui.getByRole("button", { name: "Salvar alterações" }));
    } else fireEvent.click(ui.getByRole("button", { name: action === "review" ? "Marcar como revisada" : "Excluir", exact: true }));
    await waitFor(() => expect(m.calls).toHaveLength(1));
    expect(m.calls[0]?.filters).toEqual([["id", "rule-1"], ["store_id", PILOT]]);
    expect(m.calls[0]?.op).toBe(action === "delete" ? "delete" : "update");
  });
  it("settings remain global; test count and deletion require store AND test flag", async () => {
    m.results["test-count"] = 2;
    const ui = mount(Config);
    await query("settings").queryFn(); await query("test-count").queryFn();
    expect(m.calls[0]?.filters).toEqual([["id", 1]]);
    expect(m.calls[1]?.filters).toEqual([["store_id", PILOT], ["is_test", true]]);
    fireEvent.click(ui.getByRole("button", { name: "Excluir pedidos de teste" }));
    await waitFor(() => expect(m.invalidate).toHaveBeenCalled());
    expect(m.calls[2]).toMatchObject({ op: "delete", filters: [["store_id", PILOT], ["is_test", true]] });
    expect(query("test-count").queryKey).toEqual(["test-count", PILOT]);
    expect(m.invalidate.mock.calls.every(([arg]) => arg.queryKey[1] === PILOT)).toBe(true);
  });
});