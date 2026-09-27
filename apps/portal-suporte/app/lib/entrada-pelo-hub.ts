/**
 * A porta única de entrada.
 *
 * A direção acordada é que se entre no ecossistema **pelo Hub**, e não por cada
 * app: é lá que ficam o login e a recuperação de senha por WhatsApp, e é de lá
 * que a pessoa é repassada para o portal (`/sso`).
 *
 * Isto vem DESLIGADO. Ligar antes da hora tranca todo mundo do lado de fora, já
 * que a porta que sobraria é justamente a que se está fechando — e o repasse
 * Hub → portal precisa rodar alguns dias com a equipe usando de verdade antes
 * de a gente confiar nele como caminho único.
 *
 * Para ligar: `NEXT_PUBLIC_ENTRADA_PELO_HUB=1` no `.env.local` e um deploy.
 * Para destrancar em emergência, sem deploy: abrir `/auth/login/?direto=1`.
 * Esse escape existe de propósito — se o Hub cair, ninguém fica de fora do
 * portal por causa de uma decisão de arquitetura.
 */

export const HUB_URL = 'https://hub.arara-tech.com'

export function entradaPeloHub(): boolean {
  return process.env.NEXT_PUBLIC_ENTRADA_PELO_HUB === '1'
}

/**
 * Para onde mandar quem chegou ao login do portal, ou `null` para deixar o
 * formulário local aparecer.
 *
 * `destino` volta como `next` para o Hub devolver a pessoa onde ela queria
 * chegar, e não numa tela genérica.
 */
export function destinoDaEntrada(busca: string, destino?: string | null): string | null {
  if (!entradaPeloHub()) return null
  // Escape manual: quem digitou ?direto=1 quer o formulário do portal.
  if (new URLSearchParams(busca).get('direto') === '1') return null
  const alvo = destino && destino.startsWith('/') ? destino : null
  return alvo ? `${HUB_URL}/?next=${encodeURIComponent(alvo)}` : HUB_URL
}
