// =============================================================================
// Web Push — o cliente (Fase 4).
//
// O envio é do servidor; aqui só a inscrição e as preferências. A assinatura
// VAPID nunca passa por aqui: o navegador recebe a chave PÚBLICA, se inscreve
// no push service dele e manda o endereço resultante para o portal.
// =============================================================================

import { api } from './client'

export interface PreferenciasDeAviso {
  /** Conversa nova entrou na fila sem dono. */
  fila: boolean
  /** Mensagem numa conversa que é minha. */
  minha_conversa: boolean
  /** Chamado atribuído a mim. */
  chamado_atribuido: boolean
}

export const pushApi = {
  /** GET /api/push/chave-publica — `ligado: false` quando não há chave no cofre. */
  chavePublica: () =>
    api.get<{ data: { ligado: boolean; chave: string | null } }>('/api/push/chave-publica'),

  /** POST /api/push/inscrever — o mesmo endpoint reinscrito substitui o anterior. */
  inscrever: (body: { endpoint: string; keys: { p256dh: string; auth: string }; ua?: string }) =>
    api.post<{ data: { id: string; nova: boolean } }>('/api/push/inscrever', body),

  /** DELETE /api/push/inscrever — sem endpoint, apaga todas as minhas. */
  desinscrever: (endpoint?: string) =>
    api.delete<{ data: { apagadas: number } }>(
      endpoint ? `/api/push/inscrever?endpoint=${encodeURIComponent(endpoint)}` : '/api/push/inscrever',
    ),

  lerPreferencias: () => api.get<{ data: PreferenciasDeAviso }>('/api/push/preferencias'),
  salvarPreferencias: (body: PreferenciasDeAviso) =>
    api.put<{ data: PreferenciasDeAviso }>('/api/push/preferencias', body),
}

/**
 * Converte a chave pública VAPID (base64url) para o `Uint8Array` que
 * `pushManager.subscribe` exige. O navegador não aceita a string.
 */
export function chaveParaBytes(base64url: string): Uint8Array {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const cru = atob(base64)
  const bytes = new Uint8Array(cru.length)
  for (let i = 0; i < cru.length; i++) bytes[i] = cru.charCodeAt(i)
  return bytes
}

/** O iOS só entrega Web Push quando a PWA está INSTALADA na tela de início. */
export function ehIosSemInstalar(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    // iPadOS moderno se apresenta como Mac; o toque é o que o distingue.
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  if (!ios) return false
  const instalada = window.matchMedia?.('(display-mode: standalone)')?.matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
  return !instalada
}
