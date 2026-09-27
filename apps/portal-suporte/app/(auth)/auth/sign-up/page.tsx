'use client'

// =============================================================================
// Criar conta.
//
// A tela anterior mandava tudo para `POST /api/auth/register` — que é um stub
// devolvendo **501**. Ninguém nunca conseguiu criar conta por aqui, e é por
// isso que o código de convite "não funcionava": ele era enviado num corpo que
// o servidor recusava antes de olhar.
//
// Criar conta são DUAS coisas, e é por isso que a tela tem passos:
//
//   1. a IDENTIDADE, que mora na plataforma (`POST /v1/auth/register` +
//      `/v1/auth/login`) e é compartilhada por todos os apps da Arara;
//   2. o ACESSO AO PORTAL, que é o `Profile` deste app — sem ele a pessoa
//      loga e não vê nada.
//
// Quem concede o acesso depende de quem está entrando:
//
//   operador  código de 6 caracteres emitido por um admin →
//             `POST /auth/convite/resgatar`, que valida e grava o papel do
//             convite. O papel vem do convite, nunca do que a tela pede.
//   cliente   confirma o WhatsApp (código de 6 dígitos) e informa o CNPJ da
//             empresa → `POST /auth/cliente/confirmar`. O WhatsApp prova a
//             PESSOA; o CNPJ diz de qual empresa ela é. Casar pelo telefone
//             não serve: cada loja tem várias pessoas usando o suporte.
//
// As duas rotas exigem sessão — por isso o login acontece no meio do fluxo,
// antes do resgate. Se o passo 2 falhar, a conta da plataforma já existe:
// `contaPronta` evita tentar registrar de novo (o e-mail já estaria em uso) e
// deixa a pessoa repetir só o que faltou.
// =============================================================================

import { useState } from 'react'
import Link from 'next/link'
import {
  Headphones, Eye, EyeOff, ArrowRight, ArrowLeft, Loader2, User,
  AlertCircle, MessageCircle, Building2, KeyRound, CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { arara, araraFetch, AraraError } from '@/lib/arara/client'
import { hasMinRole } from '@/lib/arara/auth-storage'

type Tipo = 'cliente' | 'operador'
type Passo = 'dados' | 'convite' | 'whatsapp' | 'codigo' | 'pronto'

import { mascaraTelefone , telefoneCompleto } from '@/lib/utils'

const soDigitos = (v: string) => v.replace(/\D/g, '')

/** 00.000.000/0000-00 enquanto digita — o cadastro tem as duas grafias e o
    servidor compara só os dígitos, então a máscara é conforto, não regra. */
function mascaraCnpj(v: string) {
  const d = soDigitos(v).slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}

function mensagem(e: unknown, padrao: string) {
  if (e instanceof AraraError) return e.message
  return e instanceof Error ? e.message : padrao
}

export default function SignUpPage() {
  const [tipo, setTipo] = useState<Tipo>('cliente')
  const [passo, setPasso] = useState<Passo>('dados')

  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [verSenha, setVerSenha] = useState(false)
  const [codigoConvite, setCodigoConvite] = useState('')
  const [telefone, setTelefone] = useState('')
  const [codigoWa, setCodigoWa] = useState('')
  const [cnpj, setCnpj] = useState('')

  const [contaPronta, setContaPronta] = useState(false)
  const [empresa, setEmpresa] = useState<string | null>(null)
  const [destino, setDestino] = useState('/dashboard')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  /**
   * Cria a identidade e deixa a sessão aberta. Idempotente do ponto de vista
   * da pessoa: se ela já registrou numa tentativa anterior (ou já tinha conta
   * na plataforma, o que é comum — a identidade é compartilhada entre os apps
   * da Arara), cai direto no login com a mesma senha.
   */
  async function garantirConta() {
    if (contaPronta) return
    try {
      await arara.register(email.trim().toLowerCase(), senha, nome.trim())
    } catch (e) {
      // SÓ o 409 significa "e-mail já existe" (sondado em 20/08: a plataforma
      // devolve 409 {"error":"Email already registered"}). O 400 é VALIDAÇÃO —
      // senha curta, por exemplo — e engoli-lo aqui mandava a pessoa para um
      // login impossível, que respondia o "Invalid credentials" mentiroso.
      // Foi o que quebrou o Criar conta por semanas.
      const conflito = e instanceof AraraError && e.status === 409
      if (!conflito) {
        if (e instanceof AraraError && /at least 8/i.test(e.message)) {
          throw new Error('A senha precisa ter pelo menos 8 caracteres.')
        }
        throw e
      }
      // E-mail já existe: só serve se a senha for a mesma. O login abaixo é
      // quem decide.
    }
    try {
      await arara.login(email.trim().toLowerCase(), senha)
    } catch (e) {
      if (e instanceof AraraError && (e.status === 401 || e.status === 400)) {
        throw new Error(
          'Este e-mail já tem conta na Arara e a senha não confere. Use a senha ' +
          'que você já usa nos sistemas Arara — a conta é a mesma para todos.',
        )
      }
      throw e
    }
    setContaPronta(true)
  }

  const submeterDados = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    setOcupado(true)
    try {
      await garantirConta()
      setPasso(tipo === 'operador' ? 'convite' : 'whatsapp')
    } catch (err) {
      setErro(mensagem(err, 'Não foi possível criar a conta.'))
    } finally {
      setOcupado(false)
    }
  }

  const resgatarConvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    setOcupado(true)
    try {
      const r = await araraFetch.post<{ data?: { role?: string } }>(
        '/api/auth/convite/resgatar',
        // O telefone entra aqui porque é por ele que a recuperação de senha
        // acontece depois (código no WhatsApp). Sem número no cadastro, a
        // pessoa fica sem caminho de volta se esquecer a senha.
        { code: codigoConvite.trim().toUpperCase(), phone: soDigitos(telefone) },
      )
      const papel = r?.data?.role ?? 'support'
      setDestino(hasMinRole(papel, 'support') ? '/admin' : '/dashboard')
      setPasso('pronto')
    } catch (err) {
      setErro(mensagem(err, 'Não foi possível validar o código.'))
    } finally {
      setOcupado(false)
    }
  }

  const enviarCodigo = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    setAviso(null)
    setOcupado(true)
    try {
      await araraFetch.post('/api/auth/cliente/codigo', { phone: soDigitos(telefone) })
      setAviso(`Código enviado no WhatsApp final ${soDigitos(telefone).slice(-4)}. Vale por 10 minutos.`)
      setPasso('codigo')
    } catch (err) {
      setErro(mensagem(err, 'Não foi possível enviar o código.'))
    } finally {
      setOcupado(false)
    }
  }

  const confirmarCliente = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    setOcupado(true)
    try {
      const r = await araraFetch.post<{ data?: { company?: string } }>(
        '/api/auth/cliente/confirmar',
        { phone: soDigitos(telefone), code: codigoWa.trim(), cnpj: soDigitos(cnpj) },
      )
      setEmpresa(r?.data?.company ?? null)
      setDestino('/dashboard')
      setPasso('pronto')
    } catch (err) {
      setErro(mensagem(err, 'Não foi possível confirmar o cadastro.'))
    } finally {
      setOcupado(false)
    }
  }

  // Navegação dura de propósito: o provedor de sessão lê o papel no carregar,
  // e o `Profile` acabou de nascer. Um push de rota entraria com o papel antigo
  // em memória e a pessoa veria a tela vazia que o cadastro deveria evitar.
  const entrar = () => window.location.assign(destino)

  const passos: Passo[] = tipo === 'operador' ? ['dados', 'convite'] : ['dados', 'whatsapp', 'codigo']
  const indice = passos.indexOf(passo)

  return (
    <div className="min-h-screen flex">
      {/* Painel de marca */}
      <div className="hidden lg:flex lg:w-1/2 bg-sidebar flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-indigo-600/20 blur-3xl" />
          <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-indigo-800/20 blur-3xl" />
        </div>

        <div className="relative flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
            <Headphones className="w-5 h-5 text-white" />
          </div>
          <span className="text-white font-semibold text-lg">Portal Suporte</span>
        </div>

        <div className="relative">
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Crie sua conta<br />e comece agora
          </h1>
          <p className="text-white/60 text-lg leading-relaxed">
            {tipo === 'operador'
              ? <>Use o código de convite que o<br />administrador enviou para você.</>
              : <>Confirme seu WhatsApp e o CNPJ<br />da empresa para liberar o acesso.</>}
          </p>

          <div className="mt-10 space-y-3">
            {(tipo === 'operador'
              ? ['Fila de chamados e quadro Kanban', 'Atendimento com histórico completo', 'Cadastro de empresas e filiais', 'Relatórios da operação']
              : ['Abertura ilimitada de chamados', 'Acompanhamento em tempo real', 'Histórico completo de atendimentos', 'Avisos pelo WhatsApp']
            ).map((item) => (
              <div key={item} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-3 h-3 text-white" />
                </div>
                <p className="text-white/50 text-sm">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-white/40 text-sm">© 2025 Arara Tech. Todos os direitos reservados.</p>
      </div>

      {/* Formulário */}
      <div className="flex-1 flex items-center justify-center p-6 bg-muted/50 overflow-y-auto">
        <div className="w-full max-w-md py-8">
          <div className="flex items-center gap-2.5 mb-8 lg:hidden">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center">
              <Headphones className="w-[18px] h-[18px] text-white" />
            </div>
            <span className="text-foreground font-semibold text-lg">Portal Suporte</span>
          </div>

          {passo === 'pronto' ? (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sem-success border border-sem-success-bd">
                <CheckCircle2 className="h-7 w-7 text-sem-success-fg" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-1">Conta liberada</h2>
              <p className="text-muted-foreground text-sm mb-6">
                {empresa
                  ? <>Seu acesso foi vinculado a <strong className="text-foreground">{empresa}</strong>.</>
                  : 'Seu acesso ao portal está ativo.'}
              </p>
              <Button onClick={entrar} className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-medium">
                Entrar no portal <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-foreground mb-1">Criar conta</h2>
              <p className="text-muted-foreground text-sm mb-6">
                {passo === 'dados' && 'Comece pelos seus dados de acesso'}
                {passo === 'convite' && 'Agora informe o código que o administrador enviou'}
                {passo === 'whatsapp' && 'Vamos confirmar seu WhatsApp'}
                {passo === 'codigo' && 'Digite o código recebido e o CNPJ da sua empresa'}
              </p>

              {/* Trilha dos passos */}
              <div className="mb-6 flex items-center gap-2">
                {passos.map((p, i) => (
                  <div
                    key={p}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      i <= indice ? 'bg-indigo-600' : 'bg-border'
                    }`}
                  />
                ))}
                <span className="ml-1 text-xs text-muted-foreground tabular-nums">
                  {indice + 1}/{passos.length}
                </span>
              </div>

              {passo === 'dados' && (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-6">
                    <button
                      type="button"
                      onClick={() => setTipo('cliente')}
                      className={`flex flex-col items-center gap-2 rounded-xl border-2 px-4 py-4 text-sm font-medium transition-all ${
                        tipo === 'cliente'
                          ? 'border-indigo-600 bg-indigo-600/10 text-indigo-600'
                          : 'border-border bg-background text-muted-foreground hover:border-indigo-600/40'
                      }`}
                    >
                      <User className="h-5 w-5" />
                      <span>Sou cliente</span>
                      <span className="text-xs font-normal text-muted-foreground">Abrir chamados</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTipo('operador')}
                      className={`flex flex-col items-center gap-2 rounded-xl border-2 px-4 py-4 text-sm font-medium transition-all ${
                        tipo === 'operador'
                          ? 'border-indigo-600 bg-indigo-600/10 text-indigo-600'
                          : 'border-border bg-background text-muted-foreground hover:border-indigo-600/40'
                      }`}
                    >
                      <Headphones className="h-5 w-5" />
                      <span>Sou da equipe</span>
                      <span className="text-xs font-normal text-muted-foreground">Preciso de um convite</span>
                    </button>
                  </div>

                  <form onSubmit={submeterDados} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="nome" className="font-medium">Nome completo</Label>
                      <Input
                        id="nome" required value={nome} onChange={(e) => setNome(e.target.value)}
                        placeholder="Seu nome completo" autoComplete="name" className="h-11"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="font-medium">E-mail</Label>
                      <Input
                        id="email" type="email" required value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seu@email.com" autoComplete="email" className="h-11"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="senha" className="font-medium">Senha</Label>
                      <div className="relative">
                        <Input
                          id="senha" type={verSenha ? 'text' : 'password'} required minLength={8}
                          value={senha} onChange={(e) => setSenha(e.target.value)}
                          placeholder="Mínimo 8 caracteres" autoComplete="new-password"
                          className="h-11 pr-10"
                        />
                        <button
                          type="button" onClick={() => setVerSenha(!verSenha)}
                          aria-label={verSenha ? 'Ocultar senha' : 'Mostrar senha'}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {verSenha ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Esta é a sua senha da Arara Tech — vale para os outros sistemas também.
                      </p>
                    </div>

                    {erro && <Erro texto={erro} />}

                    <Button type="submit" disabled={ocupado}
                      className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-medium">
                      {ocupado ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <><span>Continuar</span> <ArrowRight className="w-4 h-4 ml-1.5" /></>}
                    </Button>
                  </form>
                </>
              )}

              {passo === 'convite' && (
                <form onSubmit={resgatarConvite} className="space-y-4">
                  <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                    O código tem 6 caracteres e é gerado por um administrador em
                    <span className="text-foreground"> Configurações › Convites</span>. Ele define o seu
                    nível de acesso e só pode ser usado uma vez.
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="tel-op" className="font-medium">Seu WhatsApp (com DDD)</Label>
                    <div className="relative">
                      <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="tel-op" required inputMode="numeric" value={telefone}
                        onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
                        placeholder="(11) 91234-5678" className="h-11 pl-9"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      É por aqui que você recupera o acesso se esquecer a senha.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="convite" className="font-medium">Código de convite</Label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="convite" required value={codigoConvite}
                        onChange={(e) => setCodigoConvite(e.target.value.toUpperCase().slice(0, 6))}
                        placeholder="A1B2C3" autoComplete="one-time-code"
                        className="h-12 pl-9 text-center text-lg font-mono tracking-[0.4em]"
                      />
                    </div>
                  </div>

                  {erro && <Erro texto={erro} />}

                  <Button type="submit" disabled={ocupado || codigoConvite.length !== 6 || !telefoneCompleto(telefone)}
                    className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-medium">
                    {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Liberar meu acesso'}
                  </Button>
                  <Voltar onClick={() => { setErro(null); setPasso('dados') }} />
                </form>
              )}

              {passo === 'whatsapp' && (
                <form onSubmit={enviarCodigo} className="space-y-4">
                  <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                    Enviamos um código de 6 dígitos para o seu WhatsApp. Pode ser o seu número
                    pessoal — ele confirma quem é você, não a empresa.
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="tel" className="font-medium">Seu WhatsApp (com DDD)</Label>
                    <div className="relative">
                      <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="tel" required inputMode="numeric" value={telefone}
                        onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
                        placeholder="(11) 91234-5678" className="h-11 pl-9"
                      />
                    </div>
                  </div>

                  {erro && <Erro texto={erro} />}

                  <Button type="submit" disabled={ocupado || !telefoneCompleto(telefone)}
                    className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-medium">
                    {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar código no WhatsApp'}
                  </Button>
                  <Voltar onClick={() => { setErro(null); setPasso('dados') }} />
                </form>
              )}

              {passo === 'codigo' && (
                <form onSubmit={confirmarCliente} className="space-y-4">
                  {aviso && (
                    <div className="flex items-start gap-2.5 rounded-lg border border-sem-info-bd bg-sem-info p-3 text-sm text-sem-info-fg">
                      <MessageCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      {aviso}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="codigo" className="font-medium">Código recebido</Label>
                    <Input
                      id="codigo" required inputMode="numeric" value={codigoWa}
                      onChange={(e) => setCodigoWa(soDigitos(e.target.value).slice(0, 6))}
                      placeholder="000000" autoComplete="one-time-code"
                      className="h-12 text-center text-lg font-mono tracking-[0.4em]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cnpj" className="font-medium">CNPJ da sua empresa</Label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="cnpj" required inputMode="numeric" value={cnpj}
                        onChange={(e) => setCnpj(mascaraCnpj(e.target.value))}
                        placeholder="00.000.000/0000-00" className="h-11 pl-9"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      É por aqui que sabemos de qual empresa (ou filial) você é. Se o CNPJ ainda não
                      estiver no nosso cadastro, fale com o suporte da Arara.
                    </p>
                  </div>

                  {erro && <Erro texto={erro} />}

                  <Button type="submit" disabled={ocupado || codigoWa.length !== 6 || soDigitos(cnpj).length !== 14}
                    className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-medium">
                    {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirmar e liberar acesso'}
                  </Button>
                  <Voltar
                    rotulo="Usar outro número"
                    onClick={() => { setErro(null); setAviso(null); setCodigoWa(''); setPasso('whatsapp') }}
                  />
                </form>
              )}
            </>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Já tem uma conta?{' '}
            <Link href="/auth/login" className="font-medium text-indigo-600 hover:text-indigo-700">
              Fazer login
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

function Erro({ texto }: { texto: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-sem-error-bd bg-sem-error p-3 text-sm text-sem-error-fg">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{texto}</span>
    </div>
  )
}

function Voltar({ onClick, rotulo = 'Voltar' }: { onClick: () => void; rotulo?: string }) {
  return (
    <button
      type="button" onClick={onClick}
      className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" /> {rotulo}
    </button>
  )
}
