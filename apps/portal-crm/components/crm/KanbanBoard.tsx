"use client"

import { useState } from "react"
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { formatBRL, formatBRLCompact, formatDate } from "@/lib/format"
import Link from "next/link"

type Stage = { id: string; name: string; color: string }
type Deal = { id: string; title: string; value: number | null; expectedClose: string | null; client: { name: string } }
type DealWithStage = Deal & { stageId: string }

function DealCard({ deal, stage, isDragging }: { deal: DealWithStage; stage?: Stage; isDragging?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: deal.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="touch-none">
      <Link
        href={`/pipeline/view?id=${deal.id}`}
        className="block bg-white border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
      >
        {/* Stage dot indicator no header */}
        <div className="flex items-start gap-2 mb-2">
          {stage && (
            <span
              className="mt-1 w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: stage.color }}
            />
          )}
          <p className="text-sm font-medium text-gray-900 leading-snug flex-1">{deal.title}</p>
        </div>

        <p className="text-xs text-gray-500 ml-4">{deal.client.name}</p>

        {deal.value != null && (
          <p className="text-sm font-bold text-gray-900 mt-2 ml-4 tabular-nums">
            {formatBRL(deal.value)}
          </p>
        )}

        {deal.expectedClose && (
          <div className="mt-2 ml-4">
            <span className="inline-block text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
              {formatDate(deal.expectedClose)}
            </span>
          </div>
        )}
      </Link>
    </div>
  )
}

export function KanbanBoard({ stages, initialDeals }: { stages: Stage[]; initialDeals: DealWithStage[] }) {
  const [deals, setDeals] = useState<DealWithStage[]>(initialDeals)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  )

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event
    if (!over) return

    const dealId = active.id as string
    const targetStageId = over.id as string

    const deal = deals.find((d) => d.id === dealId)
    if (!deal || deal.stageId === targetStageId) return
    const previousStageId = deal.stageId

    // Update otimista
    setDeals((prev) => prev.map((d): DealWithStage => d.id === dealId ? { ...d, stageId: targetStageId } : d))

    try {
      const { arara } = await import("@/lib/arara")
      await arara.moveDealStage(dealId, targetStageId)
    } catch {
      // Reverte para a etapa anterior e avisa — sem perda silenciosa de dado.
      setDeals((prev) => prev.map((d): DealWithStage => d.id === dealId ? { ...d, stageId: previousStageId } : d))
      setToast("Não foi possível mover a negociação. Tente novamente.")
      setTimeout(() => setToast(null), 4000)
    }
  }

  const activeDeal = deals.find((d) => d.id === activeId)
  const activeStage = activeDeal ? stages.find((s) => s.id === activeDeal.stageId) : undefined

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {stages.map((stage) => {
          const stageDeals = deals.filter((d) => d.stageId === stage.id)
          const stageTotal = stageDeals.reduce((s, d) => s + (d.value ?? 0), 0)
          return (
            <div key={stage.id} className="w-64 shrink-0" id={stage.id}>
              {/* Column header com card */}
              <div className="bg-white rounded-lg px-3 py-2 shadow-sm mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                  <span className="text-sm font-semibold text-gray-700 flex-1">{stage.name}</span>
                  <span className="text-xs text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">{stageDeals.length}</span>
                </div>
                {stageTotal > 0 && (
                  <p className="text-xs text-gray-500 mt-1 ml-4 tabular-nums">{formatBRLCompact(stageTotal)}</p>
                )}
              </div>

              <SortableContext id={stage.id} items={stageDeals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
                <div
                  className={`min-h-24 rounded-xl bg-gray-50 p-2 space-y-2 ${
                    stageDeals.length === 0
                      ? "border-2 border-dashed border-gray-200 flex items-center justify-center"
                      : ""
                  }`}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {}}
                  id={stage.id}
                >
                  {stageDeals.length === 0 ? (
                    <p className="text-xs text-gray-500 select-none py-4">Soltar aqui</p>
                  ) : (
                    stageDeals.map((deal) => (
                      <DealCard key={deal.id} deal={deal} stage={stage} isDragging={deal.id === activeId} />
                    ))
                  )}
                </div>
              </SortableContext>
            </div>
          )
        })}
      </div>

      <DragOverlay dropAnimation={null}>
        {activeDeal && (
          <div className="bg-white border border-gray-300 rounded-lg p-3 shadow-2xl w-56 rotate-2 opacity-95">
            <div className="flex items-start gap-2 mb-1">
              {activeStage && (
                <span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: activeStage.color }} />
              )}
              <p className="text-sm font-medium text-gray-900">{activeDeal.title}</p>
            </div>
            <p className="text-xs text-gray-500 ml-4">{activeDeal.client.name}</p>
          </div>
        )}
      </DragOverlay>

      {toast && (
        <div
          role="alert"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white text-sm font-medium px-4 py-3 rounded-lg shadow-lg flex items-center gap-2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
          {toast}
        </div>
      )}
    </DndContext>
  )
}
