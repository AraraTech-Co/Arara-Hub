'use client'

import { AlertCircle, CheckCircle2, AlertTriangle, MessageSquarePlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ValidationResult } from '@/lib/sped/validator'

const MENSAGENS_SIMPLES: Record<string, string> = {
  K200_VL_UNIT_EXTRA: 'O arquivo usa um formato antigo que não é aceito pelo validador da Receita Federal.',
  K200_SEM_0200: 'Existem produtos no inventário que não estão cadastrados na tabela de produtos.',
  H010_SEM_0200: 'O inventário físico contém produtos que não estão cadastrados.',
  H010_SEM_0190: 'O inventário físico usa unidades de medida que não foram cadastradas.',
  DATA_FORMATO: 'Algumas datas do arquivo estão em formato incorreto.',
  COD_VER_INVALIDO: 'O arquivo precisa ser atualizado para o formato mais recente (versão 019).',
  '9999_QTD_ERRADA': 'O totalizador de linhas do arquivo está incorreto.',
}

interface Props {
  result: ValidationResult
  onAbrirChamado?: (validacaoId: string) => void
}

export function ResultadoClienteView({ result, onAbrirChamado }: Props) {
  const criticos = result.errors.filter(e => e.severity === 'CRITICAL').length
  const avisos = result.errors.filter(e => e.severity === 'WARNING').length
  const blocosCom = Object.values(result.blocos).filter(b => b.status === 'error' || b.status === 'warning').length

  const isAprovado = result.summary.status === 'APROVADO'
  const codesUnicos = [...new Set(result.errors.map(e => e.code))]

  const mensagensCliente = codesUnicos
    .filter(c => MENSAGENS_SIMPLES[c])
    .map(c => MENSAGENS_SIMPLES[c])
    .slice(0, 4)

  if (isAprovado) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <CheckCircle2 className="h-14 w-14 text-green-500" />
        <h3 className="text-xl font-semibold text-foreground">Arquivo validado com sucesso</h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          O arquivo SPED está em conformidade com o leiaute v019 e pronto para transmissão.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Título */}
      <div>
        <h3 className="text-base font-semibold text-foreground">Resumo da Validação</h3>
        <p className="text-sm text-muted-foreground mt-0.5">
          Arquivo: {result.file_name} · Período: {result.periodo}
        </p>
      </div>

      {/* 3 cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className={cn(
          'rounded-xl p-4 text-center border',
          criticos > 0 ? 'bg-sem-error border-sem-error-bd' : 'bg-muted/50 border-border',
        )}>
          <div className="text-3xl font-bold text-sem-error-fg">{criticos}</div>
          <div className="text-xs font-medium text-foreground/60 mt-1">
            {criticos === 1 ? 'Erro Crítico' : 'Erros Críticos'}
          </div>
          <div className="text-xs text-muted-foreground/70 mt-0.5">Bloqueia transmissão</div>
        </div>

        <div className={cn(
          'rounded-xl p-4 text-center border',
          avisos > 0 ? 'bg-sem-warning border-sem-warning-bd' : 'bg-muted/50 border-border',
        )}>
          <div className="text-3xl font-bold text-yellow-600">{avisos}</div>
          <div className="text-xs font-medium text-foreground/60 mt-1">
            {avisos === 1 ? 'Aviso' : 'Avisos'}
          </div>
          <div className="text-xs text-muted-foreground/70 mt-0.5">Pode gerar inconsistências</div>
        </div>

        <div className={cn(
          'rounded-xl p-4 text-center border',
          blocosCom > 0 ? 'bg-orange-100 dark:bg-orange-900/30 border-orange-200 dark:border-orange-700' : 'bg-sem-success border-sem-success-bd',
        )}>
          <div className={cn('text-3xl font-bold', blocosCom > 0 ? 'text-orange-700 dark:text-orange-300' : 'text-sem-success-fg')}>
            {blocosCom}
          </div>
          <div className="text-xs font-medium text-foreground/60 mt-1">
            {blocosCom === 1 ? 'Bloco com Problema' : 'Blocos com Problemas'}
          </div>
          <div className="text-xs text-muted-foreground/70 mt-0.5">de 10 blocos</div>
        </div>
      </div>

      {/* Mensagens simples */}
      {mensagensCliente.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-foreground/80">O que foi encontrado:</h4>
          {mensagensCliente.map((msg, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-foreground/60 bg-sem-warning border border-sem-warning-bd rounded-lg px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              {msg}
            </div>
          ))}
          {codesUnicos.length > mensagensCliente.length && (
            <p className="text-xs text-muted-foreground/70">
              + {result.errors.length - mensagensCliente.length} outros problemas técnicos identificados.
            </p>
          )}
        </div>
      )}

      {/* O que fazer */}
      <div className="bg-muted/50 rounded-xl p-4 border border-border">
        <h4 className="text-sm font-medium text-foreground/80 mb-2 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-muted-foreground" />
          Próximos passos
        </h4>
        <ul className="space-y-1 text-sm text-foreground/60 list-disc list-inside">
          <li>Entre em contato com o suporte da Arara Tech</li>
          <li>Informe o número de chamado desta validação</li>
          <li>Nossa equipe corrigirá o arquivo e devolverá o SPED revisado</li>
        </ul>
      </div>

      {/* Botão abrir chamado */}
      <button
        onClick={() => onAbrirChamado?.(result.id)}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-xl font-medium text-sm hover:bg-indigo-700 transition-colors"
      >
        <MessageSquarePlus className="h-4 w-4" />
        Abrir Chamado para Correção
      </button>

      <p className="text-xs text-muted-foreground/70 text-center">
        ID da validação: <code className="font-mono">{result.id}</code>
      </p>
    </div>
  )
}
