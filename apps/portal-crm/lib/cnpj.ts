/** CNPJ: o servidor grava só os 14 dígitos; a máscara é só da tela. */

export function soDigitos(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '')
}

export function cnpjValido(v: unknown): boolean {
  const d = soDigitos(v)
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    const r = [...base].reduce((s, c, i) => s + Number(c) * pesos[i], 0) % 11
    return r < 2 ? 0 : 11 - r
  }
  const d1 = dv(d.slice(0, 12))
  const d2 = dv(d.slice(0, 12) + d1)
  return d[12] === String(d1) && d[13] === String(d2)
}

export function mascararCnpj(v: unknown): string {
  const d = soDigitos(v).slice(0, 14)
  if (d.length !== 14) return d
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
}

export const PORTES = [
  { value: 'ME', label: 'ME' },
  { value: 'EPP', label: 'EPP' },
  { value: 'Medio', label: 'Médio' },
  { value: 'Grande', label: 'Grande' },
] as const

export function rotuloPorte(v: unknown): string | null {
  return PORTES.find((p) => p.value === v)?.label ?? null
}
