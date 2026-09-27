'use client'

"use client"

import { useEffect, useState } from 'react'
import { useRotaDinamica } from '@/hooks/use-rota-dinamica'
import { Database, RefreshCw, Play, Square, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

export default function PostgresPage() {
  const serverId = useRotaDinamica('serverId', 'devops')
  const [databases, setDatabases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  async function loadDatabases() {
    setLoading(true)
    try {
      const res = await araraApiFetch(`/api/devops/${serverId}/postgres/databases`)
      const json = await res.json()
      if (json.databases) {
        setDatabases(json.databases)
      }
    } catch (e) {
      toast.error('Erro ao carregar databases')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDatabases()
  }, [serverId])

  const handleAction = async (dbName: string, action: string) => {
    try {
      const res = await araraApiFetch(`/api/devops/${serverId}/postgres/databases/${dbName}/${action}`, {
        method: 'POST'
      })
      const json = await res.json()
      if (json.success) {
        toast.success(`${action} realizado com sucesso`)
        loadDatabases()
      } else {
        toast.error(json.error || 'Erro ao realizar ação')
      }
    } catch (e) {
      toast.error('Erro ao realizar ação')
    }
  }

  return (
    <div className="devops-theme p-6 bg-devops-surface min-h-screen text-devops-foreground">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Postgres</h1>
          <p className="text-sm text-muted-foreground/70 mt-1">Gerencie bancos de dados PostgreSQL</p>
        </div>
        <Button 
          size="sm" 
          variant="outline" 
          className="border-devops-border text-white hover:bg-devops-overlay"
          onClick={loadDatabases}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full text-center text-muted-foreground/70 py-8">Carregando databases...</div>
        ) : databases.length === 0 ? (
          <div className="col-span-full text-center text-muted-foreground/70 py-8">Nenhum database encontrado</div>
        ) : (
          databases.map((db) => (
            <Card key={db.name} className="border bg-devops-panel border-devops-border">
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Database className="w-5 h-5 text-indigo-500" />
                    <h3 className="font-semibold text-white">{db.name}</h3>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${
                    db.connected 
                      ? 'bg-emerald-500/20 text-emerald-500' 
                      : 'bg-devops-overlay text-muted-foreground/70'
                  }`}>
                    {db.connected ? 'Conectado' : 'Offline'}
                  </span>
                </div>

                <div className="space-y-2 mb-4 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground/70">Tabelas</span>
                    <span className="text-white">{db.tables || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground/70">Tamanho</span>
                    <span className="text-white">{db.size || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground/70">Encoding</span>
                    <span className="text-white">{db.encoding || 'UTF8'}</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="flex-1 border-devops-border text-white hover:bg-devops-overlay"
                    onClick={() => handleAction(db.name, 'backup')}
                  >
                    Backup
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="flex-1 border-devops-border text-white hover:bg-devops-overlay"
                    onClick={() => handleAction(db.name, 'restore')}
                  >
                    Restore
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    className="border-devops-border text-white hover:bg-devops-overlay"
                  >
                    <Settings className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
