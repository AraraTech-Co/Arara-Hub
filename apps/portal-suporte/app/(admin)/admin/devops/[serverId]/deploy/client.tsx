'use client'

"use client"

import { useEffect, useState } from 'react'
import { useRotaDinamica } from '@/hooks/use-rota-dinamica'
import { Rocket, RefreshCw, Play, Clock, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { toast } from 'sonner'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

export default function DeployPage() {
  const serverId = useRotaDinamica('serverId', 'devops')
  const [deploys, setDeploys] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  async function loadDeploys() {
    setLoading(true)
    try {
      const res = await araraApiFetch(`/api/devops/${serverId}/deploy/history`)
      const json = await res.json()
      if (json.deploys) {
        setDeploys(json.deploys)
      }
    } catch (e) {
      toast.error('Erro ao carregar deploys')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDeploys()
  }, [serverId])

  const handleDeploy = async () => {
    try {
      const res = await araraApiFetch(`/api/devops/${serverId}/deploy/trigger`, {
        method: 'POST'
      })
      const json = await res.json()
      if (json.success) {
        toast.success('Deploy iniciado com sucesso')
        loadDeploys()
      } else {
        toast.error(json.error || 'Erro ao iniciar deploy')
      }
    } catch (e) {
      toast.error('Erro ao iniciar deploy')
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />
      case 'running':
        return <Clock className="w-4 h-4 text-amber-500" />
      default:
        return <Clock className="w-4 h-4 text-muted-foreground" />
    }
  }

  return (
    <div className="devops-theme p-6 bg-devops-surface min-h-screen text-devops-foreground">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Deploy</h1>
          <p className="text-sm text-muted-foreground/70 mt-1">Gerencie deploys da aplicação</p>
        </div>
        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            className="border-devops-border text-white hover:bg-devops-overlay"
            onClick={loadDeploys}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
          <Button 
            size="sm" 
            className="bg-purple-600 hover:bg-purple-700"
            onClick={handleDeploy}
          >
            <Rocket className="w-4 h-4 mr-2" />
            Novo Deploy
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="text-center text-muted-foreground/70 py-8">Carregando histórico...</div>
        ) : deploys.length === 0 ? (
          <div className="text-center text-muted-foreground/70 py-8">Nenhum deploy encontrado</div>
        ) : (
          deploys.map((deploy) => (
            <Card key={deploy.id} className="border bg-devops-panel border-devops-border">
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(deploy.status)}
                    <div>
                      <h3 className="font-semibold text-white">{deploy.commit || 'Deploy #' + deploy.id}</h3>
                      <div className="text-sm text-muted-foreground/70">{deploy.branch || 'main'}</div>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs capitalize ${
                    deploy.status === 'success' 
                      ? 'bg-emerald-500/20 text-emerald-500' 
                      : deploy.status === 'failed'
                      ? 'bg-red-500/20 text-red-500'
                      : deploy.status === 'running'
                      ? 'bg-amber-500/20 text-amber-500'
                      : 'bg-devops-overlay text-muted-foreground/70'
                  }`}>
                    {deploy.status}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-3 text-sm">
                  <div>
                    <div className="text-muted-foreground/70">Autor</div>
                    <div className="text-white">{deploy.author || '-'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground/70">Início</div>
                    <div className="text-white">{deploy.startedAt || '-'}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground/70">Duração</div>
                    <div className="text-white">{deploy.duration || '-'}</div>
                  </div>
                </div>

                {deploy.message && (
                  <div className="bg-devops-overlay rounded p-3 text-sm text-muted-foreground/50">
                    {deploy.message}
                  </div>
                )}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
