import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display font-bold tracking-tight ${className}`}>
      <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-highlight text-highlight-foreground">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21h18M5 21V10l7-5 7 5v11M9 21v-6h6v6" />
        </svg>
      </span>
      <span>
        Orça<span className="text-highlight">Obra</span>
      </span>
    </span>
  );
}

export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-4">
          <Link to="/" aria-label="OrçaObra, início">
            <Logo className="text-lg" />
          </Link>
          <span className="text-xs opacity-80">A.S. Figueiredo Materiais de Construção</span>
        </div>
        <div className="brand-stripe h-1.5" aria-hidden />
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        <Link to="/privacidade" className="underline underline-offset-2">
          Privacidade
        </Link>{" "}
        · OrçaObra — orçamentos mais completos com ajuda da inteligência artificial
      </footer>
    </div>
  );
}
