'use client'

// =============================================================================
// Pomodoro & Tarefas (client-only / Arara).
//
// Era uma lista genérica de 4 colunas. Volta a ter o painel de trabalho:
// contadores, criar tarefa, lista completa e o painel de produtividade.
// Os dados que antes vinham do servidor agora são buscados na plataforma.
// =============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckSquare, Clock, ListTodo, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { araraFetch } from '@/lib/arara/client'
import { useAuth } from '@/lib/arara/AuthProvider'
import { TaskList } from '@/components/tasks/task-list'
import { CreateTaskDialog } from '@/components/tasks/create-task-dialog'
import { ProductivityPanel } from '@/components/tasks/productivity-panel'
import { ehEquipe } from '@/lib/arara/auth-storage'

type Row = Record<string, unknown>

function rows(res: unknown): Row[] {
  if (Array.isArray(res)) return res as Row[]
  const d = (res as { data?: unknown })?.data
  return Array.isArray(d) ? (d as Row[]) : []
}

/** Status que contam como "chamado ainda aberto" para o seletor de tarefa. */
const RESOLVIDOS = new Set([
  'resolvido',
  'resolvido_com_manual',
  'resolvido_sem_manual',
  'post_mortem',
  'migracao_concluida',
  'fechado',
])

export default function TasksPage() {
  const { user } = useAuth()
  const [tasks, setTasks] = useState<Row[]>([])
  const [agents, setAgents] = useState<Row[]>([])
  const [tickets, setTickets] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [t, p, tk] = await Promise.all([
      araraFetch.get('/api/tasks').catch(() => []),
      araraFetch.get('/api/profiles').catch(() => []),
      araraFetch.get('/api/tickets').catch(() => []),
    ])
    setTasks(rows(t))
    setAgents(
      rows(p)
        // `support` é agente de suporte — ver lib/arara/auth-storage.ts.
        .filter((a) => ehEquipe(a.role))
        .map((a) => ({ id: a.id, full_name: a.full_name, email: a.email, role: a.role })),
    )
    setTickets(
      rows(tk)
        .filter((x) => !RESOLVIDOS.has(String(x.status || '')))
        .map((x) => ({ id: x.id, title: x.title, status: x.status })),
    )
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(() => {
    const by = (s: string) => tasks.filter((t) => t.status === s).length
    return { todo: by('todo'), doing: by('in_progress'), done: by('done') }
  }, [tasks])

  const userId = user?.id ?? ''

  return (
    <div className="pt-14 lg:pt-0">
      <main className="mx-auto max-w-350 px-4 pb-8 pt-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Pomodoro &amp; Tarefas</h1>
            <p className="mt-1 text-muted-foreground">
              Produtividade da equipe, rotação de estudos e gerenciamento de tarefas
            </p>
          </div>
          <CreateTaskDialog
            userId={userId}
            agents={agents as never}
            tickets={tickets as never}
          />
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <Contador titulo="A Fazer" valor={counts.todo} icone={<ListTodo className="h-4 w-4 text-foreground/60" />} fundo="bg-muted" />
          <Contador titulo="Em Andamento" valor={counts.doing} icone={<Clock className="h-4 w-4 text-blue-600" />} fundo="bg-sem-info" />
          <Contador titulo="Concluídas" valor={counts.done} icone={<CheckSquare className="h-4 w-4 text-sem-success-fg" />} fundo="bg-sem-success" />
        </div>

        <Tabs defaultValue="tasks" className="space-y-6">
          <TabsList>
            <TabsTrigger value="tasks">
              <CheckSquare className="mr-2 h-4 w-4" />
              Tarefas
            </TabsTrigger>
            <TabsTrigger value="productivity">
              <Zap className="mr-2 h-4 w-4" />
              Produtividade &amp; Pomodoro
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tasks">
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando tarefas…</p>
            ) : (
              <TaskList tasks={tasks as never} agents={agents as never} />
            )}
          </TabsContent>

          <TabsContent value="productivity">
            <ProductivityPanel agents={agents as never} currentUserId={userId} />
          </TabsContent>
        </Tabs>
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
