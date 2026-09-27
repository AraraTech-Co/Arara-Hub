'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/arara'

export default function LoginPage() {
  const { ready, user, login } = useAuth()
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (ready && user) window.location.replace('/hub/')
  }, [ready, user])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setErr('')
    try {
      await login(email.trim(), pass)
      window.location.replace('/hub/')
    } catch (e) {
      setErr((e as Error).message || 'E-mail ou senha inválidos')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-center bg-slate-900 text-white p-12">
        <div className="flex items-center gap-3 mb-10">
          <span className="inline-grid place-items-center h-10 w-10 rounded-xl bg-indigo-600 font-bold text-lg">A</span>
          <span className="text-xl font-semibold">Arara Hub</span>
        </div>
        <h1 className="text-3xl font-bold leading-tight">Todos os sistemas da Arara,<br />num só lugar.</h1>
        <p className="text-slate-400 mt-4 max-w-sm">Um login só. Entre e escolha para onde ir.</p>
      </div>

      <div className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div className="flex items-center gap-2 lg:hidden mb-2">
            <span className="inline-grid place-items-center h-8 w-8 rounded-lg bg-indigo-600 text-white font-bold">A</span>
            <span className="text-lg font-semibold text-slate-900">Arara Hub</span>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Bem-vindo</h2>
            <p className="text-slate-500 text-sm">Entre com suas credenciais.</p>
          </div>
          {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm" placeholder="seu@arara-tech.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
            <input value={pass} onChange={(e) => setPass(e.target.value)} type="password" required
              className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm" />
          </div>
          <button disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium py-2.5 rounded-lg">
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
