// =============================================================================
// Para onde um aviso leva — e se dá para ir sem recarregar o portal.
//
// Módulo sem nenhuma dependência de propósito: esta decisão é a que separa
// "abre em 100 ms" de "recarrega o portal inteiro e perde o marcar-como-lida",
// e precisa poder ser conferida fora do navegador.
// =============================================================================

export type AvisoComDestino = { href?: string | null; sourceApp?: string | null }

/**
 * Para onde o aviso leva, e se dá para ir sem recarregar o portal.
 *
 * `href` é URL ABSOLUTA e pode apontar para outro portal da Arara. Quando o
 * destino é este portal, o certo é navegar pelo roteador: recarregar a página
 * inteira custa segundos e — pior — CANCELA o "marcar como lida" que acabou de
 * sair, fazendo o aviso voltar não lido. Era o defeito relatado em 26/08.
 *
 * `origem` entra por parâmetro (e não `window.location`) para esta decisão
 * poder ser conferida fora do navegador.
 */
export function destinoDe(n: AvisoComDestino, origem: string): { interno: boolean; url: string } {
  const href = String(n.href || '').trim()
  if (!href) return { interno: false, url: '' }

  // `sourceApp` decide antes da origem: o portal é servido tanto pelo domínio
  // quanto pelo IP da hospedagem, e comparar origem sozinha erraria no IP.
  const doPortal = !n.sourceApp || n.sourceApp === 'portal-suporte'

  if (!doPortal) {
    // Aviso de outro portal só é seguro seguir se vier com URL ABSOLUTA. Um
    // caminho relativo de outro app resolvido contra a NOSSA origem levaria a
    // uma página que não existe aqui — melhor não navegar do que navegar para
    // o lugar errado.
    try {
      const u = new URL(href)
      return u.origin === origem
        ? { interno: true, url: u.pathname + u.search + u.hash }
        : { interno: false, url: u.href }
    } catch {
      return { interno: false, url: '' }
    }
  }

  try {
    const u = new URL(href, origem)
    return { interno: true, url: u.pathname + u.search + u.hash }
  } catch {
    return { interno: href.startsWith('/'), url: href }
  }
}
