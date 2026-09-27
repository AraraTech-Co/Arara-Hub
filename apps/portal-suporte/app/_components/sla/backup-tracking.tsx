'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Database, CheckCircle, XCircle } from 'lucide-react'
import { formatDate } from '@/lib/utils'

export function BackupTracking() {
  // Mock data for demonstration
  const backups = [
    {
      id: '1',
      backup_type: 'full',
      service_name: 'Database Principal',
      status: 'success',
      size_mb: 2048,
      retention_days: 90,
      rto_minutes: 120,
      rpo_minutes: 15,
      verified: true,
      completed_at: new Date().toISOString()
    },
    {
      id: '2',
      backup_type: 'logs',
      service_name: 'Logs de Auditoria',
      status: 'success',
      size_mb: 512,
      retention_days: 180,
      verified: true,
      completed_at: new Date().toISOString()
    }
  ]

  return (
    <div className="space-y-4">
      <Card className="border p-6 bg-gradient-to-br from-indigo-500/10 to-blue-500/10 border-indigo-500/20">
        <h3 className="text-lg font-semibold mb-2">Backup e Recuperação</h3>
        <p className="text-sm text-muted-foreground">
          RTO (Recovery Time Objective) e RPO (Recovery Point Objective) conforme ISO 27001
        </p>
      </Card>

      <div className="space-y-3">
        {backups.map((backup) => (
          <Card key={backup.id} className="p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-accent">
                  <Database className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="font-semibold">{backup.service_name}</h3>
                  <p className="text-xs text-muted-foreground capitalize">
                    {backup.backup_type} backup
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {backup.verified ? (
                  <CheckCircle className="w-5 h-5 text-sem-success-fg" />
                ) : (
                  <XCircle className="w-5 h-5 text-muted-foreground/70" />
                )}
                <Badge variant={backup.status === 'success' ? 'default' : 'destructive'}>
                  {backup.status}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground mb-1">Tamanho</p>
                <p className="font-semibold">{backup.size_mb} MB</p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Retenção</p>
                <p className="font-semibold">{backup.retention_days} dias</p>
              </div>
              {backup.rto_minutes && (
                <div>
                  <p className="text-muted-foreground mb-1">RTO</p>
                  <p className="font-semibold">{backup.rto_minutes} min</p>
                </div>
              )}
              {backup.rpo_minutes && (
                <div>
                  <p className="text-muted-foreground mb-1">RPO</p>
                  <p className="font-semibold">{backup.rpo_minutes} min</p>
                </div>
              )}
            </div>

            <div className="mt-3 text-xs text-muted-foreground">
              Último backup: {formatDate(backup.completed_at)}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
