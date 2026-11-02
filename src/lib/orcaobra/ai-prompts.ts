// Pure builders for the exact text sent to the AI. Keep free of I/O.
// They never receive the contact fields (name, WhatsApp, notes): only the order text and clarification answers.
import { maskContacts, MAX_QUESTIONS } from "./rules";

export type PromptRule = { id: string; trigger: string; complement: string; condition: string | null };

export function buildInterpretPrompt(text: string): string {
  return `Analise o pedido e retorne JSON com: category (pisos, sanitarios, pintura ou outro), activity (atividade em poucas palavras), items (produtos mencionados e a quantidade exatamente como o cliente informou, ou "" se não informada), missing_info (informações relevantes ausentes) e questions (no máximo ${MAX_QUESTIONS} perguntas curtas e pertinentes; vazio se não precisar).\n<pedido_cliente>\n${maskContacts(text)}\n</pedido_cliente>`;
}

export function buildSuggestPrompt(text: string, answers: { question: string; answer: string }[], rules: PromptRule[]): string {
  const qa = answers.map((a) => `- ${maskContacts(a.question)}: ${maskContacts(a.answer)}`).join("\n");
  const catalog = rules.map((r) => `${r.id} | gatilho: ${r.trigger} | complemento: ${r.complement} | condição: ${r.condition ?? "-"}`).join("\n");
  return `Escolha, SOMENTE da lista de regras abaixo, até 5 complementos realmente pertinentes ao pedido. Não inclua itens que o cliente já pediu. Para cada um, dê rule_id exato e um motivo curto (uma frase, sem preço, sem garantir compatibilidade). Se nenhum for pertinente, retorne lista vazia.\nREGRAS:\n${catalog}\n<pedido_cliente>\n${maskContacts(text)}\n</pedido_cliente>\n<respostas_cliente>\n${qa || "(sem respostas)"}\n</respostas_cliente>`;
}
