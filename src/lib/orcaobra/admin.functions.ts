import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { protocolConfirmed } from "./rules";

// Local constant (same value as ai.server.ts): this module is client-reachable and must not
// statically import a *.server.ts module. Never taken from browser input.
export const PILOT_STORE_ID = "cd677879-a4a7-4487-bf89-411797fec356";

type DeleteResult = { ok: true } | { ok: false; error: string };

/**
 * Order of operations (fail closed):
 * 1. can_access_store(PILOT_STORE_ID, 'admin') with the caller's JWT; stop on denial/error
 *    before any quote_requests read.
 * 2. Read by id AND pilot store_id; query errors handled explicitly.
 * 3. Exact protocol check.
 * 4. Delete filtered by id, store_id and protocol. Children cascade.
 * Note: app-level checks do not fully close races with concurrent revocation; RLS transition is Etapa 5D.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runDeleteQuoteRequest(supabase: any, data: { id: string; protocol: string }): Promise<DeleteResult> {
  const { data: canAdmin, error: authError } = await supabase.rpc("can_access_store", {
    _store: PILOT_STORE_ID,
    _min_role: "admin",
  });
  if (authError || canAdmin !== true) return { ok: false, error: "Somente administradores podem excluir pedidos." };

  const { data: row, error: readError } = await supabase
    .from("quote_requests")
    .select("protocol")
    .eq("id", data.id)
    .eq("store_id", PILOT_STORE_ID)
    .maybeSingle();
  if (readError) {
    console.error("delete request read failed", readError.code ?? "unknown");
    return { ok: false, error: "Não foi possível excluir o pedido." };
  }
  if (!row) return { ok: false, error: "Pedido não encontrado." };
  if (!protocolConfirmed(data.protocol, row.protocol)) return { ok: false, error: "O protocolo digitado não confere." };

  const { error, count } = await supabase
    .from("quote_requests")
    .delete({ count: "exact" })
    .eq("id", data.id)
    .eq("store_id", PILOT_STORE_ID)
    .eq("protocol", row.protocol);
  if (error || count !== 1) {
    // Codes only: database details can echo customer fields.
    console.error("delete request failed", error?.code ?? `count:${count}`);
    return { ok: false, error: "Não foi possível excluir o pedido." };
  }
  return { ok: true };
}

export const deleteQuoteRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), protocol: z.string().max(40) }).parse(d))
  .handler(async ({ data, context }) => runDeleteQuoteRequest(context.supabase, data));
