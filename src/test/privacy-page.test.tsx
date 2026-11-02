import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/orcaobra/brand", () => ({ PublicShell: ({ children }: { children: ReactNode }) => <>{children}</> }));

import { Route } from "@/routes/privacidade";

describe("página de privacidade", () => {
  it("identifica a empresa responsável pelo CNPJ oficial", () => {
    const Page = Route.options.component!;
    render(<Page />);
    expect(screen.getAllByText(/07\.379\.352\/0001-49/).length).toBeGreaterThan(0);
  });

  it("aponta para o WhatsApp Business oficial da loja", () => {
    const Page = Route.options.component!;
    render(<Page />);
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("https://wa.me/5521973627697");
    expect(links.every((h) => !h?.startsWith("https://wa.me/") || h === "https://wa.me/5521973627697")).toBe(true);
  });

  it("informa a retenção de 12 meses após o encerramento", () => {
    const Page = Route.options.component!;
    render(<Page />);
    expect(screen.getByText(/até 12 meses após o encerramento do orçamento/)).toBeInTheDocument();
  });
});
