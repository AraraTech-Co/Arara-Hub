/**
 * Formatação centralizada — fonte única de verdade para moeda, data e hora.
 * Evita as ~6 variações de toLocaleString espalhadas pelas telas (moeda ora com
 * centavos, ora sem). Sempre importe daqui.
 */

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
})

const BRL_COMPACT = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
})

type Money = number | string | { toString(): string } | null | undefined

function toNumber(v: Money): number {
  if (v === null || v === undefined) return 0
  return typeof v === "number" ? v : Number(v.toString())
}

/** R$ 12.000,00 — padrão para valores exibidos com precisão. */
export function formatBRL(value: Money): string {
  return BRL.format(toNumber(value))
}

/** R$ 12.000 — sem centavos, para KPIs e metas onde o centavo é ruído. */
export function formatBRLCompact(value: Money): string {
  return BRL_COMPACT.format(toNumber(value))
}

/** 21/07/2026 */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—"
  return new Date(value).toLocaleDateString("pt-BR")
}

/** 21/07/2026 14:30 */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—"
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

/** 14:30 */
export function formatTime(value: Date | string | null | undefined): string {
  if (!value) return "—"
  return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
}
