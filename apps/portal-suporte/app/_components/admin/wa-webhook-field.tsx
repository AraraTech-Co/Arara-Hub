'use client'

// =============================================================================
// Recadastrar o webhook de entrada — as duas pontas de uma vez.
//
// "Não chega mensagem" quase sempre é isto: a Avisa entrega os eventos numa
// URL que carrega `?token=`, e a plataforma compara esse token com o segredo
// `avisa_webhook_secret` do cofre ANTES de rodar qualquer código nosso. Não
// batendo, ela responde 403 e o evento morre em silêncio — nada no banco, nada
// na tela, e o painel da Avisa continua dizendo "conectado" porque o ENVIO usa
// outro token e outro caminho.
//
// O problema prático é que os dois lados não podem ser conferidos: o segredo
// nasce `serverOnly` e nunca volta do cofre. Por isso este campo não tenta
// comparar — ele GRAVA O MESMO VALOR nos dois lugares, na ordem certa:
//
//   1. `avisa_webhook_secret` no cofre da plataforma;
//   2. a URL completa (com o token) no provedor, via
//      `POST /whatsapp/diagnostico/webhook`, que é admin-only.
//
// Entre um passo e outro há uma janela de segundos em que a Avisa ainda manda
// o token antigo e leva 403. Como isto só é usado quando a entrada já está
// parada, a janela não custa nada — mas é por isso que o botão avisa antes.
//
// O token é gerado aqui, com `crypto.getRandomValues`. Digitar um à mão só
// serve para repetir um valor que já existe do outro lado, e é isso que o
// modo manual cobre.
// =============================================================================

import { useState } from 'react'
import { Link2, Loader2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'
import { ARARA_SLUG, ARARA_URL } from '@/lib/arara/client'
import { appSecretsApi } from '@/lib/api/app-secrets'

/** Nome do segredo que a rota `/whatsapp/inbound` exige (authMode webhook_secret). */
const SEGREDO_WEBHOOK = 'avisa_webhook_secret'

const ENDPOINT = `${ARARA_URL}/v1/r/${ARARA_SLUG}/whatsapp/inbound`

function tokenNovo(): string {
  const alfabeto = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const bytes = new Uint32Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (n) => alfabeto[n % alfabeto.length]).join('')
}

export function WAWebhookField({ aoConcluir }: { aoConcluir?: () => void }) {
  const { toast } = useToast()
  const [manual, setManual] = useState(false)
  const [tokenManual, setTokenManual] = useState('')
  const [passo, setPasso] = useState<'' | 'cofre' | 'provedor'>('')

  async function recadastrar() {
    const token = manual ? tokenManual.trim() : tokenNovo()
    if (!token) return

    try {
      setPasso('cofre')
      await appSecretsApi.set(SEGREDO_WEBHOOK, token)

      setPasso('provedor')
      const res = await araraApiFetch('/api/whatsapp/diagnostico/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook: `${ENDPOINT}?token=${encodeURIComponent(token)}` }),
      })
      const j = await res.json().catch(() => null)
      // A Avisa responde 200 com corpo de erro em alguns casos; o card de
      // diagnóstico logo abaixo é quem dá o veredito final, relendo do provedor.
      if (!res.ok || j?.success === false) {
        throw new Error(j?.error || `O provedor recusou (HTTP ${j?.data?.http ?? res.status})`)
      }

      setTokenManual('')
      toast({
        title: 'Webhook recadastrado',
        description: 'Segredo e endereço gravados. Mande um WhatsApp de teste para confirmar.',
      })
      aoConcluir?.()
    } catch (e) {
      toast({
        title: passo === 'cofre' ? 'Não foi possível gravar o segredo' : 'Não foi possível avisar o provedor',
        description:
          e instanceof Error ? e.message : 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setPasso('')
    }
  }

  const ocupado = passo !== ''

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Endereço de entrega (webhook)</p>
      </div>

      <p className="text-xs text-muted-foreground">
        Grava um segredo novo no cofre e aponta a Avisa para{' '}
        <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{ENDPOINT}</code>, já com o
        token na URL. Use quando as mensagens recebidas pararem de chegar — é o que garante que os
        dois lados usam o mesmo valor, já que o segredo nunca volta do cofre para conferência.
      </p>

      {manual && (
        <Input
          value={tokenManual}
          onChange={(e) => setTokenManual(e.target.value)}
          placeholder="Token que já está configurado na Avisa"
          autoComplete="off"
          spellCheck={false}
          className="font-mono text-xs"
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void recadastrar()} disabled={ocupado || (manual && !tokenManual.trim())}>
          {ocupado && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {passo === 'cofre' ? 'Gravando no cofre…' : passo === 'provedor' ? 'Avisando a Avisa…' : 'Recadastrar webhook'}
        </Button>
        <button
          type="button"
          onClick={() => setManual(!manual)}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          {manual ? 'Gerar um token novo' : 'Usar um token que já tenho'}
        </button>
      </div>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Entre gravar o cofre e avisar o provedor há alguns segundos em que a Avisa ainda manda o
        token antigo e leva 403. Se o recadastro falhar no meio, clique de novo — repetir é seguro.
      </p>
    </div>
  )
}
