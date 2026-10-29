import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Definir senha — OrçaObra" },
      { name: "description", content: "Defina sua senha de acesso ao painel." },
      { property: "og:title", content: "Definir senha — OrçaObra" },
      { property: "og:description", content: "Defina sua senha de acesso ao painel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPage,
});

function ResetPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return setMsg("Use pelo menos 8 caracteres.");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return setMsg("Não foi possível salvar. Abra novamente o link do e-mail.");
    navigate({ to: "/painel" });
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-primary px-4">
      <form onSubmit={save} className="w-full max-w-sm space-y-4 rounded-2xl bg-card p-8">
        <h1 className="text-xl font-bold">Definir nova senha</h1>
        <div className="space-y-1.5">
          <Label htmlFor="np">Nova senha</Label>
          <Input id="np" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {msg && <p className="text-sm text-destructive">{msg}</p>}
        <Button type="submit" className="w-full">Salvar</Button>
      </form>
    </div>
  );
}
