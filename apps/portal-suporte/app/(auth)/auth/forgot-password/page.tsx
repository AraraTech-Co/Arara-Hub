'use client'

// =============================================================================
// Esqueci a senha — recuperação por WhatsApp (destravada em 20/08/2026).
//
// O código vai para o WhatsApp DO CADASTRO (conferido na criação da conta),
// nunca para um número digitado agora — é o que separa recuperação de
// sequestro de conta. Quem grava a senha nova é a plataforma (bcrypt); o
// portal não guarda senha em lugar nenhum.
//
// Servidor: POST /auth/senha/solicitar e /auth/senha/redefinir
// (scripts/senha-recuperacao-whatsapp.py). A resposta do "solicitar" é sempre
// genérica — esta tela não confirma se um e-mail existe.
// =============================================================================

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { araraFetch, AraraError } from '@/lib/arara/client'

// A plataforma não tem rota pública: só `actor` (exige login) e `webhook_secret`
// (valida ?token=). Quem esqueceu a senha NÃO está logado, então estas rotas
// usam webhook_secret com um token PÚBLICO constante — ele só satisfaz o modo
// da plataforma; a segurança real é do controller (resposta genérica, código no
// WhatsApp do cadastro, expiração, tentativas). Provisionado pela tela de
// Membros junto com a portal_api_key.
const TOKEN_PUBLICO = 'portal-suporte-recuperacao-publica'

type Passo = 'email' | 'codigo' | 'pronto' | 'encaminhado'

export default function ForgotPasswordPage() {
  const [passo, setPasso] = useState<Passo>('email')
  const [email, setEmail] = useState('')
  const [codigo, setCodigo] = useState('')
  const [senha, setSenha] = useState('')
  const [senha2, setSenha2] = useState('')
  const [erro, setErro] = useState('')
  const [recado, setRecado] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const solicitar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(''); setOcupado(true)
    try {
      await araraFetch.post(`/api/auth/senha/solicitar?token=${TOKEN_PUBLICO}`, { email: email.trim() }, )
      setPasso('codigo')
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível enviar. Tente novamente.')
    } finally {
      setOcupado(false)
    }
  }

  const redefinir = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    if (senha !== senha2) { setErro('As senhas não conferem.'); return }
    setOcupado(true)
    try {
      await araraFetch.post(`/api/auth/senha/redefinir?token=${TOKEN_PUBLICO}`, {
        email: email.trim(), codigo: codigo.trim(), senha,
      })
      setPasso('pronto')
    } catch (err) {
      // 503 = identidade CONFIRMADA, mas a gravação automática depende de uma
      // liberação da plataforma. O servidor já avisou os administradores; aqui
      // isso vira um desfecho, não um erro sem saída.
      if (err instanceof AraraError && err.status === 503) {
        setRecado(err.message)
        setPasso('encaminhado')
        return
      }
      setErro(err instanceof Error ? err.message : 'Não foi possível redefinir. Tente novamente.')
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
        <Link href="/auth/login" className="mb-6 inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Voltar ao login
        </Link>

        {passo === 'email' && (
          <form onSubmit={solicitar} className="space-y-4">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-bold text-foreground">Esqueci a senha</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Enviamos um código de 6 dígitos para o <strong>WhatsApp do seu cadastro</strong>.
              Se o seu cadastro não tem WhatsApp, peça a um administrador para redefinir
              sua senha na tela de Membros.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail da conta</Label>
              <Input id="email" type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="voce@arara-tech.com" />
            </div>
            {erro && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{erro}</p>}
            <Button type="submit" className="w-full" disabled={ocupado}>
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar código'}
            </Button>
          </form>
        )}

        {passo === 'codigo' && (
          <form onSubmit={redefinir} className="space-y-4">
            <h1 className="text-xl font-bold text-foreground">Digite o código</h1>
            <p className="text-sm text-muted-foreground">
              Se <strong>{email}</strong> tiver cadastro com WhatsApp, o código chegou lá.
              Ele vale por 10 minutos.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="codigo">Código de 6 dígitos</Label>
              <Input id="codigo" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required
                value={codigo} onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
                className="text-center text-lg tracking-[0.5em]" placeholder="000000" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="senha">Nova senha (mín. 8 caracteres)</Label>
              <Input id="senha" type="password" required minLength={8} value={senha}
                onChange={(e) => setSenha(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="senha2">Confirme a nova senha</Label>
              <Input id="senha2" type="password" required minLength={8} value={senha2}
                onChange={(e) => setSenha2(e.target.value)} />
            </div>
            {erro && <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">{erro}</p>}
            <Button type="submit" className="w-full" disabled={ocupado}>
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Redefinir senha'}
            </Button>
            <button type="button" onClick={() => setPasso('email')}
              className="w-full text-center text-xs text-muted-foreground hover:text-foreground">
              Não chegou? Enviar de novo
            </button>
          </form>
        )}

        {passo === 'encaminhado' && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold text-foreground">Identidade confirmada</h1>
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              {recado}
            </p>
            <p className="text-sm text-muted-foreground">
              Você não precisa fazer mais nada: a equipe foi avisada e vai te passar a
              senha nova. Se for urgente, fale com o suporte pelo WhatsApp de sempre.
            </p>
            <Link href="/auth/login">
              <Button variant="outline" className="w-full">Voltar ao login</Button>
            </Link>
          </div>
        )}

        {passo === 'pronto' && (
          <div className="space-y-4 text-center">
            <h1 className="text-xl font-bold text-foreground">Senha redefinida</h1>
            <p className="text-sm text-muted-foreground">
              Sua senha nova já vale — em todos os sistemas Arara.
            </p>
            <Link href="/auth/login">
              <Button className="w-full">Entrar</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
