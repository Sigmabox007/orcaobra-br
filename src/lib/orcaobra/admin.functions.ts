import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { protocolConfirmed } from "./rules";

/**
 * Permanently deletes one order. Admin-only: re-checked here and enforced again by the
 * "admin delete requests" RLS policy. Items, complements, status history and follow-ups
 * are removed by ON DELETE CASCADE. Runs as the caller (no service role).
 */
export const deleteQuoteRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), protocol: z.string().max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (roleError || !isAdmin) return { ok: false as const, error: "Somente administradores podem excluir pedidos." };

    const { data: row } = await supabase.from("quote_requests").select("protocol").eq("id", data.id).maybeSingle();
    if (!row) return { ok: false as const, error: "Pedido não encontrado." };
    if (!protocolConfirmed(data.protocol, row.protocol)) return { ok: false as const, error: "O protocolo digitado não confere." };

    const { error, count } = await supabase
      .from("quote_requests")
      .delete({ count: "exact" })
      .eq("id", data.id)
      .eq("protocol", row.protocol);
    if (error || count !== 1) {
      // Codes only: database details can echo customer fields.
      console.error("delete request failed", error?.code ?? `count:${count}`);
      return { ok: false as const, error: "Não foi possível excluir o pedido." };
    }
    return { ok: true as const };
  });
