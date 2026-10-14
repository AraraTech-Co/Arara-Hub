'use client'

// =============================================================================
// Registro do service worker (Fase 4).
//
// Só registra; NÃO pede permissão de notificação. Pedir permissão sem a pessoa
// ter clicado em nada é o jeito mais rápido de levar um "bloquear para sempre"
// — e, depois disso, não há como voltar a pedir. Quem decide ligar o aviso é a
// tela de preferências.
//
// Escopo `/` porque o portal é um export estático servido na raiz: o arquivo
// está em `public/sw.js`, que o build publica como `/sw.js`.
// =============================================================================

import { useEffect } from 'react'

export function RegistrarServiceWorker() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    // `localhost` sem https também vale: o navegador o trata como origem segura.
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Sem service worker o portal funciona igual, só sem aviso no sistema.
      // Não há o que dizer à pessoa aqui — a tela de preferências explica.
    })
  }, [])
  return null
}
