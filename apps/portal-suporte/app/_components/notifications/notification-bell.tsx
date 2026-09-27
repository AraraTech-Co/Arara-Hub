'use client'

// =============================================================================
// Sino de avisos, na barra lateral.
//
// Reescrito sobre o inbox da plataforma (`/v1/notifications`) — o original,
// de julho, lia de `/api/notifications`, rota do backend em Prisma que morreu
// na migração. Ele também estava pendurado num cabeçalho que deixou de ser
// renderizado; por isso ninguém percebeu que o aviso tinha parado.
//
// Mora na barra lateral junto do resto da navegação, e não num cabeçalho de
// página: a barra é a única casca presente em toda tela do portal.
//
// Quem GERA os avisos é o servidor, via `ctx.notify` nos controllers de
// atribuição e escalonamento (scripts/notificacoes-servidor.py). Aviso criado
// pelo navegador de quem atribui não chega quando a pessoa fecha a aba antes
// de a requisição sair.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck, Loader2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { naoLida, notificacoesApi, type Notificacao } from '@/lib/api/notificacoes'
import { destinoDe } from '@/lib/notificacoes-destino'
import { prepararSom, tocarChamada } from '@/lib/wa-som'

const INTERVALO_MS = 60_000

// Duas grandezas diferentes, e antes eram a mesma: a lista mostra os avisos
// RECENTES, o número conta os NÃO LIDOS. Buscando só 15, quem tivesse 20 não
// lidos via "15" para sempre — o número travava e nunca zerava.
//
// A plataforma não expõe contagem nem filtro de não lidos (conferido no
// /readme em 26/08), então a contagem sai da própria lista. Buscamos 100
// porque o número já é exibido como "99+" a partir daí: contar além disso não
// mudaria um pixel na tela.
const QUANTOS_MOSTRAR = 15
const QUANTOS_CONTAR = 100

function tempoRelativo(iso: string): string {
  const minutos = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutos < 1) return 'agora'
  if (minutos < 60) return `há ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `há ${horas}h`
  return `há ${Math.floor(horas / 24)}d`
}

const COR: Record<string, string> = {
  critical: 'bg-sem-error-fg',
  warning: 'bg-sem-warning-fg',
  success: 'bg-sem-success-fg',
  info: 'bg-indigo-500',
}

export function NotificationBell({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter()
  const [itens, setItens] = useState<Notificacao[]>([])
  const [aberto, setAberto] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [totalNaoLidas, setTotalNaoLidas] = useState(0)

  // Última contagem vista, para tocar só quando o número SOBE. Contar
  // "existem não lidas" tocaria a cada 60 s enquanto ninguém abrisse o sino.
  const naoLidasAntes = useRef<number | null>(null)

  // Avisos que ESTA aba já marcou como lidos. Abrir o sino recarrega do
  // servidor, e sem esta lembrança uma leitura ainda não processada lá voltaria
  // como não lida — o número piscaria de volta bem na frente de quem acabou de
  // clicar. O id sai daqui assim que o servidor confirma.
  const lidasAqui = useRef<Set<string>>(new Set())

  const carregar = useCallback(async () => {
    try {
      const bruta = await notificacoesApi.listar(QUANTOS_CONTAR)
      const lista = bruta.map((n) => {
        if (n.readAt) { lidasAqui.current.delete(n.id); return n }
        return lidasAqui.current.has(n.id) ? { ...n, readAt: new Date().toISOString() } : n
      })
      const pendentes = lista.filter(naoLida).length
      // A primeira leitura nunca toca: seria um sino a cada troca de página.
      if (naoLidasAntes.current !== null && pendentes > naoLidasAntes.current) {
        void tocarChamada()
      }
      naoLidasAntes.current = pendentes
      setItens(lista)
      // A lista inteira fica no estado: o número conta sobre ela, e a gaveta
      // corta na hora de desenhar.
      setTotalNaoLidas(pendentes)
    } catch {
      /* sem sessão ou rede instável: o sino apenas fica quieto */
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    prepararSom()
    void carregar()
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void carregar()
    }, INTERVALO_MS)
    return () => clearInterval(timer)
  }, [carregar])

  // O número vem da contagem completa; a gaveta mostra só os mais recentes.
  const naoLidas = totalNaoLidas
  const visiveis = itens.slice(0, QUANTOS_MOSTRAR)

  async function abrir(n: Notificacao) {
    // Marca lida na hora: o número precisa cair no clique, não em 60 s.
    lidasAqui.current.add(n.id)
    setItens((atual) => atual.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)))
    if (naoLida(n)) setTotalNaoLidas((t) => Math.max(0, t - 1))
    setAberto(false)

    // Se o servidor recusar, recarregamos a lista para a tela contar a verdade
    // em vez de mostrar um número inventado.
    const marcar = notificacoesApi.marcarLida(n.id).catch(() => {
      // Recusa do servidor: esquece a marca local e recarrega, para a tela
      // contar a verdade em vez de mostrar um número inventado.
      lidasAqui.current.delete(n.id)
      void carregar()
    })

    const destino = destinoDe(n, window.location.origin)
    if (!destino.url) {
      await marcar
      return
    }
    if (destino.interno) {
      // Sem recarregar: a sessão, o estado e o próprio sino continuam de pé.
      router.push(destino.url)
      return
    }
    // Outro portal: aí a navegação é dura mesmo. Espera o "lida" chegar antes
    // de sair — `keepalive` cobre, mas esperar é a garantia.
    await marcar
    window.location.assign(destino.url)
  }

  async function marcarTodas() {
    const agora = new Date().toISOString()
    for (const x of itens) if (!x.readAt) lidasAqui.current.add(x.id)
    setItens((atual) => atual.map((x) => ({ ...x, readAt: x.readAt ?? agora })))
    setTotalNaoLidas(0)
    void notificacoesApi.marcarTodasLidas().catch(() => {
      lidasAqui.current.clear()
      void carregar()
    })
  }

  return (
    <DropdownMenu open={aberto} onOpenChange={(v) => { setAberto(v); if (v) void carregar() }}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title={naoLidas ? `${naoLidas} aviso${naoLidas > 1 ? 's' : ''} não lido${naoLidas > 1 ? 's' : ''}` : 'Avisos'}
          className={cn(
            'relative flex items-center rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-white',
            collapsed ? 'w-full justify-center py-2' : 'w-full gap-3 px-3 py-2',
          )}
        >
          <span className="relative shrink-0">
            <Bell className="h-[17px] w-[17px]" />
            {naoLidas > 0 && (
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-sem-error-fg" />
            )}
          </span>
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Avisos</span>
              {naoLidas > 0 && (
                <span className="min-w-[1.25rem] rounded-full bg-indigo-600 px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums text-white">
                  {naoLidas > 99 ? '99+' : naoLidas}
                </span>
              )}
            </>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" side="right" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Avisos</span>
          {naoLidas > 0 && (
            <button
              type="button"
              onClick={() => void marcarTodas()}
              className="flex items-center gap-1 text-xs font-normal text-primary hover:underline"
            >
              <CheckCheck className="h-3 w-3" />
              Marcar todas como lidas
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {carregando && itens.length === 0 ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : visiveis.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhum aviso por aqui.</p>
        ) : (
          <div className="max-h-[360px] overflow-y-auto">
            {visiveis.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => void abrir(n)}
                className={cn(
                  'flex w-full gap-2.5 border-b border-border/60 px-3 py-2.5 text-left last:border-0 hover:bg-muted/60',
                  naoLida(n) && 'bg-muted/40',
                )}
              >
                <span
                  className={cn(
                    'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                    naoLida(n) ? (COR[n.severity ?? 'info'] ?? COR.info) : 'bg-transparent',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-sm leading-snug', naoLida(n) ? 'font-medium text-foreground' : 'text-foreground/80')}>
                    {n.title}
                  </span>
                  {n.body && <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{n.body}</span>}
                  <span className="mt-1 block text-[11px] text-muted-foreground/70">
                    {tempoRelativo(n.createdAt)}
                    {/* Aviso de outro portal: dizer de onde veio evita o susto
                        de clicar e cair em outro domínio. */}
                    {n.sourceApp && n.sourceApp !== 'portal-suporte' && ` · ${n.sourceApp}`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
