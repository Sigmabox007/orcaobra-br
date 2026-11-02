import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteQuoteRequest } from "@/lib/orcaobra/admin.functions";
import { protocolConfirmed, type Status } from "@/lib/orcaobra/rules";

export function DeleteRequestCard({ id, protocol, status }: { id: string; protocol: string; status: Status }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const del = useServerFn(deleteQuoteRequest);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const ok = protocolConfirmed(typed, protocol);

  async function confirmDelete() {
    if (!ok || busy) return;
    setBusy(true);
    try {
      const r = await del({ data: { id, protocol: typed } });
      if (!r.ok) return void toast.error(r.error);
      setOpen(false);
      qc.removeQueries({ queryKey: ["request", id] });
      qc.invalidateQueries({ queryKey: ["requests"] });
      qc.invalidateQueries({ queryKey: ["indicators"] });
      qc.invalidateQueries({ queryKey: ["test-count"] });
      toast.success(`Dados do pedido ${protocol} excluídos.`);
      navigate({ to: "/painel/pedidos", replace: true });
    } catch {
      toast.error("Não foi possível excluir o pedido.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-destructive/40 bg-card p-4">
      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Exclusão de dados</h2>
      <p className="text-xs text-muted-foreground">Use para pedidos com prazo de guarda vencido ou a pedido do cliente.</p>
      <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setTyped(""); }}>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="mt-2 w-full">Excluir dados deste pedido</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir dados do pedido {protocol}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p><strong>Esta ação é irreversível.</strong> Serão apagados definitivamente o pedido e os dados do cliente, os itens, os complementos sugeridos, o histórico de status, os acompanhamentos e as anotações internas.</p>
                <p>Antes de excluir, verifique se a loja precisa guardar estes dados por obrigação legal{status === "convertido" ? " — este pedido foi convertido em venda, então confira com cuidado" : ", especialmente em pedidos convertidos em venda"}.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div>
            <Label htmlFor="confirm-protocol" className="text-xs">Para confirmar, digite o protocolo <span className="font-mono">{protocol}</span></Label>
            <Input id="confirm-protocol" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-1 font-mono" />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" disabled={!ok || busy} onClick={confirmDelete}>{busy ? "Excluindo…" : "Excluir definitivamente"}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
