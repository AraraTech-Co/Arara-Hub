import { Ticket, Clock, CheckCircle, FolderOpen } from "lucide-react"

interface DashboardStatsProps {
  open: number
  inProgress: number
  closed: number
  total: number
}

export function DashboardStats({ open, inProgress, closed, total }: DashboardStatsProps) {
  const stats = [
    { title: "Total de Tickets", value: total, icon: FolderOpen, color: "text-sem-info-fg", bgColor: "bg-sem-info" },
    { title: "Abertos", value: open, icon: Ticket, color: "text-priority-high-fg", bgColor: "bg-priority-high" },
    { title: "Em Andamento", value: inProgress, icon: Clock, color: "text-sem-warning-fg", bgColor: "bg-sem-warning" },
    { title: "Resolvidos", value: closed, icon: CheckCircle, color: "text-sem-success-fg", bgColor: "bg-sem-success" },
  ]

  return (
    <div className="grid grid-cols-2 divide-x divide-y divide-border rounded-lg border border-border sm:grid-cols-4 sm:divide-y-0">
      {stats.map((stat) => (
        <div key={stat.title} className="flex items-center gap-3 p-4">
          <div className={`rounded-lg p-2 shrink-0 ${stat.bgColor}`}>
            <stat.icon className={`h-4 w-4 ${stat.color}`} />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-bold text-foreground leading-none">{stat.value}</div>
            <p className="mt-1 text-xs text-muted-foreground truncate">{stat.title}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
