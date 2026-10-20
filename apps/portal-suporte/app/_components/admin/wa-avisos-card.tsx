'use client'

// =============================================================================
// Configuração de avisos — o prazo e os três textos que chegam ao celular do
// plantão e do backup.
//
// O que NÃO se edita aqui: o link da conversa. Ele é acrescentado pelo servidor
// ao fim de toda mensagem — é o que dá função ao aviso —, por isso a tela nem
// oferece `{{link}}` e o servidor recusa se vier.
//
// A prévia vem do SERVIDOR (`POST /whatsapp/avisos/previa`), montada pela mesma
// função que monta a mensagem de verdade. Montar o texto aqui criaria duas
// verdades. O tamanho mostrado é o da mensagem inteira, link incluído: cada aviso
// é uma mensagem paga.
//
// Fora desta tela: o horário da janela de plantão (Horário de atendimento) e a
// escala de quem está de plantão (Plantão).
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { BellRing, ChevronDown, Loader2, RotateCcw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

type Chave = 'texto_uma' | 'texto_varias' | 'texto_backup'
type Previa = { texto: string; tamanho: number } | { erro: string }
type Resposta = {
  config: { prazo_min: number | null } & Record<Chave, string>
  padrao: Record<Chave, string>
  variaveis: Record<Chave, string[]>
  maximo: number
  maximo_prazo: number
  previa: Record<Chave, { texto: string; tamanho: number }>
  versao: number
}

const CHAVE_ABERTO = 'wa_avisos_card_aberto'

const TEXTOS: { chave: Chave; titulo: string; ajuda: string }[] = [
  {
    chave: 'texto_uma',
    titulo: 'Fila — uma conversa esperando',
    ajuda: 'Vai ao plantonista quando só uma conversa espera. Nomeia o cliente.',
  },
  {
    chave: 'texto_varias',
    titulo: 'Fila — várias conversas esperando',
    ajuda: 'Uma mensagem só para todas: conta quantas e lista as mais antigas.',
  },
  {
    chave: 'texto_backup',
    titulo: 'Backup técnico',
    ajuda: 'Vai ao backup quando um atendente aperta “chamar backup técnico”. Não há escalada automática.',
  },
]

export function WAAvisosCard() {
  const { toast } = useToast()
  const [dados, setDados] = useState<Resposta | null>(null)
  const [prazo, setPrazo] = useState('')
  const [textos, setTextos] = useState<Record<Chave, string> | null>(null)
  const [previa, setPrevia] = useState<Record<string, Previa>>({})
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [aberto, setAberto] = useState(false)
  const alvoPrevia = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    try {
      setAberto(window.localStorage.getItem(CHAVE_ABERTO) === '1')
    } catch {
      /* sem armazenamento: fica fechado */
    }
  }, [])

  function alternarAberto() {
    setAberto((v) => {
      try {
        window.localStorage.setItem(CHAVE_ABERTO, v ? '0' : '1')
      } catch {
        /* sem armazenamento */
      }
      return !v
    })
  }

  const aplicar = useCallback((d: Resposta) => {
    setDados(d)
    setPrazo(d.config.prazo_min === null ? '' : String(d.config.prazo_min))
    setTextos({ texto_uma: d.config.texto_uma, texto_varias: d.config.texto_varias, texto_backup: d.config.texto_backup })
    setPrevia(d.previa)
  }, [])

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await araraApiFetch('/api/whatsapp/avisos')
      const j = await res.json()
      if (!res.ok || !j?.data) throw new Error(j?.error || 'Não foi possível ler a configuração.')
      aplicar(j.data as Resposta)
      setErro('')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar.')
    } finally {
      setCarregando(false)
    }
  }, [aplicar])

  useEffect(() => {
    void carregar()
  }, [carregar])

  // Prévia ao vivo: pede ao servidor 400 ms depois da última tecla.
  function editar(chave: Chave, valor: string) {
    setTextos((t) => (t ? { ...t, [chave]: valor } : t))
    if (alvoPrevia.current) clearTimeout(alvoPrevia.current)
    alvoPrevia.current = setTimeout(async () => {
      try {
        const res = await araraApiFetch('/api/whatsapp/avisos/previa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [chave]: valor }),
        })
        const j = await res.json()
        if (res.ok && j?.data?.previa?.[chave]) setPrevia((p) => ({ ...p, [chave]: j.data.previa[chave] as Previa }))
      } catch {
        /* a prévia some até a próxima tecla; salvar continua validando no servidor */
      }
    }, 400)
  }

  async function salvar() {
    if (!textos) return
    setSalvando(true)
    try {
      const res = await araraApiFetch('/api/whatsapp/avisos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prazo_min: prazo.trim() === '' ? null : Number(prazo), ...textos }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`)
      aplicar(j.data as Resposta)
      toast({ title: 'Avisos salvos', description: `Versão ${j.data?.versao}. Vale já para o próximo aviso.` })
    } catch (e) {
      toast({
        title: 'Não foi possível salvar',
        description: e instanceof Error ? e.message : 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  if (carregando && !dados) {
    return (
      <Card>
        <CardContent className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }
  if (erro || !dados || !textos) {
    return (
      <Card>
        <CardContent className="py-6">
          <p className="text-sm text-sem-error-fg">{erro || 'Configuração indisponível.'}</p>
          <Button size="sm" variant="secondary" className="mt-3" onClick={() => void carregar()}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    )
  }

  const resumoPrazo =
    dados.config.prazo_min === null || dados.config.prazo_min === 0 ? 'prazo: na hora' : `prazo: ${dados.config.prazo_min} min`

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <button type="button" onClick={alternarAberto} aria-expanded={aberto} className="flex flex-1 items-center gap-2 text-left">
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', !aberto && '-rotate-90')} />
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <BellRing className="h-4 w-4 text-muted-foreground" />
            Configuração de avisos
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground">versão {dados.versao}</span>
            {!aberto && <span className="text-[11px] font-normal text-muted-foreground">{resumoPrazo}</span>}
          </CardTitle>
        </button>
        {aberto && (
          <Button size="sm" onClick={() => void salvar()} disabled={salvando}>
            {salvando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Salvar
          </Button>
        )}
      </CardHeader>

      {aberto && (
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="av-prazo">Prazo do aviso ao plantão (minutos)</Label>
            <Input
              id="av-prazo"
              type="number"
              inputMode="numeric"
              min={0}
              max={dados.maximo_prazo}
              step={1}
              className="max-w-[10rem]"
              placeholder="vazio"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              <strong>Vazio ou 0</strong> avisa na hora. De 1 a {dados.maximo_prazo}: espera esse tempo, contado da abertura da janela de plantão
              para quem chegou na madrugada. Depois do primeiro aviso, até 3 lembretes de 5 em 5 minutos. O aviso só sai dentro da janela de plantão.
            </p>
          </div>

          {TEXTOS.map(({ chave, titulo, ajuda }) => {
            const p = previa[chave]
            const ehPadrao = textos[chave] === dados.padrao[chave]
            return (
              <div key={chave} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`av-${chave}`}>{titulo}</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    disabled={ehPadrao}
                    onClick={() => editar(chave, dados.padrao[chave])}
                  >
                    <RotateCcw className="mr-1 h-3 w-3" /> Restaurar padrão
                  </Button>
                </div>
                <Textarea
                  id={`av-${chave}`}
                  rows={chave === 'texto_varias' ? 4 : 3}
                  maxLength={dados.maximo}
                  value={textos[chave]}
                  onChange={(e) => editar(chave, e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {ajuda} Variáveis:{' '}
                  {dados.variaveis[chave].map((v) => (
                    <code key={v} className="mx-0.5 rounded bg-muted px-1 py-0.5 text-[11px]">{`{{${v}}}`}</code>
                  ))}
                  . O link da conversa é acrescentado no fim, sozinho.
                </p>
                {p && 'erro' in p ? (
                  <p className="rounded-lg border border-sem-error-bd bg-sem-error px-3 py-2 text-xs text-sem-error-fg">{p.erro}</p>
                ) : (
                  p && (
                    <div className="rounded-lg border bg-muted/40 px-3 py-2">
                      <p className="mb-1 text-[11px] text-muted-foreground">
                        Prévia com dados de exemplo · {p.tamanho} caracteres na mensagem inteira
                      </p>
                      <p className="whitespace-pre-wrap break-words text-sm">{p.texto}</p>
                    </div>
                  )
                )}
              </div>
            )
          })}
        </CardContent>
      )}
    </Card>
  )
}
