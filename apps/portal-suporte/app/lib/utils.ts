import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(iso: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('pt-BR', opts ?? {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return String(iso)
  }
}

export function formatDateShort(iso: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('pt-BR', opts ?? { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return String(iso)
  }
}

/** Iniciais para avatar: primeira+última letra do nome, ou 2 primeiras letras se só uma palavra.
 * `fallback` (ex.: e-mail) é usado quando não há nome. */
export function getInitials(name: string | null | undefined, fallback?: string | null): string {
  const trimmed = name?.trim()
  if (trimmed) {
    const parts = trimmed.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
    return trimmed.slice(0, 2).toUpperCase() || '?'
  }
  const trimmedFallback = fallback?.trim()
  return trimmedFallback ? trimmedFallback.slice(0, 2).toUpperCase() : '?'
}

/** Monta um link wa.me a partir de um telefone (só dígitos) e uma mensagem opcional. */
export function toWhatsappUrl(phone: string, text?: string): string {
  const digits = phone.replace(/\D/g, '')
  return text ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : `https://wa.me/${digits}`
}

// ── Telefone brasileiro ──────────────────────────────────────────────────────
// Fonte única da máscara. Nasceu duplicada na tela de "Criar conta"; quando o
// campo de WhatsApp chegou em Membros, ficou sem máscara e as pessoas digitavam
// `19999999999` cru. Guardar sempre SÓ DÍGITOS: a máscara é conforto de quem
// digita, e o servidor compara dígitos.

export const soDigitosTelefone = (v: string) => v.replace(/\D/g, '')

/** (00) 0000-0000 e (00) 00000-0000, sem DDI. */
function mascaraLocal(d: string): string {
  if (d.length <= 10) {
    return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2')
  }
  return d.replace(/^(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2')
}

/**
 * Separa o número local (DDD + assinante) do DDI, pela MESMA regra usada na
 * máscara e no servidor. Existe como função própria porque máscara e validação
 * discordarem sobre o que é DDI foi como o defeito nasceu.
 *
 * O `+` é a marca da nossa própria saída: sem ele a máscara relê o prefixo que
 * ela mesma escreveu como se fosse dígito digitado, e o número explode a cada
 * tecla. Sem a marca, "55" só é DDI a partir de 12 dígitos — abaixo disso ele
 * é o DDD de Santa Maria/RS, que existe e não pode ser comido.
 */
export function telefoneParteLocal(v: string): string {
  const bruto = String(v ?? '')
  const d = soDigitosTelefone(bruto).slice(0, 13)
  const marcado = bruto.trimStart().startsWith('+')
  const ehDDI = d.startsWith('55') && (marcado || d.length >= 12)
  return (ehDDI ? d.slice(2) : d).slice(0, 11)
}

/**
 * Máscara com DDI fixo: o campo sempre mostra `+55`.
 *
 * O suporte cola o número direto do WhatsApp, e de lá ele sempre vem com o 55.
 * Quem cola não duplica; quem digita só DDD + número ganha o 55 sozinho. Os
 * dois caminhos terminam nos mesmos 13 dígitos, então o que fica gravado é um
 * formato só — que é o ponto.
 *
 * A versão anterior cortava em 11 dígitos: colar `55 (19) 99999-9999` virava
 * `(55) 19999-9999`, o DDI virava DDD e os dois últimos dígitos sumiam. Número
 * corrompido sem erro na tela, e o cliente nunca recebia o código.
 */
export function mascaraTelefone(v: string): string {
  const local = telefoneParteLocal(v)
  return local ? `+55 ${mascaraLocal(local)}` : ''
}

/** Completo = DDD + assinante (10 ou 11 dígitos). O DDI não conta: com ele,
    um número pela metade já passaria de 10 dígitos e entraria quebrado. */
export function telefoneCompleto(v: string): boolean {
  const n = telefoneParteLocal(v).length
  return n === 10 || n === 11
}
