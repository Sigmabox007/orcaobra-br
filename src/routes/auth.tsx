import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/orcaobra/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Painel OrçaObra" },
      { name: "description", content: "Acesso restrito à equipe da loja." },
      { property: "og:title", content: "Entrar — Painel OrçaObra" },
      { property: "og:description", content: "Acesso restrito à equipe da loja." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError("E-mail ou senha incorretos.");
    navigate({ to: "/painel" });
  }

  async function reset() {
    if (!email) return setError("Informe o e-mail para recuperar a senha.");
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    setResetSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary px-4">
      <form onSubmit={login} className="w-full max-w-sm space-y-5 rounded-2xl bg-card p-8 shadow-xl">
        <Logo className="text-xl text-primary" />
        <div>
          <h1 className="text-xl font-bold">Painel da loja</h1>
          <p className="text-sm text-muted-foreground">Acesso apenas para a equipe autorizada.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="senha">Senha</Label>
          <Input id="senha" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {resetSent && <p className="text-sm text-success">Se o e-mail estiver cadastrado, enviaremos um link.</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</Button>
        <button type="button" onClick={reset} className="w-full text-center text-xs text-muted-foreground underline">Esqueci minha senha</button>
      </form>
    </div>
  );
}
