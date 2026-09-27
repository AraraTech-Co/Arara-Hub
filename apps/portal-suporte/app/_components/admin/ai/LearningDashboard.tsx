'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/use-toast'
import {
  MessageSquare, TrendingUp, AlertTriangle, CheckCircle2,
  BarChart3, HelpCircle, Clock, ThumbsUp, BookOpen, Zap,
  BrainCircuit, RefreshCw, Hash, Layers,
} from 'lucide-react'
import useSWR, { mutate } from 'swr'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const PRIORITY_COLOR: Record<string, string> = {
  'P1 – Crítico': 'bg-sem-error text-sem-error-fg',
  'P2 – Alto':    'bg-orange-100 text-orange-800',
  'P3 – Médio':   'bg-sem-warning text-sem-warning-fg',
  'P4 – Baixo':   'bg-sem-success text-sem-success-fg',
}

export function LearningDashboard() {
  const { toast } = useToast()
  const [training, setTraining] = useState(false)

  const { data: stats,    isLoading: loadingStats }    = useSWR('/api/admin/ai/stats',   fetcher, { refreshInterval: 30000 })
  const { data: patterns, isLoading: loadingPatterns } = useSWR('/api/admin/ai/train',   fetcher, { refreshInterval: 60000 })
  const { data: articles = [] }                        = useSWR('/api/admin/ai/knowledge', fetcher)
  const { data: gaps = [] }                            = useSWR('/api/admin/ai/knowledge-gaps', fetcher)

  async function handleTrain() {
    setTraining(true)
    try {
      const res = await araraApiFetch('/api/admin/ai/train', { method: 'POST' })
      const result = await res.json()
      toast({
        title: '✅ Treinamento concluído',
        description: `${result.ticketsAnalyzed} tickets analisados · ${result.faqCreated} FAQs criados · ${result.gapsCreated} lacunas detectadas`,
      })
      mutate('/api/admin/ai/train')
      mutate('/api/admin/ai/stats')
      mutate('/api/admin/ai/faq-candidates')
      mutate('/api/admin/ai/knowledge-gaps')
    } catch {
      toast({ title: 'Erro ao treinar', variant: 'destructive' })
    } finally {
      setTraining(false)
    }
  }

  const fbTotal       = stats ? stats.feedbackPositive + stats.feedbackNegative : 0
  const satisfactionPct = fbTotal > 0 ? Math.round((stats.feedbackPositive / fbTotal) * 100) : 0
  const totalLogs     = stats ? (stats.logsCompleted + stats.logsFailed + stats.logsStarted) || 1 : 1
  const resolutionPct = stats ? Math.round((stats.logsCompleted / totalLogs) * 100) : 0

  return (
    <div className="space-y-6">

      {/* Train button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground/80">Aprendizado contínuo</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Analisa o histórico de tickets para calibrar a triagem e sugerir FAQs e lacunas
          </p>
        </div>
        <Button onClick={handleTrain} disabled={training} size="sm" className="gap-2">
          {training
            ? <><RefreshCw className="h-4 w-4 animate-spin" /> Treinando...</>
            : <><BrainCircuit className="h-4 w-4" /> Treinar agora</>}
        </Button>
      </div>

      {/* Metric cards */}
      {!loadingStats && stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <MessageSquare className="h-8 w-8 text-primary shrink-0" />
              <div>
                <p className="text-2xl font-bold">{stats.totalConversations}</p>
                <p className="text-xs text-muted-foreground">Conversas IA</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-sem-success-fg shrink-0" />
              <div>
                <p className="text-2xl font-bold">{resolutionPct}%</p>
                <p className="text-xs text-muted-foreground">Execuções OK</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <Clock className="h-8 w-8 text-blue-600 shrink-0" />
              <div>
                <p className="text-2xl font-bold">{stats.avgMessages}</p>
                <p className="text-xs text-muted-foreground">Msgs/Conversa</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-yellow-600 shrink-0" />
              <div>
                <p className="text-2xl font-bold">{stats.gapsCount}</p>
                <p className="text-xs text-muted-foreground">Lacunas pendentes</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Ticket patterns from history */}
      {!loadingPatterns && patterns && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Top keywords */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Hash className="h-4 w-4" /> Palavras mais frequentes nos tickets
              </CardTitle>
            </CardHeader>
            <CardContent>
              {patterns.topKeywords?.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum padrão detectado ainda.</p>
              ) : (
                <div className="space-y-2">
                  {(patterns.topKeywords || []).slice(0, 12).map((k: any, i: number) => {
                    const maxCount = patterns.topKeywords?.[0]?.count || 1
                    return (
                      <div key={i} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground/80">{k.keyword}</span>
                            <Badge variant="outline" className={`text-[10px] py-0 ${PRIORITY_COLOR[k.topPriority] || ''}`}>
                              {k.topPriority}
                            </Badge>
                          </div>
                          <span className="text-muted-foreground">{k.count}x</span>
                        </div>
                        <Progress value={(k.count / maxCount) * 100} className="h-1" />
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Category stats */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Layers className="h-4 w-4" /> Tickets por categoria
              </CardTitle>
            </CardHeader>
            <CardContent>
              {patterns.byCategory?.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum dado disponível.</p>
              ) : (
                <div className="space-y-2">
                  {(patterns.byCategory || []).slice(0, 8).map((c: any, i: number) => {
                    const maxCount = patterns.byCategory?.[0]?.count || 1
                    const dominantPriority = Object.entries(c.priorities || {}).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] as string
                    return (
                      <div key={i} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground/80 capitalize">{c.category || 'sem categoria'}</span>
                            {dominantPriority && (
                              <Badge variant="outline" className={`text-[10px] py-0 ${PRIORITY_COLOR[dominantPriority] || 'bg-muted text-foreground/60'}`}>
                                {dominantPriority}
                              </Badge>
                            )}
                          </div>
                          <span className="text-muted-foreground">{c.count}</span>
                        </div>
                        <Progress value={(c.count / maxCount) * 100} className="h-1" />
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Priority distribution */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Distribuição de prioridades (histórico)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {patterns.byPriority?.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum dado.</p>
              ) : (
                <div className="space-y-3">
                  {(patterns.byPriority || []).map((p: any, i: number) => (
                    <div key={i}>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span className="font-medium text-foreground/80">{p.priority}</span>
                        <span>{p.count} tickets ({p.pct}%)</span>
                      </div>
                      <Progress value={p.pct} className="h-2" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Satisfaction + KB health */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ThumbsUp className="h-4 w-4" /> Satisfação & Base de Conhecimento
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {stats && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Feedback positivo</span>
                    <Badge className="bg-sem-success text-sem-success-fg">{stats.feedbackPositive}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Feedback negativo</span>
                    <Badge className="bg-sem-error text-sem-error-fg">{stats.feedbackNegative}</Badge>
                  </div>
                  {fbTotal > 0 && (
                    <div>
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Satisfação</span><span>{satisfactionPct}%</span>
                      </div>
                      <Progress value={satisfactionPct} className="h-2" />
                    </div>
                  )}
                  <div className="border-t pt-2 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Artigos KB ativos</span>
                      <Badge variant="secondary">{stats.articlesCount}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">FAQs aguardando aprovação</span>
                      <Badge className="bg-sem-info text-sem-info-fg">{stats.faqPendingCount}</Badge>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Top Knowledge Gaps */}
      {(gaps as any[]).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <HelpCircle className="h-4 w-4" /> Lacunas da Base de Conhecimento
              <Badge variant="outline" className="ml-auto text-xs">{(gaps as any[]).filter((g: any) => g.status === 'pending').length} pendentes</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(gaps as any[]).slice(0, 12).map((gap: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm gap-2">
                  <span className="text-foreground truncate flex-1">{gap.detectedQuestion}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {gap.module && <Badge variant="outline" className="text-[10px]">{gap.module}</Badge>}
                    <Badge variant="secondary" className="text-[10px]">{gap.frequency}x</Badge>
                    {gap.frequency >= 3 && <Zap className="h-3 w-3 text-yellow-500" />}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* KB Articles */}
      {(articles as any[]).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BookOpen className="h-4 w-4" /> Artigos na Base de Conhecimento
              <Badge variant="secondary" className="ml-auto">{(articles as any[]).length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {(articles as any[]).slice(0, 10).map((a: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-sm gap-2">
                  <span className="text-foreground truncate flex-1">{a.title}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0">{a.category}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Execution quality */}
      {stats && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChart3 className="h-4 w-4" /> Qualidade das execuções da IA
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 rounded-lg bg-sem-success border border-sem-success-bd">
                <p className="text-2xl font-bold text-sem-success-fg">{stats.logsCompleted}</p>
                <p className="text-xs text-muted-foreground">Completadas</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-sem-warning border border-sem-warning-bd">
                <p className="text-2xl font-bold text-sem-warning-fg">{stats.logsStarted}</p>
                <p className="text-xs text-muted-foreground">Em andamento</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-sem-error border border-sem-error-bd">
                <p className="text-2xl font-bold text-sem-error-fg">{stats.logsFailed}</p>
                <p className="text-xs text-muted-foreground">Com erro</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
