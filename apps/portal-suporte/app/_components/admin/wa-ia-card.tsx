'use client'

// =============================================================================
// Painel da IA humanizada.
//
// Configura o que a IA é, o que ela nunca faz e quanta iniciativa tem. O que
// NÃO se faz aqui: escrever o prompt à mão. Uma caixa de texto livre num painel
// que fala com cliente real é a forma mais rápida de alguém colar um prompt de
// teste numa sexta e ninguém perceber até segunda — por isso o formulário é
// guiado e a prévia é somente leitura.
//
// A prévia vem do SERVIDOR (`GET /whatsapp/ia`), montada pela mesma função que
// o motor de triagem usa. Montar o texto aqui no navegador criaria duas
// verdades, e a divergência apareceria como "a IA respondeu diferente do que a
// prévia mostrava".
//
// O painel também mostra o que falta para a IA funcionar — chave no cofre e
// host liberado na plataforma — porque essas duas coisas não são código nosso
// e ninguém deveria descobrir que faltam pelo silêncio do robô.
//
// Ver docs/plans/plano-painel-ia-humanizada-whatsapp.md.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronDown, Loader2, Lock, Play, Sparkles, TriangleAlert } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

type Config = {
  identidade: string
  tom: string
  contexto: string
  nuncaFazer: string[]
  nuncaFazerExtra: string
  chamarHumano: string[]
  tamanhoMax: number
  assinatura: string
  modelo: string
  nivel: string
  versao: number
}

type Estado = {
  chaveCadastrada: boolean
  hostLiberado: boolean
  detalheHost?: string | null
  bloqueadoPorDecisao: boolean
}

type Resposta = {
  config: Config
  prompt: string
  estado: Estado
  modelos: Record<string, string>
  niveis: Record<string, string>
  opcoesNuncaFazer: Record<string, string>
  opcoesChamarHumano: Record<string, string>
}

/** Teto fixo, não configurável — está no motor, e a tela precisa dizer isso. */
const TETO_RESPOSTAS = 3

/** Lembra se o card ficou aberto ou fechado — por pessoa, neste navegador. */
const CHAVE_ABERTO = 'wa_ia_card_aberto' 

export function WAIaCard() {
  const { toast } = useToast()
  const [dados, setDados] = useState<Resposta | null>(null)
  const [cfg, setCfg] = useState<Config | null>(null)
  const [carregando, setCarregando] = useState(true)
  // Chave da IA: vai DIRETO para o cofre (serverOnly) e nunca volta por rota
  // nenhuma. Mora aqui em cima com os demais hooks — declarar depois do
  // `return` antecipado quebra a ordem de hooks e derruba a tela inteira
  // (foi o que aconteceu em 21/08).
  const [chave, setChave] = useState('')
  const [salvandoChave, setSalvandoChave] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  // Simulador: exercita a configuração SEM tocar em cliente nenhum.
  const [teste, setTeste] = useState('')
  const [simulando, setSimulando] = useState(false)
  const [resposta, setResposta] = useState<{ texto: string; ok: boolean } | null>(null)
  // Fechado por padrão: o card é longo, e quem abre a tela quase sempre vem
  // ver a conexão, não reescrever o prompt.
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    setAberto(window.localStorage.getItem(CHAVE_ABERTO) === '1')
  }, [])

  function alternarAberto() {
    setAberto((v) => {
      window.localStorage.setItem(CHAVE_ABERTO, v ? '0' : '1')
      return !v
    })
  }

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await araraApiFetch('/api/whatsapp/ia')
      const j = await res.json()
      if (!res.ok || !j?.data) throw new Error(j?.error || 'Não foi possível ler a configuração.')
      setDados(j.data as Resposta)
      setCfg(j.data.config as Config)
      setErro('')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function salvar() {
    if (!cfg) return
    setSalvando(true)
    try {
      const res = await araraApiFetch('/api/whatsapp/ia', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cfg),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || `HTTP ${res.status}`)
      toast({
        title: 'Configuração salva',
        description: `Versão ${j.data?.config?.versao} — carimbada em cada resposta da IA.`,
      })
      // Recarrega do servidor: a prévia tem de vir de lá, não do que digitei.
      await carregar()
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

  async function simular() {
    const mensagem = teste.trim()
    if (!mensagem) return
    setSimulando(true)
    setResposta(null)
    try {
      const res = await araraApiFetch('/api/whatsapp/ia/simular', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem }),
      })
      const j = await res.json()
      if (!res.ok) {
        // O motivo por extenso — "erro de rede" não diz a ninguém que falta
        // liberar um host na plataforma.
        setResposta({
          ok: false,
          texto: [j?.error, j?.detalhe].filter(Boolean).join(' · ') || `HTTP ${res.status}`,
        })
      } else {
        setResposta({ ok: true, texto: String(j?.data?.resposta ?? '') })
      }
    } catch (e) {
      setResposta({ ok: false, texto: e instanceof Error ? e.message : 'Falha ao simular.' })
    } finally {
      setSimulando(false)
    }
  }

  function alternar(campo: 'nuncaFazer' | 'chamarHumano', chave: string) {
    setCfg((c) => {
      if (!c) return c
      const atual = c[campo]
      return {
        ...c,
        [campo]: atual.includes(chave) ? atual.filter((x) => x !== chave) : [...atual, chave],
      }
    })
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

  if (erro || !dados || !cfg) {
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

  const { estado } = dados
  const pendencias = [
    !estado.chaveCadastrada && 'a chave do OpenRouter não está no cofre',
    !estado.hostLiberado && 'o host openrouter.ai não está liberado na plataforma',
  ].filter(Boolean) as string[]

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        {/* O cabeçalho inteiro abre e fecha — alvo grande é mais fácil de
            acertar que uma seta de 14px, e a seta continua ali indicando. */}
        <button
          type="button"
          onClick={alternarAberto}
          aria-expanded={aberto}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              !aberto && '-rotate-90',
            )}
          />
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            IA humanizada
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
              versão {cfg.versao}
            </span>
            {/* Fechado, o card ainda precisa dizer em que pé está — senão
                minimizar vira esconder. */}
            {!aberto && (
              <span className="text-[11px] font-normal text-muted-foreground">
                {cfg.nivel} · {(dados.modelos[cfg.modelo] || cfg.modelo).split('—')[0].trim()}
                {pendencias.length > 0 && (
                  <span className="ml-1 text-sem-error-fg">· {pendencias.length} pendência{pendencias.length > 1 ? 's' : ''}</span>
                )}
              </span>
            )}
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
        {/* ── Estado: o que impede de funcionar ─────────────────────────── */}
        <div className="space-y-2">
          {estado.bloqueadoPorDecisao && (
            <p className="flex items-start gap-2 rounded-lg border border-sem-warning-bd bg-sem-warning px-3 py-2 text-xs text-sem-warning-fg">
              <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong>Ligar está bloqueado até definição.</strong> Você pode configurar e
                revisar tudo aqui; o interruptor na inbox continua travado.
              </span>
            </p>
          )}
          {pendencias.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg border border-sem-error-bd bg-sem-error px-3 py-2 text-xs text-sem-error-fg">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Mesmo destravando, a IA não responderia: {pendencias.join(' e ')}.
                {estado.detalheHost && (
                  <span className="block opacity-80">A plataforma respondeu: “{estado.detalheHost}”.</span>
                )}
              </span>
            </p>
          )}
          {pendencias.length === 0 && (
            <p className="flex items-center gap-2 text-xs text-sem-success-fg">
              <Check className="h-3.5 w-3.5" /> Chave e host prontos.
            </p>
          )}
        </div>

        {/* ── Identidade ────────────────────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ia-identidade">Como ela se apresenta</Label>
            <Input
              id="ia-identidade"
              value={cfg.identidade}
              onChange={(e) => setCfg({ ...cfg, identidade: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ia-tom">Tom</Label>
            <Input
              id="ia-tom"
              value={cfg.tom}
              onChange={(e) => setCfg({ ...cfg, tom: e.target.value })}
            />
          </div>
        </div>

        {/* ── Contexto ──────────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <Label htmlFor="ia-contexto">O que a Arara faz e o que ela atende</Label>
          <Textarea
            id="ia-contexto"
            rows={4}
            value={cfg.contexto}
            onChange={(e) => setCfg({ ...cfg, contexto: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            É este bloco que mais determina a qualidade das respostas — vale preencher com
            quem atende, não de memória.
          </p>
        </div>

        {/* ── Nunca fazer ───────────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label>O que ela nunca faz</Label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(dados.opcoesNuncaFazer).map(([chave, rotulo]) => {
              const ligado = cfg.nuncaFazer.includes(chave)
              return (
                <button
                  key={chave}
                  type="button"
                  onClick={() => alternar('nuncaFazer', chave)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    ligado
                      ? 'border-sem-error-bd bg-sem-error text-sem-error-fg'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground',
                  )}
                >
                  {rotulo}
                </button>
              )
            })}
          </div>
          <Input
            value={cfg.nuncaFazerExtra}
            onChange={(e) => setCfg({ ...cfg, nuncaFazerExtra: e.target.value })}
            placeholder="Outra proibição, com suas palavras (opcional)"
          />
        </div>

        {/* ── Chamar humano ─────────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label>Quando passar para um atendente</Label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(dados.opcoesChamarHumano).map(([chave, rotulo]) => {
              const ligado = cfg.chamarHumano.includes(chave)
              return (
                <button
                  key={chave}
                  type="button"
                  onClick={() => alternar('chamarHumano', chave)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    ligado
                      ? 'border-sem-info-bd bg-sem-info text-sem-info-fg'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground',
                  )}
                >
                  {rotulo}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Além disso, ela sempre para depois de <strong>{TETO_RESPOSTAS} respostas</strong> na
            mesma conversa, e assim que um atendente assume. Isso não se desliga aqui.
          </p>
        </div>

        {/* ── Nível ─────────────────────────────────────────────────────── */}
        <div className="space-y-2">
          <Label>Margem de iniciativa</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {Object.entries(dados.niveis).map(([chave, descricao]) => {
              const ligado = cfg.nivel === chave
              return (
                <button
                  key={chave}
                  type="button"
                  onClick={() => setCfg({ ...cfg, nivel: chave })}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors',
                    ligado ? 'border-indigo-600 bg-indigo-600/10' : 'border-border hover:border-indigo-600/40',
                  )}
                >
                  <span className={cn('block text-sm font-medium capitalize', ligado && 'text-indigo-600')}>
                    {chave}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{descricao}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Modelo e formato ──────────────────────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ia-modelo">Modelo</Label>
            <select
              id="ia-modelo"
              value={cfg.modelo}
              onChange={(e) => setCfg({ ...cfg, modelo: e.target.value })}
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm"
            >
              {Object.entries(dados.modelos).map(([id, rotulo]) => (
                <option key={id} value={id}>{rotulo}</option>
              ))}
            </select>
          </div>

            {/* Chave da API — vai direto ao cofre (serverOnly). Não volta por
                nenhuma rota; para trocar, cola-se outra por cima. */}
            <div className="space-y-1.5">
              <Label htmlFor="ia-chave">
                Chave da API {estado.chaveCadastrada && <span className="text-emerald-600 dark:text-emerald-400">· cadastrada</span>}
              </Label>
              <div className="flex gap-2">
                <input
                  id="ia-chave"
                  type="password"
                  value={chave}
                  onChange={(e) => setChave(e.target.value)}
                  placeholder={estado.chaveCadastrada ? 'Cole uma nova para substituir' : 'sk-or-v1-…'}
                  autoComplete="off"
                  className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={salvandoChave || chave.trim().length < 10}
                  onClick={async () => {
                    setSalvandoChave(true)
                    try {
                      const { appSecretsApi } = await import('@/lib/api/app-secrets')
                      await appSecretsApi.set('ia_api_key', chave.trim())
                      setChave('')
                      await carregar()
                    } finally {
                      setSalvandoChave(false)
                    }
                  }}
                >
                  {salvandoChave ? 'Salvando…' : 'Salvar chave'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Guardada cifrada na plataforma. Ninguém — nem esta tela — consegue lê-la de volta.
              </p>
            </div>
          <div className="space-y-1.5">
            <Label htmlFor="ia-tamanho">Tamanho máximo da resposta</Label>
            <Input
              id="ia-tamanho"
              type="number"
              min={200}
              max={1500}
              value={cfg.tamanhoMax}
              onChange={(e) => setCfg({ ...cfg, tamanhoMax: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ia-assinatura">Assinatura no fim da resposta (opcional)</Label>
          <Input
            id="ia-assinatura"
            value={cfg.assinatura}
            onChange={(e) => setCfg({ ...cfg, assinatura: e.target.value })}
            placeholder="— Suporte Arara"
          />
        </div>

        {/* ── Simulador ─────────────────────────────────────────────────── */}
        <div className="space-y-2 rounded-lg border border-border p-3">
          <Label htmlFor="ia-teste" className="flex items-center gap-1.5">
            <Play className="h-3.5 w-3.5 text-muted-foreground" />
            Testar sem enviar para ninguém
          </Label>
          <div className="flex gap-2">
            <Input
              id="ia-teste"
              value={teste}
              onChange={(e) => setTeste(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void simular() }}
              placeholder="Escreva como se fosse o cliente…"
            />
            <Button variant="secondary" onClick={() => void simular()} disabled={simulando || !teste.trim()}>
              {simulando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Simular'}
            </Button>
          </div>
          {resposta && (
            <p
              className={cn(
                'whitespace-pre-wrap rounded-lg border px-3 py-2 text-xs',
                resposta.ok
                  ? 'border-border bg-muted/40 text-foreground/90'
                  : 'border-sem-error-bd bg-sem-error text-sem-error-fg',
              )}
            >
              {resposta.texto}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Usa a configuração <strong>salva</strong>. Nada é enviado ao WhatsApp e nenhuma
            conversa é criada.
          </p>
        </div>

        {/* ── Prévia ────────────────────────────────────────────────────── */}
        <details className="rounded-lg border border-border bg-muted/30 p-3">
          <summary className="cursor-pointer text-sm font-medium">
            O que a IA vai receber (prévia do servidor)
          </summary>
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-foreground/80">
            {dados.prompt}
          </pre>
          <p className="mt-2 text-xs text-muted-foreground">
            Montado no servidor pela mesma função que o motor usa — salve para atualizar.
          </p>
        </details>
      </CardContent>
      )}
    </Card>
  )
}
