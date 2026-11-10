'use client'

import { useState } from 'react'
import Link from 'next/link'
import { AraraError } from '@/lib/arara/client'
import { PORTES, cnpjValido, mascararCnpj, soDigitos } from '@/lib/cnpj'

export type ClienteValores = Record<string, unknown>

type Duplicado = { id: string; name: string }

type Props = {
  inicial?: ClienteValores
  rotuloSalvar?: string
  /** Grava; recebe `confirmarDuplicado` quando a pessoa escolhe salvar mesmo com CNPJ repetido. */
  salvar: (body: ClienteValores) => Promise<void>
  cancelar: () => void
}

const campo =
  'w-full h-11 px-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500'

function texto(v: unknown): string {
  return v == null ? '' : String(v)
}

export function ClienteForm({ inicial = {}, rotuloSalvar = 'Salvar', salvar, cancelar }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cnpj, setCnpj] = useState(mascararCnpj(inicial.cnpj))
  const [duplicado, setDuplicado] = useState<Duplicado | null>(null)
  const [pendente, setPendente] = useState<ClienteValores | null>(null)

  const cnpjErrado = soDigitos(cnpj) !== '' && !cnpjValido(cnpj)

  async function enviar(body: ClienteValores) {
    setLoading(true)
    setError('')
    try {
      await salvar(body)
    } catch (err) {
      if (err instanceof AraraError && err.status === 409 && err.body.duplicado) {
        setDuplicado(err.body.duplicado as Duplicado)
        setPendente(body)
      } else {
        setError(err instanceof Error ? err.message : 'Erro ao salvar cliente.')
      }
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (cnpjErrado) {
      setError('CNPJ inválido: confira os números.')
      return
    }
    const form = new FormData(e.currentTarget)
    const lojas = String(form.get('qtdLojas') ?? '').trim()
    setDuplicado(null)
    void enviar({
      name: form.get('name'),
      company: form.get('company'),
      email: form.get('email'),
      phone: form.get('phone'),
      type: form.get('type'),
      notes: form.get('notes'),
      tags: String(form.get('tags') ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      cnpj: soDigitos(cnpj),
      linkedinEmpresa: String(form.get('linkedinEmpresa') ?? '').trim(),
      linkedinDecisor: String(form.get('linkedinDecisor') ?? '').trim(),
      porte: form.get('porte') || '',
      qtdLojas: lojas === '' ? '' : Number(lojas),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}
      {duplicado && pendente && (
        <div role="alert" className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-4 py-3 space-y-2">
          <p>
            Já existe <strong>{duplicado.name}</strong> com este CNPJ.
          </p>
          <div className="flex gap-3">
            <Link href={`/clientes/view?id=${duplicado.id}`} className="font-medium underline">
              Abrir existente
            </Link>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setDuplicado(null)
                void enviar({ ...pendente, confirmarDuplicado: true })
              }}
              className="font-medium underline"
            >
              Salvar mesmo assim
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
          <input id="name" name="name" required defaultValue={texto(inicial.name)} className={campo} />
        </div>
        <div>
          <label htmlFor="company" className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
          <input id="company" name="company" defaultValue={texto(inicial.company)} className={campo} />
        </div>
        <div>
          <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
          <select id="type" name="type" defaultValue={texto(inicial.type) || 'lead'} className={campo}>
            <option value="lead">Lead</option>
            <option value="cliente">Cliente</option>
          </select>
        </div>
        <div>
          <label htmlFor="cnpj" className="block text-sm font-medium text-gray-700 mb-1">CNPJ</label>
          <input
            id="cnpj"
            name="cnpj"
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            value={cnpj}
            onChange={(e) => setCnpj(e.target.value)}
            onBlur={() => setCnpj(mascararCnpj(cnpj))}
            aria-invalid={cnpjErrado}
            className={campo}
          />
          {cnpjErrado && <p className="mt-1 text-xs text-red-600">CNPJ inválido</p>}
        </div>
        <div>
          <label htmlFor="porte" className="block text-sm font-medium text-gray-700 mb-1">Porte</label>
          <select id="porte" name="porte" defaultValue={texto(inicial.porte)} className={campo}>
            <option value="">—</option>
            {PORTES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="qtdLojas" className="block text-sm font-medium text-gray-700 mb-1">Nº de lojas</label>
          <input id="qtdLojas" name="qtdLojas" type="number" min={0} step={1} defaultValue={texto(inicial.qtdLojas)} className={campo} />
        </div>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
          <input id="email" name="email" type="email" defaultValue={texto(inicial.email)} className={campo} />
        </div>
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
          <input id="phone" name="phone" defaultValue={texto(inicial.phone)} className={campo} />
        </div>
        <div className="col-span-2">
          <label htmlFor="linkedinEmpresa" className="block text-sm font-medium text-gray-700 mb-1">LinkedIn da empresa</label>
          <input id="linkedinEmpresa" name="linkedinEmpresa" type="url" placeholder="https://www.linkedin.com/company/…" defaultValue={texto(inicial.linkedinEmpresa)} className={campo} />
        </div>
        <div className="col-span-2">
          <label htmlFor="linkedinDecisor" className="block text-sm font-medium text-gray-700 mb-1">LinkedIn do decisor</label>
          <input id="linkedinDecisor" name="linkedinDecisor" type="url" placeholder="https://www.linkedin.com/in/…" defaultValue={texto(inicial.linkedinDecisor)} className={campo} />
        </div>
        <div className="col-span-2">
          <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-1">Tags (separadas por vírgula)</label>
          <input
            id="tags"
            name="tags"
            placeholder="ex: varejo, sp, distribuidor"
            defaultValue={Array.isArray(inicial.tags) ? (inicial.tags as string[]).join(', ') : ''}
            className={campo}
          />
        </div>
        <div className="col-span-2">
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
          <textarea id="notes" name="notes" rows={3} defaultValue={texto(inicial.notes)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium text-sm px-5 py-2.5 rounded-lg transition-colors">
          {loading ? 'Salvando...' : rotuloSalvar}
        </button>
        <button type="button" onClick={cancelar} className="text-gray-600 hover:text-gray-900 font-medium text-sm px-4 py-2.5 rounded-lg hover:bg-gray-100 transition-colors">
          Cancelar
        </button>
      </div>
    </form>
  )
}
