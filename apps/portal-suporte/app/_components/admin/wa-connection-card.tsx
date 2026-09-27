'use client'

// =============================================================================
// Conexão do WhatsApp — card dentro de Desempenho WhatsApp.
//
// Card na tela de Desempenho em vez de item novo na barra lateral, seguindo o
// mesmo padrão dos motivos de encerramento.
//
// Ele responde a pergunta que aparece toda vez que alguém diz "não chegou
// mensagem". São três coisas diferentes, e sem separá-las a conversa vira
// chute:
//
//   cofre   — o token do provedor está guardado?
//   sessão  — o WhatsApp está pareado, ou o celular caiu / o QR expirou?
//   webhook — a Avisa está entregando os eventos NESTE portal, ou num endereço
//             antigo? Já aconteceu: o webhook apontava para um endereço morto,
//             que respondia 200 com HTML, e as mensagens sumiam em silêncio.
//
// Os dois primeiros vêm de `GET /whatsapp/diagnostico`, o terceiro de
// `GET /whatsapp/diagnostico/webhook`. Ambos são leitura pura e exigem sessão
// de usuário — é por isso que isto vive numa tela, e não num script: a
// verificação roda com a credencial de quem está logado.
//
// O que torna o campo de token seguro num front estático: o segredo nasce
// `serverOnly`, e a chave de API que o portal minta no login tem escopo
// `app:{slug}:*`, que NÃO inclui `secrets:read`. A tela grava; o valor nunca
// volta por ela — o diagnóstico mostra só os 4 últimos caracteres.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { WATokenField } from './wa-token-field'
import { WAWebhookField } from './wa-webhook-field'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

/** Endereço onde a Avisa deve entregar — o mesmo que o webhook precisa ter. */
const DESTINO_ESPERADO = '/v1/r/portal-suporte/whatsapp/inbound'

type Estado = 'ok' | 'atencao' | 'erro' | 'desconhecido'

type Diagnostico = {
  cofre?: { ok?: boolean; digital?: string; erro?: string } | null
  rede?: { ok?: boolean; status?: number; erro?: string } | null
  sessao?: Record<string, unknown> | null
}

/** "há 3 dias" / "há 2 h" — a idade importa mais que a data exata. */
function diasDesde(iso: string): string {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000)
  if (h < 1) return 'agora há pouco'
  if (h < 48) return `há ${h} h`
  return `há ${Math.floor(h / 24)} dias`
}

function Linha({
  titulo,
  estado,
  detalhe,
}: {
  titulo: string
  estado: Estado
  detalhe: string
}) {
  const Icone = estado === 'ok' ? CheckCircle2 : estado === 'erro' ? XCircle : AlertTriangle
  const cor =
    estado === 'ok'
      ? 'text-sem-success-fg'
      : estado === 'erro'
        ? 'text-sem-error-fg'
        : 'text-sem-warning-fg'
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icone className={`mt-0.5 h-4 w-4 shrink-0 ${cor}`} />
      <div className="min-w-0">
        <span className="font-medium text-foreground/90">{titulo}</span>
        <p className="text-xs text-muted-foreground break-words">{detalhe}</p>
      </div>
    </div>
  )
}

/** Lembra se o card ficou aberto — por pessoa, neste navegador. */
const CHAVE_ABERTO = 'wa_conexao_card_aberto'

export function WAConnectionCard({ canManageToken = false }: { canManageToken?: boolean }) {
  const [diag, setDiag] = useState<Diagnostico | null>(null)
  const [webhook, setWebhook] = useState<string | null>(null)
  const [ultimaAtividade, setUltimaAtividade] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // Aberto por padrão: é o card que responde "o WhatsApp está de pé?", e essa
  // pergunta é a razão de a maioria abrir esta tela.
  const [aberto, setAberto] = useState(true)

  useEffect(() => {
    setAberto(window.localStorage.getItem(CHAVE_ABERTO) !== '0')
  }, [])

  function alternarAberto() {
    setAberto((v) => {
      window.localStorage.setItem(CHAVE_ABERTO, v ? '0' : '1')
      return !v
    })
  }

  const verificar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const [a, b, c] = await Promise.all([
        araraApiFetch('/api/whatsapp/diagnostico').then((r) => r.json()).catch(() => null),
        araraApiFetch('/api/whatsapp/diagnostico/webhook').then((r) => r.json()).catch(() => null),
        araraApiFetch('/api/whatsapp').then((r) => r.json()).catch(() => null),
      ])

      // Última atividade da caixa. Existe porque a falha desta integração é
      // silenciosa: configuração certa, sessão pareada, e mesmo assim dias sem
      // nenhuma mensagem — e ninguém percebe até um cliente reclamar. Uma data
      // velha aqui é o primeiro sinal, antes de qualquer diagnóstico.
      const conversas = (c?.data ?? []) as Array<Record<string, unknown>>
      let ultima: string | null = null
      for (const conv of conversas) {
        const q = String(conv.updated_at ?? conv.updatedAt ?? '')
        if (q && (!ultima || q > ultima)) ultima = q
      }
      setUltimaAtividade(ultima)
      if (a?.success) setDiag(a.data as Diagnostico)
      else setErro(a?.error || 'Não foi possível ler o diagnóstico.')

      // A Avisa devolve o endereço em formatos diferentes conforme a versão;
      // procurar a string no JSON inteiro é mais robusto que adivinhar o campo.
      const cru = JSON.stringify(b?.data?.webhook ?? '')
      const achado = cru.match(/https?:\/\/[^"\\ ]+/)
      setWebhook(achado ? achado[0] : '')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro de rede')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void verificar()
  }, [verificar])

  const cofreOk = diag?.cofre?.ok === true
  const httpAvisa = diag?.rede?.status ?? null
  const webhookOk = webhook != null && webhook.includes(DESTINO_ESPERADO)

  // A Avisa não tem um formato único de status — já respondeu `LoggedIn` no
  // topo e já respondeu aninhado. Em vez de apostar num campo, procuramos o
  // sinal em qualquer profundidade do JSON. E se nada for reconhecido, o card
  // diz "não reconhecido" e mostra a resposta crua: afirmar "não pareada" com
  // base em campo ausente foi exatamente o erro que apareceu na tela, com o
  // painel da Avisa mostrando conectado.
  const cru = diag?.sessao ?? null
  const texto = cru ? JSON.stringify(cru) : ''
  const conectado = /"(connected|loggedIn|LoggedIn|isConnected|authenticated)":\s*true/i.test(texto)
    || /"(status|state|connectionStatus)":\s*"(connected|open|CONNECTED|authenticated|inChat)"/i.test(texto)
  const desconectadoExplicito =
    /"(connected|loggedIn|LoggedIn|isConnected|authenticated)":\s*false/i.test(texto)
    || /"(status|state|connectionStatus)":\s*"(disconnected|close[d]?|unpaired|qr)"/i.test(texto)

  const estadoSessao: Estado = conectado
    ? 'ok'
    : httpAvisa === 401 || httpAvisa === 403
      ? 'erro'
      : desconectadoExplicito
        ? 'erro'
        : 'atencao'

  const jid = texto.match(/"[Jj]id":\s*"([^"@:]+)/)?.[1] ?? null

  // Veredito de uma palavra, usado quando o card está fechado: qualquer uma
  // das três pernas ruim já é motivo para abrir.
  const problema = !cofreOk || estadoSessao === 'erro' || webhook === '' || (webhook != null && !webhookOk)

  const detalheSessao =
    httpAvisa === 401 || httpAvisa === 403
      ? `A Avisa recusou a credencial (HTTP ${httpAvisa}). O token guardado não vale mais — gere um novo no painel da Avisa e regrave abaixo.`
      : conectado
        ? `Pareada${jid ? ` — número ${jid}` : ''}.`
        : desconectadoExplicito
          ? 'A Avisa respondeu que a sessão não está pareada. Reconecte o QR code no painel dela.'
          : `Não deu para interpretar a resposta da Avisa${httpAvisa ? ` (HTTP ${httpAvisa})` : ''}. Veja a resposta crua abaixo.`

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <button
          type="button"
          onClick={alternarAberto}
          aria-expanded={aberto}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${aberto ? '' : '-rotate-90'}`}
          />
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            Conexão do WhatsApp
            {/* Fechado, mostra o veredito — minimizar não pode virar esconder. */}
            {!aberto && diag && (
              <span className={`text-[11px] font-normal ${problema ? 'text-sem-error-fg' : 'text-sem-success-fg'}`}>
                {problema ? 'requer atenção' : 'tudo certo'}
              </span>
            )}
          </CardTitle>
        </button>
        <Button variant="outline" size="sm" onClick={() => void verificar()} disabled={carregando}>
          {carregando ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          Verificar
        </Button>
      </CardHeader>

      {aberto && (
      <CardContent className="space-y-4">
        {erro && (
          <p className="rounded-md border border-sem-error-bd bg-sem-error px-3 py-2 text-xs text-sem-error-fg">
            {erro}
          </p>
        )}

        {carregando && !diag ? (
          <p className="text-sm text-muted-foreground">Verificando…</p>
        ) : (
          <div className="space-y-2.5">
            <Linha
              titulo="Credencial do provedor"
              estado={cofreOk ? 'ok' : 'erro'}
              detalhe={
                cofreOk
                  ? `Guardada no cofre da plataforma (${diag?.cofre?.digital}).`
                  : diag?.cofre?.erro || 'Token não cadastrado — o portal não consegue falar com a Avisa.'
              }
            />
            <Linha
              titulo="Sessão do WhatsApp"
              estado={diag ? estadoSessao : 'desconhecido'}
              detalhe={detalheSessao}
            />
            <Linha
              titulo="Última atividade na caixa"
              estado={
                ultimaAtividade === null
                  ? 'desconhecido'
                  : Date.now() - new Date(ultimaAtividade).getTime() > 86400000
                    ? 'atencao'
                    : 'ok'
              }
              detalhe={
                ultimaAtividade === null
                  ? 'Sem conversas para comparar.'
                  : `${new Date(ultimaAtividade).toLocaleString('pt-BR')} — ${diasDesde(ultimaAtividade)}.` +
                    (Date.now() - new Date(ultimaAtividade).getTime() > 86400000
                      ? ' Mais de um dia sem movimento costuma ser entrega parada, não silêncio dos clientes.'
                      : '')
              }
            />
            <Linha
              titulo="Entrega das mensagens recebidas"
              estado={webhook === null ? 'desconhecido' : webhookOk ? 'ok' : 'erro'}
              detalhe={
                webhook === null
                  ? 'Não foi possível consultar o provedor.'
                  : webhookOk
                    ? 'A Avisa está entregando neste portal.'
                    : webhook
                      ? `Apontando para outro endereço: ${webhook}. As mensagens recebidas não chegam aqui.`
                      : 'Nenhum endereço configurado no provedor — nada do que o cliente escreve chega ao portal.'
              }
            />
          </div>
        )}

        {/* Resposta crua — só quando não deu para interpretar. Sem isto, a
            divergência entre este card e o painel da Avisa vira palpite. */}
        {diag && estadoSessao === 'atencao' && texto && (
          <details className="rounded-md border border-border bg-muted/40 p-2">
            <summary className="cursor-pointer text-xs text-muted-foreground">
              Resposta da Avisa (para diagnóstico)
            </summary>
            <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all text-[11px] text-foreground/80">
              {JSON.stringify(cru, null, 2)}
            </pre>
          </details>
        )}

        <div className="border-t border-border/50 pt-3">
          {canManageToken ? (
            <>
              <WATokenField />
              {/* Recadastrar é o conserto do item "Entrega das mensagens
                  recebidas" logo acima; ao terminar, o diagnóstico relê do
                  provedor e a linha muda sozinha. */}
              <WAWebhookField aoConcluir={() => void verificar()} />
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              O cadastro da credencial do provedor é feito por um administrador.
            </p>
          )}
        </div>
      </CardContent>
      )}
    </Card>
  )
}
