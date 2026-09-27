'use client'

import { useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckCircle2, XCircle, FileQuestion, AlertTriangle, Edit, BookOpen } from 'lucide-react'
import useSWR, { mutate } from 'swr'
import { araraApiFetch } from '@/lib/arara/arara-api-fetch'

const fetcher = (url: string) => fetch(url).then(r => r.json())

const MODULE_LABELS: Record<string, string> = {
  pdv: 'PDV', fiscal: 'Fiscal', financeiro: 'Financeiro',
  estoque: 'Estoque', erp: 'ERP', infra: 'Infraestrutura',
}

export function CurationPanel() {
  const { toast } = useToast()
  const { data: candidates = [], isLoading: loadingFaq } = useSWR<any[]>('/api/admin/ai/faq-candidates', fetcher)
  const { data: gaps      = [], isLoading: loadingGaps } = useSWR<any[]>('/api/admin/ai/knowledge-gaps',  fetcher)

  const [editingId,      setEditingId]      = useState<string | null>(null)
  const [editedAnswer,   setEditedAnswer]   = useState('')

  async function handleApprove(faq: any) {
    const answer = editingId === faq.id ? editedAnswer : faq.suggestedAnswer
    await araraApiFetch(`/api/admin/ai/faq-candidates/${faq.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve', suggestedAnswer: answer }),
    })
    toast({ title: 'FAQ aprovado e publicado na base!' })
    setEditingId(null)
    mutate('/api/admin/ai/faq-candidates')
  }

  async function handleReject(id: string) {
    await araraApiFetch(`/api/admin/ai/faq-candidates/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reject' }),
    })
    toast({ title: 'FAQ rejeitado.' })
    mutate('/api/admin/ai/faq-candidates')
  }

  async function handleReviewGap(gapId: string) {
    await araraApiFetch(`/api/admin/ai/knowledge-gaps/${gapId}`, { method: 'PATCH' })
    toast({ title: 'Lacuna marcada como revisada.' })
    mutate('/api/admin/ai/knowledge-gaps')
  }

  const pending      = (candidates as any[]).filter(c => c.approvalStatus === 'pending')
  const reviewed     = (candidates as any[]).filter(c => c.approvalStatus !== 'pending')
  const pendingGaps  = (gaps as any[]).filter(g => g.status === 'pending')
  const reviewedGaps = (gaps as any[]).filter(g => g.status !== 'pending')

  if (loadingFaq || loadingGaps) {
    return <p className="text-sm text-muted-foreground text-center py-8">Carregando curadoria...</p>
  }

  return (
    <Tabs defaultValue="faqs" className="space-y-4">
      <TabsList>
        <TabsTrigger value="faqs"  className="gap-1.5"><FileQuestion className="h-4 w-4" /> FAQs ({pending.length})</TabsTrigger>
        <TabsTrigger value="gaps"  className="gap-1.5"><AlertTriangle className="h-4 w-4" /> Lacunas ({pendingGaps.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="faqs" className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">FAQs Pendentes de Aprovação</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma FAQ pendente.</p>
            ) : (
              pending.map((faq: any) => (
                <div key={faq.id} className="border border-border rounded-lg p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 space-y-2">
                      <p className="text-sm font-medium">{faq.questionPattern}</p>
                      {editingId === faq.id ? (
                        <Textarea value={editedAnswer} onChange={e => setEditedAnswer(e.target.value)} rows={4} placeholder="Edite a resposta sugerida..." className="text-xs" />
                      ) : (
                        faq.suggestedAnswer && <p className="text-xs text-muted-foreground line-clamp-3">{faq.suggestedAnswer}</p>
                      )}
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">{faq.recurrenceCount}x recorrência</Badge>
                        {faq.sourceBasis && <Badge variant="outline" className="text-[10px]">{faq.sourceBasis}</Badge>}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button size="sm" variant="ghost" onClick={() => {
                        if (editingId === faq.id) { setEditingId(null) }
                        else { setEditingId(faq.id); setEditedAnswer(faq.suggestedAnswer || '') }
                      }}>
                        <Edit className="h-4 w-4 text-muted-foreground" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleApprove(faq)}>
                        <CheckCircle2 className="h-4 w-4 text-sem-success-fg" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleReject(faq.id)}>
                        <XCircle className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {reviewed.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Revisados ({reviewed.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {reviewed.map((faq: any) => (
                <div key={faq.id} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
                  <span className="truncate flex-1">{faq.questionPattern}</span>
                  <Badge className={faq.approvalStatus === 'approved' ? 'bg-sem-success text-sem-success-fg' : 'bg-sem-error text-sem-error-fg'}>
                    {faq.approvalStatus === 'approved' ? 'Aprovado' : 'Rejeitado'}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="gaps" className="space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-sm font-medium">Lacunas Pendentes de Revisão</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {pendingGaps.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma lacuna pendente.</p>
            ) : (
              pendingGaps.map((gap: any) => (
                <div key={gap.id} className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{gap.detectedQuestion}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      {gap.module && <Badge variant="outline" className="text-[10px]">{MODULE_LABELS[gap.module] || gap.module}</Badge>}
                      <Badge variant="secondary" className="text-[10px]">{gap.frequency}x</Badge>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleReviewGap(gap.id)}>
                    <BookOpen className="h-3.5 w-3.5 mr-1" /> Revisar
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {reviewedGaps.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm font-medium">Lacunas Revisadas ({reviewedGaps.length})</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {reviewedGaps.map((gap: any) => (
                <div key={gap.id} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
                  <span className="truncate flex-1">{gap.detectedQuestion}</span>
                  <Badge className="bg-sem-success text-sem-success-fg">Revisado</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </TabsContent>
    </Tabs>
  )
}
