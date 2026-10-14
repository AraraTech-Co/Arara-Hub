'use client'

// =============================================================================
// Atalhos de teclado da inbox (Fase 1, A2) — um mapa só, num lugar só.
//
// Por que um hook e não `onKeyDown` espalhado: atalho que vive em cada
// componente vira atalho duplicado, e duplicado vira conflito que só aparece
// quando alguém aperta a tecla na tela errada. Aqui o mapa é a documentação.
//
// A REGRA QUE NÃO PODE FALHAR: nenhum atalho dispara com o foco num campo de
// texto. Quem está escrevendo uma resposta ao cliente não pode ver a conversa
// trocar porque digitou um colchete.
//
// `Ctrl+Alt` como modificador é escolha do handoff, e é boa: `Ctrl` sozinho
// colide com o navegador em quase tudo.
// =============================================================================

import { useEffect } from 'react'

export interface AcoesDaInbox {
  /** Fecha o painel da conversa (Esc). */
  fechar: () => void
  /** Vai para a próxima conversa da lista FILTRADA (Ctrl+Alt+]). */
  proxima: () => void
  /** Vai para a anterior (Ctrl+Alt+[). */
  anterior: () => void
  /** Assume a conversa — o mesmo que o botão "Atender" (Ctrl+Alt+M). */
  atender: () => void
  /** Abre a busca dentro da conversa (Ctrl+F). */
  buscar: () => void
  /** Abre o diálogo de nova conversa (Ctrl+Alt+N) — Fase 2. */
  novaConversa: () => void
}

/** O mapa, também usado para desenhar a ajuda — uma fonte só. */
export const ATALHOS_DA_INBOX: { teclas: string; o_que_faz: string; disponivel: boolean }[] = [
  { teclas: 'Esc', o_que_faz: 'Fecha a conversa (o rascunho fica guardado)', disponivel: true },
  { teclas: 'Ctrl+Alt+]', o_que_faz: 'Próxima conversa da lista', disponivel: true },
  { teclas: 'Ctrl+Alt+[', o_que_faz: 'Conversa anterior', disponivel: true },
  { teclas: 'Ctrl+Alt+M', o_que_faz: 'Atender (assume a conversa aberta)', disponivel: true },
  { teclas: 'Ctrl+F', o_que_faz: 'Buscar dentro da conversa', disponivel: true },
  { teclas: 'Ctrl+Alt+N', o_que_faz: 'Nova conversa com um número', disponivel: true },
  // Continua na ajuda como "ainda não disponível", em vez de ficar de fora:
  // quem decora atalho precisa saber que ele existe no desenho e por que não
  // funciona. "Não lida" não existe no portal — depende de decisão do Leonardo.
  { teclas: 'Ctrl+Alt+U', o_que_faz: 'Marcar como não lida — ainda não disponível', disponivel: false },
]

/** O foco está num lugar onde a pessoa está ESCREVENDO? */
function escrevendo(alvo: EventTarget | null): boolean {
  const el = alvo as HTMLElement | null
  if (!el || !el.tagName) return false
  const tag = el.tagName.toLowerCase()
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
  if (el.isContentEditable) return true
  // Componentes de UI que são campo sem ser `input` (combobox, editor rico).
  const papel = el.getAttribute?.('role')
  return papel === 'textbox' || papel === 'combobox' || papel === 'searchbox'
}

export function useAtalhosInbox(acoes: AcoesDaInbox, ligado = true) {
  useEffect(() => {
    if (!ligado) return
    function aoTeclar(e: KeyboardEvent) {
      // Esc é o único que vale COM o foco num campo? Não: dentro do composer,
      // Esc já tem dono (fecha o seletor de emoji). Aqui ele só age fora de
      // campo de texto, como todo o resto.
      if (escrevendo(e.target)) return

      if (e.key === 'Escape') {
        acoes.fechar()
        return
      }
      if (e.ctrlKey && e.key.toLowerCase() === 'f' && !e.altKey) {
        // Substitui a busca do navegador DENTRO da inbox, que procuraria só no
        // que está renderizado e não acha o que ainda não rolou na tela.
        e.preventDefault()
        acoes.buscar()
        return
      }
      if (!e.ctrlKey || !e.altKey) return
      switch (e.key) {
        case ']':
          e.preventDefault(); acoes.proxima(); break
        case '[':
          e.preventDefault(); acoes.anterior(); break
        case 'm': case 'M':
          e.preventDefault(); acoes.atender(); break
        case 'n': case 'N':
          e.preventDefault(); acoes.novaConversa(); break
        // U não tem ação: ver ATALHOS_DA_INBOX.
        default:
          break
      }
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [acoes, ligado])
}
