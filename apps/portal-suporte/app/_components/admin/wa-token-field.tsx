'use client'

// =============================================================================
// Cadastro do token do provedor de WhatsApp — campo de ESCRITA APENAS.
//
// Só existe porque a plataforma passou a guardar credencial de terceiro
// criptografada (`AppSecret`, AES-256-GCM) com `serverOnly` por padrão, e
// porque a chave de API que o portal minta no login tem escopo `app:{slug}:*`,
// que NÃO inclui `secrets:read`. Sem essas duas coisas, um campo de token numa
// tela estática seria só uma forma nova de vazar o token: a camada de models
// devolve registro inteiro por padrão — é assim que `/profiles` entrega
// `password_hash` até hoje.
//
// O que esta tela NUNCA faz: ler o valor de volta. A rota de leitura existe,
// mas responde ao JWT de admin e à machine key, não à chave que está aqui. A
// tela mostra só metadado: se está cadastrado e quando mudou.
// =============================================================================

import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { formatDate } from '@/lib/utils'
import { appSecretsApi, SEGREDO_WHATSAPP, type AppSecretMeta } from '@/lib/api/app-secrets'

export function WATokenField() {
  const { toast } = useToast()
  const [meta, setMeta] = useState<AppSecretMeta | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [valor, setValor] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await appSecretsApi.list()
      setMeta(res.secrets?.find((s) => s.name === SEGREDO_WHATSAPP) ?? null)
      setErro('')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível ler o cofre.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    void carregar()
  }, [carregar])

  async function salvar() {
    const v = valor.trim()
    if (!v) return
    setSalvando(true)
    try {
      await appSecretsApi.set(SEGREDO_WHATSAPP, v)
      // Some da memória do navegador assim que sai daqui.
      setValor('')
      toast({
        title: 'Token guardado',
        description: 'Fica guardado criptografado, pronto para a integração usar.',
      })
      await carregar()
    } catch (e) {
      toast({
        title: 'Não foi possível guardar',
        description: e instanceof Error ? e.message : 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">Token do provedor</p>
        {!carregando && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              meta ? 'bg-sem-success text-sem-success-fg' : 'bg-muted text-muted-foreground'
            }`}
          >
            {meta ? 'cadastrado' : 'não cadastrado'}
          </span>
        )}
      </div>

      {erro && <p className="text-xs text-sem-error-fg">{erro}</p>}

      {meta?.updatedAt && (
        <p className="text-xs text-muted-foreground">
          Atualizado em {formatDate(meta.updatedAt, {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[240px] flex-1">
          <Input
            type="password"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder={meta ? 'Colar novo token para substituir' : 'Colar o token da Avisa'}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <Button size="sm" onClick={() => void salvar()} disabled={salvando || !valor.trim()}>
          {salvando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          {meta ? 'Substituir' : 'Guardar'}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        O token é criptografado no cofre da plataforma e marcado como “só de servidor”.
        Esta tela grava, mas nunca consegue lê-lo de volta — nem para você.
      </p>
    </div>
  )
}
