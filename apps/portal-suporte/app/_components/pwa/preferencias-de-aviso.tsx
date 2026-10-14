'use client'

// =============================================================================
// Avisos no celular / no sistema — a tela (Fase 4).
//
// Aqui, e só aqui, a permissão de notificação é pedida: depois de um clique
// explícito. Pedir na carga da página é o jeito mais rápido de levar um
// "bloquear para sempre", e depois disso não há como voltar a perguntar.
//
// Com a aba aberta e à vista, o aviso do sistema NÃO aparece — quem está
// olhando a tela já tem o sino. Essa decisão é do service worker, porque só o
// navegador sabe se alguma aba está visível.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { BellRing, BellOff, Loader2, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'
import {
  pushApi, chaveParaBytes, ehIosSemInstalar, type PreferenciasDeAviso,
} from '@/lib/api/push'

const ROTULOS: { chave: keyof PreferenciasDeAviso; titulo: string; detalhe: string }[] = [
  { chave: 'fila', titulo: 'Conversa nova na fila', detalhe: 'Alguém escreveu e ninguém assumiu ainda.' },
  { chave: 'minha_conversa', titulo: 'Mensagem numa conversa minha', detalhe: 'Só nas conversas em que você é o responsável.' },
  { chave: 'chamado_atribuido', titulo: 'Chamado atribuído a você', detalhe: 'Quando um chamado entra na sua fila.' },
]

export function PreferenciasDeAviso() {
  const { toast } = useToast()
  const [carregando, setCarregando] = useState(true)
  const [ligado, setLigado] = useState(false)
  const [inscrito, setInscrito] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [prefs, setPrefs] = useState<PreferenciasDeAviso>({
    fila: true, minha_conversa: true, chamado_atribuido: true,
  })
  const [permissao, setPermissao] = useState<NotificationPermission | 'indisponivel'>('default')
  const iosSemInstalar = ehIosSemInstalar()

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const [chave, p] = await Promise.all([pushApi.chavePublica(), pushApi.lerPreferencias()])
        if (!vivo) return
        setLigado(!!chave.data?.ligado)
        if (p.data) setPrefs(p.data)
      } catch {
        if (vivo) setLigado(false)
      }
      if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
        if (vivo) setPermissao('indisponivel')
      } else if (vivo) {
        setPermissao(Notification.permission)
        try {
          const reg = await navigator.serviceWorker.ready
          const atual = await reg.pushManager.getSubscription()
          if (vivo) setInscrito(!!atual)
        } catch { /* sem service worker ainda */ }
      }
      if (vivo) setCarregando(false)
    })()
    return () => { vivo = false }
  }, [])

  const ligar = useCallback(async () => {
    setOcupado(true)
    try {
      const permitido = await Notification.requestPermission()
      setPermissao(permitido)
      if (permitido !== 'granted') {
        toast({
          title: 'Permissão não concedida',
          description: 'O navegador recusou. Dá para mudar nas configurações do site.',
          variant: 'destructive',
        })
        return
      }
      const { data } = await pushApi.chavePublica()
      if (!data?.ligado || !data.chave) {
        toast({ title: 'Avisos ainda não configurados', description: 'Falta a chave no servidor.' })
        return
      }
      const reg = await navigator.serviceWorker.ready
      const assinatura = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveParaBytes(data.chave),
      })
      const bruto = assinatura.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
      await pushApi.inscrever({
        endpoint: String(bruto.endpoint || ''),
        keys: { p256dh: String(bruto.keys?.p256dh || ''), auth: String(bruto.keys?.auth || '') },
        ua: navigator.userAgent,
      })
      setInscrito(true)
      toast({ title: 'Avisos ligados neste aparelho' })
    } catch (err) {
      toast({
        title: 'Não deu para ligar os avisos',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setOcupado(false)
    }
  }, [toast])

  const desligar = useCallback(async () => {
    setOcupado(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const atual = await reg.pushManager.getSubscription()
      // Apaga nos DOIS lados: só no navegador, o servidor continuaria mandando
      // para um endereço morto; só no servidor, o navegador seguiria inscrito.
      if (atual) {
        await pushApi.desinscrever(atual.endpoint)
        await atual.unsubscribe()
      } else {
        await pushApi.desinscrever()
      }
      setInscrito(false)
      toast({ title: 'Avisos desligados neste aparelho' })
    } catch (err) {
      toast({
        title: 'Não deu para desligar',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    } finally {
      setOcupado(false)
    }
  }, [toast])

  const trocar = useCallback(async (chave: keyof PreferenciasDeAviso, valor: boolean) => {
    const antes = prefs
    const novo = { ...prefs, [chave]: valor }
    setPrefs(novo)
    try {
      await pushApi.salvarPreferencias(novo)
    } catch (err) {
      setPrefs(antes)
      toast({
        title: 'A preferência não foi salva',
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      })
    }
  }, [prefs, toast])

  if (carregando) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando preferências…
      </p>
    )
  }

  const nadaLigado = !prefs.fila && !prefs.minha_conversa && !prefs.chamado_atribuido

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Avisos no aparelho</h3>
        <p className="text-xs text-muted-foreground">
          Chegam mesmo com a aba fechada. Com o portal aberto e à vista, só o sino toca — nunca os
          dois ao mesmo tempo.
        </p>
      </div>

      {!ligado && (
        <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Os avisos ainda não foram configurados neste portal. Falta a chave no servidor.
        </p>
      )}

      {permissao === 'indisponivel' && (
        <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Este navegador não suporta avisos do sistema.
        </p>
      )}

      {iosSemInstalar && (
        <p className="flex items-start gap-2 rounded-md border border-sem-info-bd bg-sem-info px-3 py-2 text-xs text-sem-info-fg">
          <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            No iPhone e no iPad, o aviso só funciona com o portal <strong>instalado na tela de
            início</strong>: toque em Compartilhar e em “Adicionar à Tela de Início”. É exigência
            do iOS, não do portal.
          </span>
        </p>
      )}

      {permissao === 'denied' && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          O navegador está bloqueando os avisos deste site. Para liberar, mude a permissão de
          notificações nas configurações do site — daqui não dá para perguntar de novo.
        </p>
      )}

      {ligado && permissao !== 'indisponivel' && (
        inscrito ? (
          <Button type="button" variant="outline" size="sm" disabled={ocupado} onClick={() => void desligar()} className="gap-1">
            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellOff className="h-3.5 w-3.5" />}
            Desligar neste aparelho
          </Button>
        ) : (
          <Button type="button" size="sm" disabled={ocupado || permissao === 'denied'} onClick={() => void ligar()} className="gap-1">
            {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
            Ligar neste aparelho
          </Button>
        )
      )}

      <div className="space-y-3 border-t border-border pt-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          O que avisar
        </p>
        {ROTULOS.map((r) => (
          <div key={r.chave} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Label htmlFor={`pref-${r.chave}`} className="text-sm">{r.titulo}</Label>
              <p className="text-[11px] text-muted-foreground">{r.detalhe}</p>
            </div>
            <Switch
              id={`pref-${r.chave}`}
              checked={prefs[r.chave]}
              onCheckedChange={(v) => void trocar(r.chave, v)}
            />
          </div>
        ))}
        {nadaLigado && inscrito && (
          <p className="text-[11px] italic text-muted-foreground">
            Com os três desligados, nada é enviado — é o mesmo que não estar inscrito.
          </p>
        )}
      </div>
    </div>
  )
}
