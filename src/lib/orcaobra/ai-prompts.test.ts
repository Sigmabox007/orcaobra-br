import { describe, expect, it } from "vitest";
import { maskContacts } from "./rules";
import { buildInterpretPrompt, buildSuggestPrompt } from "./ai-prompts";

describe("mascaramento de contatos antes da IA", () => {
  it.each([
    ["(21) 98765-4321"],
    ["21 98765-4321"],
    ["21987654321"],
    ["+55 21 98765-4321"],
    ["5521987654321"],
    ["021 98765-4321"],
    ["21 9 8765 4321"],
    ["2133334444"],
    ["(21) 3333-4444"],
    ["98765-4321"],
    ["987654321"],
    ["3333-4444"],
    ["+1 415 555 1234"],
  ])("remove o telefone %s", (phone) => {
    const out = maskContacts(`meu contato é ${phone}, obrigado`);
    expect(out).toBe("meu contato é [telefone removido], obrigado");
  });

  it("remove e-mails, inclusive com acentos", () => {
    expect(maskContacts("escreva para joão.silva+obra@exemplo.com.br")).toBe("escreva para [e-mail removido]");
  });

  it("remove CPF formatado", () => {
    expect(maskContacts("CPF 123.456.789-09")).toBe("CPF [documento removido]");
  });

  it("mantém a quantidade ao lado de um telefone", () => {
    expect(maskContacts("quantidade 10 21987654321")).toBe("quantidade 10 [telefone removido]");
  });

  it.each([
    ["Preciso de 20 m² de piso 60x60 para área externa"],
    ["porta 2,10 x 0,80 m"],
    ["medidas 1.20 x 2.10 m"],
    ["1.000.000 tijolos"],
    ["blocos 2000 3000"],
    ["tubo 100 mm 6 metros, 3 sacos de 50 kg"],
    ["código 12345678"],
    ["EAN 7891234567890"],
    ["CEP 20000-000"],
    ["R$ 1.500,00"],
  ])("preserva medidas, quantidades e códigos: %s", (text) => {
    expect(maskContacts(text)).toBe(text);
  });
});

describe("conteúdo enviado à IA", () => {
  const order = "Quero 2 latas de tinta branca. Meu zap 21 98765-4321, e-mail ana@ex.com";

  it("análise recebe o pedido mascarado, nunca o telefone ou e-mail", () => {
    const prompt = buildInterpretPrompt(order);
    expect(prompt).toContain("Quero 2 latas de tinta branca.");
    expect(prompt).not.toContain("98765");
    expect(prompt).not.toContain("ana@ex.com");
  });

  it("sugestões mascaram pedido e respostas", () => {
    const prompt = buildSuggestPrompt(order, [{ question: "Cor?", answer: "branca, me chama no (21) 3333-4444" }], [
      { id: "r1", trigger: "tinta", complement: "fita crepe", condition: null },
    ]);
    expect(prompt).toContain("fita crepe");
    expect(prompt).not.toContain("98765");
    expect(prompt).not.toContain("3333-4444");
    expect(prompt).not.toContain("ana@ex.com");
  });
});
