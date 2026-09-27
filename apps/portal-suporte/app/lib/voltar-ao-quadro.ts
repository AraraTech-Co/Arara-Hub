// =============================================================================
// Voltar ao quadro sem perder os filtros.
//
// O Kanban escreve os filtros na URL (`?agent=&priority=&q=…`) com `replace` a
// cada mudança, e lê de volta na montagem. Então voltar PELO HISTÓRICO devolve
// a pessoa ao quadro exatamente como ela o deixou.
//
// Um `<Link href="/admin/kanban">` fixo, ao contrário, joga a query fora — foi
// o que fazia os filtros sumirem ao abrir um chamado e voltar (relatado em
// 27/08). A regra mora aqui, e não copiada em cada botão, porque já havia dois
// botões de voltar na mesma página discordando entre si.
// =============================================================================

/**
 * Barra final proposital: sem ela a rota remonta e o quadro recarrega os
 * chamados do zero (mesmo motivo comentado em `kanban-board.tsx`).
 */
export const ROTA_QUADRO = '/admin/kanban/'

type Navegador = { back: () => void; push: (href: string) => void }

/**
 * Volta ao quadro preservando os filtros quando há para onde voltar.
 *
 * Quem chega ao chamado por link direto — um aviso do sino, uma mensagem no
 * WhatsApp — não tem histórico anterior; nesse caso vai para o quadro limpo,
 * que é o certo: não existe estado anterior para preservar.
 */
export function voltarAoQuadro(router: Navegador) {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back()
    return
  }
  router.push(ROTA_QUADRO)
}
