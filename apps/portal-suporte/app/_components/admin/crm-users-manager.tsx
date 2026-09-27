'use client'

// =============================================================================
// Usuários do CRM, administrados a partir do Portal de Suporte.
//
// PRD: portal-crm/docs/plans/PRD-hub-login-central-e-admin-crm.md
//
// Tela PRÓPRIA e não uma aba dentro de `users-manager.tsx`: aquele arquivo já
// passa de mil linhas misturando UI, busca e regra, e a diretriz do projeto é
// não engordar os gigantes. São públicos diferentes (equipe do suporte × equipe
// do CRM) e credenciais diferentes.
//
// LIMITE CONHECIDO (caminho A do PRD): as rotas do CRM só aceitam o JWT de quem
// é ADMIN no CRM. Master do suporte sem Profile de CRM recebe 403 — a tela diz
// isso com todas as letras, porque "erro ao carregar" mandaria a pessoa
// procurar defeito onde não há.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Building2, Copy, Check, KeyRound, Search, ShieldAlert, UserPlus, X, LogIn,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import {
  crmApi, gerarSenha, papelDePlataforma, SemAcessoAoCrm, type MembroCrm,
} from '@/lib/api/crm'
import { mascaraTelefone, soDigitosTelefone } from '@/lib/utils'

const PAPEIS = [
  { valor: 'vendedor', rotulo: 'Vendedor' },
  { valor: 'gerente', rotulo: 'Gerente' },
  { valor: 'admin', rotulo: 'Administrador' },
]

const CLASSE_PAPEL: Record<string, string> = {
  vendedor: 'bg-muted text-muted-foreground',
  gerente: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  admin: 'bg-red-500/15 text-red-600 dark:text-red-400',
}

export function CrmUsersManager() {
  const { toast } = useToast()
  const [membros, setMembros] = useState<MembroCrm[]>([])
  const [carregando, setCarregando] = useState(true)
  const [semAcesso, setSemAcesso] = useState(false)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [criando, setCriando] = useState(false)
  const [senhaDe, setSenhaDe] = useState<MembroCrm | null>(null)
  // Quem TEM ACESSO ao app na plataforma (AppMembership). É outra coisa do que
  // ter Profile: o Profile é o cadastro dentro do CRM, o membership é o que faz
  // a pessoa conseguir entrar — e o card aparecer no Arara Hub.
  const [comAcesso, setComAcesso] = useState<Set<string> | null>(null)

  const carregar = useCallback(() => {
    setCarregando(true)
    void crmApi.acessos().then(setComAcesso).catch(() => setComAcesso(null))
    crmApi
      .listar()
      .then((lista) => { setMembros(lista); setSemAcesso(false); setErro('') })
      .catch((e) => {
        if (e instanceof SemAcessoAoCrm) setSemAcesso(true)
        else setErro(e instanceof Error ? e.message : String(e))
      })
      .finally(() => setCarregando(false))
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return membros
    return membros.filter((m) =>
      String(m.fullName || '').toLowerCase().includes(termo)
      || String(m.email || '').toLowerCase().includes(termo))
  }, [membros, busca])

  async function mudar(m: MembroCrm, mudancas: Parameters<typeof crmApi.editar>[1]) {
    // Otimista: a lista responde na hora e volta atrás se o servidor recusar.
    const antes = membros
    setMembros((atual) => atual.map((x) => (x.id === m.id ? { ...x, ...mudancas } : x)))
    try {
      await crmApi.editar(m.id, mudancas)
    } catch (e) {
      setMembros(antes)
      toast({
        title: 'Não foi possível salvar',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    }
  }

  if (semAcesso) {
    return (
      <div className="p-6">
        <div className="max-w-xl rounded-xl border border-sem-warning-bd bg-sem-warning p-5">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert className="w-4 h-4 text-sem-warning-fg shrink-0" />
            <h2 className="font-semibold text-sem-warning-fg text-sm">
              Sua conta não é administradora do CRM
            </h2>
          </div>
          <p className="text-sm text-sem-warning-fg">
            Esta tela administra usuários de <strong>outro</strong> sistema, o CRM, e ele
            reconhece quem é administrador <em>lá dentro</em> — ser master aqui no Portal de
            Suporte não basta. Peça a um administrador do CRM para dar esse papel à sua conta,
            ou peça a ele que faça a alteração.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Building2 className="w-6 h-6 text-indigo-500" />
            Usuários do CRM
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {membros.length} pessoa(s) com acesso ao CRM. A senha é a mesma de todos os
            sistemas Arara — redefinir aqui vale em todos.
          </p>
        </div>
        <button
          onClick={() => setCriando(true)}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg"
        >
          <UserPlus className="w-4 h-4" />
          Novo usuário do CRM
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou e-mail"
          className="w-full h-9 rounded-lg border border-border bg-background pl-9 pr-3 text-sm"
        />
      </div>

      {erro && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-600 dark:text-red-400">
          {erro}
        </div>
      )}

      {carregando ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : visiveis.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {busca ? 'Ninguém com esse nome.' : 'Nenhum usuário do CRM ainda.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-background overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Pessoa</th>
                <th className="px-4 py-2 font-medium">Papel no CRM</th>
                <th className="px-4 py-2 font-medium">WhatsApp</th>
                <th className="px-4 py-2 font-medium">Ativo</th>
                <th className="px-4 py-2 font-medium">Acesso ao CRM</th>
                <th className="px-4 py-2 font-medium text-right">Senha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visiveis.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-2.5">
                    <span className="block text-foreground">{m.fullName || '—'}</span>
                    <span className="block text-xs text-muted-foreground">{m.email}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={String(m.role || 'vendedor')}
                      onChange={(e) => void mudar(m, { role: e.target.value })}
                      className={`h-8 rounded-lg border border-border px-2 text-xs font-medium ${CLASSE_PAPEL[String(m.role)] || ''}`}
                    >
                      {PAPEIS.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2.5">
                    <TelefoneEditavel membro={m} aoSalvar={(phone) => void mudar(m, { phone })} />
                  </td>
                  <td className="px-4 py-2.5">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={m.active !== false}
                        onChange={(e) => void mudar(m, { active: e.target.checked })}
                      />
                      <span className="text-xs text-muted-foreground">
                        {m.active === false ? 'Inativo' : 'Ativo'}
                      </span>
                    </label>
                  </td>
                  <td className="px-4 py-2.5">
                    <AcessoDaPessoa
                      membro={m}
                      comAcesso={comAcesso}
                      aoMudar={() => void crmApi.acessos().then(setComAcesso).catch(() => {})}
                    />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => setSenhaDe(m)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground"
                    >
                      <KeyRound className="w-3.5 h-3.5" /> Redefinir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {criando && (
        <NovoUsuarioDialog
          onFechar={() => setCriando(false)}
          onCriado={() => { setCriando(false); carregar() }}
        />
      )}
      {senhaDe && (
        <SenhaDialog membro={senhaDe} onFechar={() => setSenhaDe(null)} />
      )}
    </div>
  )
}

/**
 * Acesso ao app na plataforma (AppMembership) — diferente do Profile.
 *
 * Profile = cadastro dentro do CRM (papel, telefone). Membership = o direito de
 * entrar. Até 28/08 a tela criava só o primeiro, e a pessoa aparecia na equipe
 * do CRM sem conseguir entrar — nem via o card no Arara Hub. A coluna existe
 * para esse descompasso ficar visível em vez de ser descoberto pelo usuário.
 */
function AcessoDaPessoa({
  membro,
  comAcesso,
  aoMudar,
}: {
  membro: MembroCrm
  comAcesso: Set<string> | null
  aoMudar: () => void
}) {
  const { toast } = useToast()
  const [ocupado, setOcupado] = useState(false)

  // `null` = não foi possível listar (sem permissão de admin no CRM, por
  // exemplo). Melhor não afirmar nada do que afirmar errado.
  if (comAcesso === null) return <span className="text-xs text-muted-foreground">—</span>

  const tem = comAcesso.has(membro.id)

  async function alternar() {
    setOcupado(true)
    try {
      if (tem) {
        if (!window.confirm(`Tirar o acesso de ${membro.fullName || membro.email} ao CRM? A conta e o cadastro continuam; ela só deixa de entrar.`)) return
        await crmApi.tirarAcesso(membro.id)
      } else {
        await crmApi.darAcesso(membro.id, papelDePlataforma(String(membro.role)))
      }
      aoMudar()
    } catch (e) {
      toast({
        title: 'Não foi possível mudar o acesso',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      })
    } finally {
      setOcupado(false)
    }
  }

  return tem ? (
    <button
      onClick={alternar}
      disabled={ocupado}
      title="Tirar o acesso ao CRM"
      className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:underline disabled:opacity-40 dark:text-emerald-400"
    >
      <Check className="w-3.5 h-3.5" /> tem acesso
    </button>
  ) : (
    <button
      onClick={alternar}
      disabled={ocupado}
      className="inline-flex items-center gap-1 rounded-lg border border-amber-500/50 px-2 py-1 text-xs text-amber-600 hover:bg-amber-500/10 disabled:opacity-40 dark:text-amber-400"
    >
      <LogIn className="w-3 h-3" /> {ocupado ? 'dando…' : 'dar acesso'}
    </button>
  )
}

/** Telefone com máscara, salvo só ao sair do campo — não a cada tecla. */
function TelefoneEditavel({ membro, aoSalvar }: { membro: MembroCrm; aoSalvar: (v: string) => void }) {
  const [valor, setValor] = useState(mascaraTelefone(String(membro.phone || '')))
  useEffect(() => { setValor(mascaraTelefone(String(membro.phone || ''))) }, [membro.phone])
  return (
    <input
      value={valor}
      onChange={(e) => setValor(mascaraTelefone(e.target.value))}
      onBlur={() => {
        const limpo = soDigitosTelefone(valor)
        if (limpo !== soDigitosTelefone(String(membro.phone || ''))) aoSalvar(limpo)
      }}
      placeholder="(19) 99999-9999"
      className="h-8 w-40 rounded-lg border border-border bg-background px-2 text-xs"
    />
  )
}

function CampoSenha({ senha }: { senha: string }) {
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2 font-mono text-sm">
        {senha}
      </code>
      <button
        onClick={() => {
          void navigator.clipboard.writeText(senha)
          setCopiado(true)
          setTimeout(() => setCopiado(false), 2000)
        }}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2 py-2 text-xs text-foreground/70 hover:bg-muted"
      >
        {copiado ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  )
}

function NovoUsuarioDialog({ onFechar, onCriado }: { onFechar: () => void; onCriado: () => void }) {
  const { toast } = useToast()
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [role, setRole] = useState('vendedor')
  const [senha, setSenha] = useState(gerarSenha())
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState(false)

  async function salvar() {
    setErro('')
    if (!nome.trim() || !email.trim()) { setErro('Nome e e-mail são obrigatórios.'); return }
    if (senha.length < 8) { setErro('A senha precisa ter ao menos 8 caracteres.'); return }
    setSalvando(true)
    try {
      const r = await crmApi.criar({
        email: email.trim().toLowerCase(),
        nome: nome.trim(),
        senha,
        role,
        phone: soDigitosTelefone(telefone),
      })
      setPronto(true)
      if (r.jaExistia) {
        toast({
          title: 'Conta já existia',
          description: 'A pessoa já tinha conta Arara; ela apenas ganhou acesso ao CRM. A senha antiga continua valendo.',
        })
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-semibold text-foreground text-sm">Novo usuário do CRM</h2>
          <button onClick={pronto ? onCriado : onFechar} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {pronto ? (
          <div className="p-5 space-y-3">
            <p className="text-sm text-foreground">
              Pronto. Anote a senha agora — ela não aparece de novo.
            </p>
            <CampoSenha senha={senha} />
            <p className="text-xs text-muted-foreground">
              Vale para todos os sistemas Arara, não só para o CRM.
            </p>
            <div className="flex justify-end pt-1">
              <button
                onClick={onCriado}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg"
              >
                Concluir
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Nome</label>
                <input
                  value={nome} onChange={(e) => setNome(e.target.value)}
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">E-mail</label>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Papel no CRM</label>
                  <select
                    value={role} onChange={(e) => setRole(e.target.value)}
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm"
                  >
                    {PAPEIS.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">WhatsApp</label>
                  <input
                    value={telefone}
                    onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
                    placeholder="(19) 99999-9999"
                    className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Senha inicial</label>
                <div className="flex items-center gap-2">
                  <input
                    value={senha} onChange={(e) => setSenha(e.target.value)}
                    className="flex-1 h-9 rounded-lg border border-border bg-background px-3 font-mono text-sm"
                  />
                  <button
                    onClick={() => setSenha(gerarSenha())}
                    className="h-9 px-3 rounded-lg border border-border text-xs text-foreground/70 hover:bg-muted"
                  >
                    Gerar
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Esta senha cria a identidade Arara da pessoa e vale em todos os portais.
                </p>
              </div>
              {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button onClick={onFechar} className="px-4 py-2 text-sm text-foreground/70 hover:text-foreground">
                Cancelar
              </button>
              <button
                onClick={salvar} disabled={salvando}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
              >
                {salvando ? 'Criando…' : 'Criar usuário'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function SenhaDialog({ membro, onFechar }: { membro: MembroCrm; onFechar: () => void }) {
  const { toast } = useToast()
  const [senha, setSenha] = useState(gerarSenha())
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState(false)

  async function salvar() {
    setErro('')
    if (senha.length < 8) { setErro('A senha precisa ter ao menos 8 caracteres.'); return }
    setSalvando(true)
    try {
      await crmApi.redefinirSenha(membro.id, senha)
      setPronto(true)
      toast({
        title: 'Senha redefinida',
        description: `${membro.fullName || membro.email} já pode entrar com a nova senha — em todos os sistemas Arara.`,
      })
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="font-semibold text-foreground text-sm">
            Redefinir senha · {membro.fullName || membro.email}
          </h2>
          <button onClick={onFechar} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          {/* Dito antes de agir, não depois: a senha não é "do CRM". */}
          <p className="text-sm text-foreground/70">
            A senha é da identidade Arara. Trocar aqui muda o acesso desta pessoa a
            <strong className="text-foreground"> todos </strong> os sistemas, inclusive este portal.
          </p>
          <div className="flex items-center gap-2">
            <input
              value={senha} onChange={(e) => setSenha(e.target.value)} disabled={pronto}
              className="flex-1 h-9 rounded-lg border border-border bg-background px-3 font-mono text-sm disabled:opacity-60"
            />
            {!pronto && (
              <button
                onClick={() => setSenha(gerarSenha())}
                className="h-9 px-3 rounded-lg border border-border text-xs text-foreground/70 hover:bg-muted"
              >
                Gerar
              </button>
            )}
          </div>
          {pronto && <CampoSenha senha={senha} />}
          {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button onClick={onFechar} className="px-4 py-2 text-sm text-foreground/70 hover:text-foreground">
            {pronto ? 'Fechar' : 'Cancelar'}
          </button>
          {!pronto && (
            <button
              onClick={salvar} disabled={salvando}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg"
            >
              {salvando ? 'Salvando…' : 'Redefinir'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
