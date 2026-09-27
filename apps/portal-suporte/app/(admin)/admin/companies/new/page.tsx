'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { arara } from '@/lib/arara/client'
import { AdminHeader } from '@/components/admin/admin-header'
import { useAuth } from '@/lib/arara/AuthProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function NewCompanyPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    cnpj: '',
    contact_email: '',
    phone: '',
    city: '',
    state: '',
  })

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const created = await arara.createCompany({
        ...form,
        active: true,
      })
      router.push(`/admin/companies/_/?id=${encodeURIComponent(created.id)}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col">
      <AdminHeader user={{ email: user?.email, fullName: user?.name || user?.email }} />
      <main className="mx-auto w-full max-w-xl space-y-4 p-4 lg:p-6">
        <Link href="/admin/companies" className="text-sm text-primary hover:underline">
          ← Empresas
        </Link>
        <h1 className="text-2xl font-bold">Nova empresa</h1>
        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">{error}</div>
        )}
        <form onSubmit={onSubmit} className="space-y-3 rounded-xl bg-card p-5 shadow-[var(--shadow-media)]">
          {(
            [
              ['name', 'Nome'],
              ['cnpj', 'CNPJ'],
              ['contact_email', 'E-mail'],
              ['phone', 'Telefone'],
              ['city', 'Cidade'],
              ['state', 'UF'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block space-y-1 text-sm">
              <Label>{label}</Label>
              <Input
                required={key === 'name'}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </label>
          ))}
          <Button type="submit" disabled={busy}>
            {busy ? 'Salvando…' : 'Criar'}
          </Button>
        </form>
      </main>
    </div>
  )
}
