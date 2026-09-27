'use client'

// =============================================================================
// Caixa de E-mails (client-only / Arara).
//
// Era uma lista genérica de 4 colunas. Volta a ter contadores, composição de
// e-mail e a lista com filtros (todos / não lidos / enviados / recebidos).
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Inbox, Mail, Send } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { araraFetch } from '@/lib/arara/client'
import { useAuth } from '@/lib/arara/AuthProvider'
import { EmailList } from '@/components/emails/email-list'
import { ComposeEmailDialog } from '@/components/emails/compose-email-dialog'

type Row = Record<string, unknown>

function rows(res: unknown): Row[] {
  if (Array.isArray(res)) return res as Row[]
  const d = (res as { data?: unknown })?.data
  return Array.isArray(d) ? (d as Row[]) : []
}

const RESOLVIDOS = new Set([
  'resolvido',
  'resolvido_com_manual',
  'resolvido_sem_manual',
  'post_mortem',
  'migracao_concluida',
  'fechado',
])

export default function EmailsPage() {
  const { user } = useAuth()
  const [emails, setEmails] = useState<Row[]>([])
  const [tickets, setTickets] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [e, t] = await Promise.all([
      araraFetch.get('/api/emails').catch(() => []),
      araraFetch.get('/api/tickets').catch(() => []),
    ])
    setEmails(rows(e))
    setTickets(
      rows(t)
        .filter((x) => !RESOLVIDOS.has(String(x.status || '')))
        .map((x) => ({ id: x.id, title: x.title, status: x.status })),
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const email = user?.email ?? ''
  const stats = useMemo(
    () => ({
      total: emails.length,
      unread: emails.filter((e) => !e.is_read).length,
      sent: emails.filter((e) => e.from_email === email).length,
    }),
    [emails, email],
  )

  return (
    <div className="pt-14 lg:pt-0">
      <main className="mx-auto max-w-7xl px-4 pb-8 pt-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Caixa de E-mails</h1>
            <p className="mt-1 text-muted-foreground">
              E-mails trocados com clientes, vinculados aos chamados
            </p>
          </div>
          <ComposeEmailDialog
            userId={user?.id ?? ''}
            userEmail={email}
            tickets={tickets as never}
          />
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Contador titulo="Total" valor={stats.total} icone={<Mail className="h-4 w-4 text-foreground/60" />} fundo="bg-muted" />
          <Contador titulo="Não lidos" valor={stats.unread} icone={<Inbox className="h-4 w-4 text-blue-600" />} fundo="bg-sem-info" />
          <Contador titulo="Enviados" valor={stats.sent} icone={<Send className="h-4 w-4 text-sem-success-fg" />} fundo="bg-sem-success" />
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando e-mails…</p>
        ) : (
          <EmailList
            emails={emails as never}
            currentUserEmail={email}
            tickets={tickets as never}
          />
        )}
      </main>
    </div>
  )
}

function Contador({
  titulo,
  valor,
  icone,
  fundo,
}: {
  titulo: string
  valor: number
  icone: React.ReactNode
  fundo: string
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{titulo}</CardTitle>
        <div className={`rounded-full p-2 ${fundo}`}>{icone}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{valor}</div>
      </CardContent>
    </Card>
  )
}
