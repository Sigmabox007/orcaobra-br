import { STATUS_LABEL, type Status } from "@/lib/orcaobra/rules";

const TONE: Record<Status, string> = {
  recebido: "bg-highlight text-highlight-foreground",
  esclarecimento: "bg-warning text-foreground",
  preparacao: "bg-secondary text-secondary-foreground",
  orcamento_enviado: "bg-primary text-primary-foreground",
  aguardando_retorno: "bg-accent text-accent-foreground",
  convertido: "bg-success text-success-foreground",
  perdido: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function TestBadge() {
  return <span className="rounded bg-destructive px-1.5 py-0.5 text-[10px] font-bold uppercase text-destructive-foreground">Teste</span>;
}
