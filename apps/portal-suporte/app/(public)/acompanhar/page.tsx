'use client'

// =============================================================================
// Acompanhamento do chamado pelo cliente — número + código de 6.
//
// A porta é só esta. Antes a tela pedia o ID interno do chamado mais o e-mail
// do cadastro: um id que ninguém tem à mão e um e-mail que nem sempre é o de
// quem abriu. Enquanto isso o servidor já enviava por WhatsApp, na abertura, o
// número e um código de 6 caracteres — e a tela não sabia recebê-los. Quem
// recebia a mensagem não conseguia entrar.
//
// A prova de posse é o par (número, código), conferido em
// POST /tickets/acompanhar: cinco erros travam o chamado por uma hora, a
// recusa é sempre a mesma frase (dizer se errou o número OU o código entrega
// um oráculo), e o acesso vale enquanto o chamado está aberto mais sete dias
// depois de encerrado.
//
// A resposta do servidor é enxuta de propósito — número, título, etapa e a
// linha do tempo. Nada de justificativa da IA, pontuação interna ou quadro do
// Dev. Mensagens internas da equipe não entram: lá, `is_internal` indefinido é
// tratado como interna.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, MessageSquare, CircleDot, RefreshCw, Send } from 'lucide-react'
import { araraFetch } from '@/lib/arara/client'

// A plataforma não tem rota pública: só `actor` (exige login) e
// `webhook_secret` (valida ?token=). Quem acompanha um chamado NÃO está
// logado, então a rota usa webhook_secret com um token público constante — ele
// só satisfaz o modo da plataforma. Mesma escolha de /auth/senha/solicitar.
const TOKEN_PUBLICO = 'portal-suporte-recuperacao-publica'

type Evento = {
  quando: string
  tipo: 'etapa' | 'mensagem'
  texto: string
  de?: 'suporte' | 'voce'
}

type Acompanhamento = {
  numero: string
  titulo: string
  etapa: string
  aberto_em: string
  resolvido_em: string | null
  previsao: string | null
  encerrado: boolean
  linha_do_tempo: Evento[]
}

/** O servidor perdoa O→0 e I/L→1; a tela faz o mesmo para não recusar antes. */
function normalizarCodigo(cru: string): string {
  return cru.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').slice(0, 6)
}

function normalizarNumero(cru: string): string {
  return cru.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function quando(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function AcompanharPage() {
  const [numero, setNumero] = useState('')
  const [codigo, setCodigo] = useState('')
  const [dados, setDados] = useState<Acompanhamento | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [atualizando, setAtualizando] = useState(false)

  // O par autenticado fica guardado para a atualização periódica; os campos do
  // formulário podem ser editados sem derrubar a consulta em curso.
  const credencial = useRef<{ numero: string; codigo: string } | null>(null)

  const [resposta, setResposta] = useState('')
  const [enviandoResposta, setEnviandoResposta] = useState(false)
  const [erroResposta, setErroResposta] = useState<string | null>(null)

  const consultar = useCallback(async (n: string, c: string, silencioso = false) => {
    if (!n || c.length !== 6) {
      setErro('Informe o número do chamado e o código de 6 caracteres.')
      return
    }
    silencioso ? setAtualizando(true) : setCarregando(true)
    if (!silencioso) setErro(null)
    try {
      const r = await araraFetch.post(
        `/api/tickets/acompanhar?token=${TOKEN_PUBLICO}`,
        { numero: n, codigo: c },
      ) as { data?: Acompanhamento; error?: string }
      if (!r?.data) {
        if (!silencioso) setErro(String(r?.error || 'Número ou código inválido.'))
        return
      }
      credencial.current = { numero: n, codigo: c }
      setDados(r.data)
      setErro(null)
    } catch (e) {
      // A recusa do servidor chega como erro do fetch; o texto dele já é a
      // frase única, então repassar é melhor do que inventar outra.
      const msg = e instanceof Error ? e.message : 'Não foi possível consultar agora.'
      if (!silencioso) setErro(msg)
    } finally {
      setCarregando(false)
      setAtualizando(false)
    }
  }, [])

  // Link da mensagem: traz o NÚMERO preenchido, nunca o código.
  //
  // O número não é segredo — aparece em toda mensagem. O código é, e levá-lo na
  // URL o espalharia pelo log de acesso do servidor, pela prévia de link do
  // WhatsApp e pelo histórico do navegador. Então o link tira metade da
  // digitação e a pessoa completa com os 6 caracteres que só ela tem.
  //
  // Se alguém colar uma URL com `codigo`, continua funcionando: não geramos
  // esse formato, mas recusar quem já o tem em mãos seria gratuito.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const p = new URLSearchParams(window.location.search)
    const n = normalizarNumero(p.get('numero') || '')
    const c = normalizarCodigo(p.get('codigo') || '')
    if (n) setNumero(n)
    if (c) setCodigo(c)
    if (n && c.length === 6) { consultar(n, c); return }
    // Só o número: o cursor já vai para o campo que falta.
    if (n) setTimeout(() => document.getElementById('codigo')?.focus(), 0)
  }, [consultar])

  // Enquanto o chamado anda, reconsulta sozinho. Encerrado não muda mais.
  useEffect(() => {
    if (!dados || dados.encerrado || dados.resolvido_em) return
    const t = setInterval(() => {
      const cred = credencial.current
      if (cred) consultar(cred.numero, cred.codigo, true)
    }, 60_000)
    return () => clearInterval(t)
  }, [dados, consultar])

  const responder = async (e: React.FormEvent) => {
    e.preventDefault()
    const cred = credencial.current
    const texto = resposta.trim()
    if (!cred || !texto) return
    setEnviandoResposta(true)
    setErroResposta(null)
    try {
      await araraFetch.post(`/api/tickets/public/reply?token=${TOKEN_PUBLICO}`, {
        numero: cred.numero,
        codigo: cred.codigo,
        mensagem: texto,
      })
      setResposta('')
      // A mensagem aparece pela linha do tempo, não por acréscimo local: assim
      // o que a tela mostra é o que o servidor guardou, e não uma suposição.
      await consultar(cred.numero, cred.codigo, true)
    } catch (err) {
      setErroResposta(err instanceof Error ? err.message : 'Não foi possível enviar agora.')
    } finally {
      setEnviandoResposta(false)
    }
  }

  const enviar = (e: React.FormEvent) => {
    e.preventDefault()
    consultar(normalizarNumero(numero), normalizarCodigo(codigo))
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="mb-1 text-xl font-bold text-foreground">Acompanhar chamado</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Informe o número do chamado e o código que você recebeu no WhatsApp quando o chamado foi aberto.
      </p>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <form onSubmit={enviar} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="numero" className="text-xs font-medium text-foreground/60">Número do chamado</Label>
                <Input
                  id="numero"
                  value={numero}
                  onChange={(e) => setNumero(normalizarNumero(e.target.value))}
                  placeholder="TCK000123"
                  disabled={carregando}
                  className="mt-1 font-mono text-sm"
                  autoComplete="off"
                />
              </div>
              <div>
                <Label htmlFor="codigo" className="text-xs font-medium text-foreground/60">Código de acompanhamento</Label>
                <Input
                  id="codigo"
                  value={codigo}
                  onChange={(e) => setCodigo(normalizarCodigo(e.target.value))}
                  placeholder="6 caracteres"
                  maxLength={6}
                  disabled={carregando}
                  className="mt-1 font-mono text-sm tracking-[0.3em]"
                  autoComplete="off"
                />
              </div>
            </div>

            {erro && (
              <Alert variant="destructive" className="py-2">
                <AlertDescription className="text-sm">{erro}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={carregando} className="w-full sm:w-auto">
              {carregando ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Consultando…</>) : 'Consultar'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {dados && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">{dados.numero}</span>
              <Badge variant="outline">{dados.etapa}</Badge>
              {atualizando && <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" aria-label="Atualizando" />}
            </div>

            <h2 className="mb-1 text-base font-semibold text-foreground">{dados.titulo}</h2>
            <p className="mb-6 text-xs text-muted-foreground">
              Aberto em {quando(dados.aberto_em)}
              {dados.previsao ? ` · previsão: ${quando(dados.previsao)}` : ''}
              {dados.resolvido_em ? ` · resolvido em ${quando(dados.resolvido_em)}` : ''}
            </p>

            <ol className="relative space-y-5 border-l border-border pl-6">
              {dados.linha_do_tempo.map((ev, i) => (
                <li key={`${ev.quando}-${i}`} className="relative">
                  <span className="absolute -left-[1.65rem] top-1 flex h-4 w-4 items-center justify-center rounded-full bg-background">
                    {ev.tipo === 'mensagem'
                      ? <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                      : <CircleDot className="h-3.5 w-3.5 text-primary" />}
                  </span>
                  <p className="text-xs text-muted-foreground">{quando(ev.quando)}</p>
                  {ev.tipo === 'mensagem' ? (
                    <div className="mt-1 rounded-md border bg-muted/40 px-3 py-2">
                      <p className="mb-1 text-xs font-medium text-foreground/70">
                        {ev.de === 'voce' ? 'Você escreveu' : 'Suporte respondeu'}
                      </p>
                      <p className="whitespace-pre-wrap text-sm text-foreground">{ev.texto}</p>
                    </div>
                  ) : (
                    <p className="mt-0.5 text-sm font-medium text-foreground">{ev.texto}</p>
                  )}
                </li>
              ))}
            </ol>

            {/* Resposta do cliente. Some quando o chamado encerra: o servidor
                recusa mensagem em chamado terminal com mais de 7 dias, e
                oferecer um campo que vai falhar é pior do que não oferecer. */}
            {!dados.encerrado && (
              <form onSubmit={responder} className="mt-8 border-t border-border pt-6">
                <Label htmlFor="resposta" className="text-xs font-medium text-foreground/60">
                  Precisa complementar alguma informação?
                </Label>
                <textarea
                  id="resposta"
                  value={resposta}
                  onChange={(e) => setResposta(e.target.value)}
                  rows={3}
                  maxLength={4000}
                  placeholder="Escreva aqui e o suporte verá no chamado…"
                  disabled={enviandoResposta}
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
                {erroResposta && (
                  <Alert variant="destructive" className="mt-2 py-2">
                    <AlertDescription className="text-sm">{erroResposta}</AlertDescription>
                  </Alert>
                )}
                <div className="mt-2 flex justify-end">
                  <Button type="submit" size="sm" disabled={enviandoResposta || !resposta.trim()}>
                    {enviandoResposta
                      ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando…</>)
                      : (<><Send className="mr-2 h-4 w-4" />Enviar</>)}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}
    </main>
  )
}
