import { createFileRoute, Link, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/orcaobra/brand";
import { Button } from "@/components/ui/button";

// Local constant: browser route must not import *.server.ts modules.
export const PILOT_STORE_ID = "cd677879-a4a7-4487-bf89-411797fec356";

type AccessRpc = (
  fn: "can_access_store",
  args: { _store: string; _min_role: "seller" | "admin" },
) => PromiseLike<{ data: boolean | null; error: unknown }>;

/** Fail-closed panel access from store_members via can_access_store; no user_roles fallback. */
export async function resolvePanelAccess(rpc: AccessRpc) {
  const [accessRes, adminRes] = await Promise.all([
    rpc("can_access_store", { _store: PILOT_STORE_ID, _min_role: "seller" }),
    rpc("can_access_store", { _store: PILOT_STORE_ID, _min_role: "admin" }),
  ]);
  const isStaff = !accessRes.error && accessRes.data === true;
  const isAdmin = isStaff && !adminRes.error && adminRes.data === true;
  return { isStaff, isAdmin, storeId: PILOT_STORE_ID };
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const access = await resolvePanelAccess((fn, args) => supabase.rpc(fn, args));
    return { user: data.user, isAdmin: access.isAdmin, isStaff: access.isStaff, storeId: access.storeId };
  },
  component: AdminLayout,
});

function AdminLayout() {
  const { user, isStaff, isAdmin } = Route.useRouteContext();
  const qc = useQueryClient();
  const navigate = useNavigate();
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  if (!isStaff) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 text-center">
        <div className="space-y-3">
          <h1 className="text-xl font-bold">Sem permissão</h1>
          <p className="text-sm text-muted-foreground">Sua conta ({user.email}) não tem acesso ao painel. Fale com a proprietária da loja.</p>
          <Button variant="outline" onClick={signOut}>Sair</Button>
        </div>
      </div>
    );
  }
  const nav = [
    { to: "/painel", label: "Início" },
    { to: "/painel/pedidos", label: "Pedidos" },
    ...(isAdmin ? [{ to: "/painel/regras", label: "Complementos" }, { to: "/painel/configuracoes", label: "Configurações" }] : []),
  ] as const;
  return (
    <div className="min-h-screen">
      <header className="bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Logo />
          <nav className="flex flex-1 flex-wrap gap-1 text-sm">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                activeOptions={{ exact: n.to === "/painel" }}
                className="rounded-md px-3 py-1.5 opacity-80 hover:opacity-100"
                activeProps={{ className: "bg-sidebar-accent opacity-100 font-semibold" }}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <span className="hidden text-xs opacity-70 sm:inline">{user.email}</span>
          <Button size="sm" variant="secondary" onClick={signOut}>Sair</Button>
        </div>
        <div className="brand-stripe h-1" aria-hidden />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
