'use client'

import { useEffect, useState } from 'react'
import { PostMortemsClient } from './post-mortems-client'
import { api } from '@/lib/api/client'
import { AdminHeader } from '@/components/admin/admin-header'
import { useAuth } from '@/lib/arara/AuthProvider'

export default function PostMortemsPage() {
  const { user } = useAuth()
  const [rows, setRows] = useState<any[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .get<{ data?: any[] }>('/api/post-mortems')
      .then((r) => setRows(r.data || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col">
      <AdminHeader user={{ email: user?.email, fullName: user?.name || user?.email }} />
      <div className="p-4 lg:p-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">{error}</div>
        )}
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando post-mortems…</p>
        ) : (
          <PostMortemsClient postMortems={rows} />
        )}
      </div>
    </div>
  )
}
