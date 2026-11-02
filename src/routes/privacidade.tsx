import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PublicShell } from "@/components/orcaobra/brand";
import { Button } from "@/components/ui/button";

const STORE = "A.S. Figueiredo Materiais de Construção LTDA";
const CNPJ = "07.379.352/0001-49";
const WHATSAPP = "(21) 97362-7697";
const WHATSAPP_URL = "https://wa.me/5521973627697";
const UPDATED = "1º de novembro de 2026";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — OrçaObra | A.S. Figueiredo" },
      { name: "description", content: "Como a A.S. Figueiredo trata os dados dos pedidos de orçamento feitos pelo OrçaObra: dados coletados, IA, prazos e seus direitos." },
      { property: "og:title", content: "Política de Privacidade — OrçaObra" },
      { property: "og:description", content: "Quais dados usamos nos pedidos de orçamento, como a IA participa, por quanto tempo guardamos e como exercer seus direitos." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Privacidade,
});

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-primary">{title}</h2>
      {children}
    </section>
  );
}

function Privacidade() {
  return (
    <PublicShell>
      <article className="space-y-7 text-sm leading-relaxed">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold text-primary">Política de Privacidade</h1>
          <p className="text-muted-foreground">Última atualização: {UPDATED}</p>
          <p>
            Esta página explica, em linguagem simples, como tratamos os dados informados no OrçaObra, o assistente de pedidos de orçamento da
            A.S. Figueiredo, em atenção à Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018).
          </p>
        </header>

        <Section title="1. Quem é responsável pelos seus dados">
          <p>
            <strong>{STORE}</strong>, CNPJ {CNPJ}, é a responsável (controladora) pelos dados dos pedidos de orçamento.
          </p>
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <p>
              Canal oficial para atendimento, dúvidas sobre privacidade e pedidos relacionados aos seus dados: WhatsApp Business{" "}
              <strong>{WHATSAPP}</strong>.
            </p>
            <Button asChild>
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">Falar com a loja no WhatsApp</a>
            </Button>
          </div>
        </Section>

        <Section title="2. Quais dados coletamos">
          <p>Quando você faz um pedido de orçamento:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>nome e número de WhatsApp;</li>
            <li>a descrição do pedido, do jeito que você escreveu;</li>
            <li>as respostas às perguntas de detalhamento;</li>
            <li>os produtos e quantidades que você confirmou e os itens complementares que escolheu;</li>
            <li>as observações que você quiser incluir;</li>
            <li>a data e a hora do envio e da sua autorização de contato.</li>
          </ul>
          <p>Durante o atendimento, a equipe da loja registra o andamento do pedido (situação, histórico, anotações internas e retornos feitos).</p>
          <p>
            Para segurança e prevenção de abusos, guardamos também registros técnicos: um código gerado a partir do endereço de internet (IP) e
            do tipo de navegador — o IP em si não é armazenado —, um identificador aleatório da visita e a data e o resultado de cada uso do
            assistente. Esses registros não incluem nome, telefone nem o texto do pedido, mas podem ser considerados dados pessoais.
          </p>
          <p>
            No seu navegador, a página guarda apenas, durante a visita, um identificador aleatório e o número do protocolo, apagados quando a aba
            é fechada. Não usamos cookies de publicidade nem ferramentas de rastreamento para anúncios.
          </p>
        </Section>

        <Section title="3. Para que usamos">
          <ul className="list-disc space-y-1 pl-5">
            <li>analisar e organizar o seu pedido;</li>
            <li>preparar o orçamento solicitado;</li>
            <li>falar com você pelo WhatsApp sobre esse orçamento e acompanhar o atendimento;</li>
            <li>proteger o serviço contra abusos e uso automatizado.</li>
          </ul>
          <p>
            Não usamos seus dados para propaganda nem os vendemos. Qualquer outro uso exigiria uma finalidade própria e uma base legal adequada,
            e seria informado a você antes.
          </p>
        </Section>

        <Section title="4. Bases legais">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Pedido de orçamento e contato pelo WhatsApp:</strong> procedimentos preliminares a um possível contrato, feitos a seu pedido
              (art. 7º, V, da LGPD).
            </li>
            <li>
              <strong>Registros técnicos de segurança e limites de uso:</strong> legítimo interesse da loja em manter o serviço seguro (art. 7º,
              IX), com o mínimo de dados necessário.
            </li>
            <li>
              <strong>Guarda além do prazo, quando exigida:</strong> cumprimento de obrigação legal ou regulatória e exercício regular de direitos
              (art. 7º, II e VI).
            </li>
          </ul>
          <p>
            A caixa “Autorizo a A.S. Figueiredo a entrar em contato pelo WhatsApp…” confirma que você quer ser contatado nesse número sobre este
            orçamento. Ela não é uma autorização geral para outros usos, como mensagens promocionais.
          </p>
        </Section>

        <Section title="5. Como a inteligência artificial participa">
          <p>
            Para organizar o pedido e sugerir itens complementares, a <strong>descrição do pedido</strong> e as <strong>respostas às perguntas</strong>{" "}
            são enviadas a um serviço de inteligência artificial.
          </p>
          <p>
            <strong>Não são enviados à IA:</strong> o nome, o número de WhatsApp e as observações preenchidos nos campos de contato.
          </p>
          <p>
            Antes do envio, telefones, e-mails e CPFs escritos na descrição ou nas respostas são substituídos automaticamente por um aviso. Esse
            filtro automático pode não reconhecer todos os formatos, e outras informações que você escrever — como nomes ou endereços — são
            enviadas como estão. Por isso, evite colocar dados pessoais na descrição. A loja guarda o texto original completo, com acesso restrito,
            para preparar o orçamento.
          </p>
          <p>
            A IA não define preço, estoque, prazo nem compatibilidade, e não toma decisões sobre você. As sugestões vêm de uma lista revisada pela
            loja, são opcionais e só entram no pedido se você escolher. Todo pedido é conferido por uma pessoa da equipe.
          </p>
        </Section>

        <Section title="6. Fornecedores, hospedagem e transferência internacional">
          <p>Para funcionar, o OrçaObra usa fornecedores de tecnologia que tratam dados em nome da loja:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Plataforma Lovable</strong>: hospedagem do site e banco de dados (Lovable Cloud), com servidores nos Estados Unidos. A
              hospedagem pode registrar dados técnicos de acesso, como IP e navegador, para funcionamento e segurança.
            </li>
            <li>
              <strong>Lovable AI Gateway e OpenAI</strong>: processamento das análises de IA descritas acima, fora do Brasil.
            </li>
            <li>
              <strong>Google Fonts</strong>: as fontes de texto do site são carregadas dos servidores do Google, que recebem o IP e dados do
              navegador de quem visita a página.
            </li>
            <li>
              <strong>WhatsApp (Meta)</strong>: usado pela loja para conversar com você sobre o orçamento.
            </li>
          </ul>
          <p>
            Por isso, há transferência internacional de dados, realizada para atender ao pedido que você fez, nas hipóteses do art. 33 da LGPD.
            Não compartilhamos seus dados com outras empresas, salvo quando exigido por lei ou por autoridade competente.
          </p>
        </Section>

        <Section title="7. Quem tem acesso">
          <p>
            Apenas funcionários autorizados da loja, com login individual. As permissões são verificadas no próprio sistema, e algumas ações são
            restritas a administradores. Visitantes do site não têm acesso aos pedidos de outras pessoas, e o protocolo não permite consultar
            pedidos.
          </p>
        </Section>

        <Section title="8. Por quanto tempo guardamos">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Pedidos em aberto:</strong> enquanto o orçamento estiver em atendimento.
            </li>
            <li>
              <strong>Pedidos encerrados</strong> (convertidos em venda ou encerrados sem venda): até 12 meses após o encerramento do orçamento,
              exceto quando obrigações legais exigirem guarda por mais tempo.
            </li>
            <li>
              <strong>Registros técnicos de segurança:</strong> somente pelo tempo necessário à prevenção de abusos.
            </li>
          </ul>
          <p>
            A exclusão é feita pela loja em revisões periódicas, não de forma automática. Dados de uma venda realizada (como documentos fiscais)
            seguem regras próprias, fora do OrçaObra.
          </p>
        </Section>

        <Section title="9. Seus direitos">
          <p>Conforme a LGPD, quando aplicável, você pode pedir:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>confirmação de que tratamos seus dados e acesso a eles;</li>
            <li>correção de dados incompletos, inexatos ou desatualizados;</li>
            <li>anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desacordo com a lei;</li>
            <li>portabilidade, nos termos da regulamentação;</li>
            <li>informação sobre com quem compartilhamos seus dados;</li>
            <li>oposição a um tratamento que considere irregular;</li>
            <li>eliminação dos dados, observadas as hipóteses legais de guarda.</li>
          </ul>
          <p>
            <strong>Como pedir:</strong> envie uma mensagem para o WhatsApp Business{" "}
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
              {WHATSAPP}
            </a>{" "}
            informando o que deseja e, se tiver, o número do protocolo. Para proteger seus dados, podemos confirmar sua identidade, por exemplo
            pelo número usado no pedido. Responderemos dentro dos prazos da LGPD. Você também pode apresentar reclamação à Autoridade Nacional de
            Proteção de Dados (ANPD).
          </p>
        </Section>

        <Section title="10. Segurança">
          <p>
            Usamos conexão criptografada, acesso com login, permissões por função e limites contra uso abusivo. Nenhum sistema é totalmente
            imune a falhas; se ocorrer um incidente relevante, adotaremos as medidas previstas na LGPD.
          </p>
        </Section>

        <Section title="11. Alterações desta política">
          <p>Quando esta política mudar, a nova versão será publicada nesta página com a data de atualização.</p>
        </Section>
      </article>
    </PublicShell>
  );
}
