// =============================================================================
// Service worker do Portal de Suporte (Fase 4).
//
// Faz DUAS coisas, e nada além:
//   1. mostra a notificação que chega por Web Push;
//   2. abre a conversa/chamado quando a pessoa clica.
//
// NÃO faz cache de nada. O portal é um export estático servido por trás de uma
// API com sessão; cache aqui significaria servir tela velha com dado de outra
// pessoa depois de uma troca de login — e consertar isso é mais arriscado do
// que o ganho de velocidade.
//
// A REGRA QUE IMPORTA: com uma aba VISÍVEL, não mostra notificação. Quem está
// olhando a tela já tem o sino; dois avisos para a mesma coisa é o tipo de
// barulho que faz a pessoa desligar os dois. Essa decisão tem de ser aqui,
// porque só o navegador sabe se alguma aba está à vista — o servidor não sabe.
// =============================================================================

self.addEventListener('install', () => {
  // Assume o controle sem esperar a aba antiga fechar: na primeira visita
  // depois do deploy, a pessoa já fica coberta.
  self.skipWaiting()
})

self.addEventListener('activate', (evento) => {
  evento.waitUntil(self.clients.claim())
})

self.addEventListener('push', (evento) => {
  evento.waitUntil(
    (async () => {
      let dados = {}
      try {
        dados = evento.data ? evento.data.json() : {}
      } catch {
        // Payload que não é JSON: mostra o texto cru em vez de engolir o aviso.
        dados = { title: 'Portal de Suporte', body: evento.data ? evento.data.text() : '' }
      }

      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const alguemOlhando = janelas.some((c) => c.visibilityState === 'visible')
      // Aba à vista: o sino resolve. Sair daqui sem mostrar nada é de propósito.
      if (alguemOlhando) return

      await self.registration.showNotification(dados.title || 'Portal de Suporte', {
        body: dados.body || '',
        icon: '/apple-icon.png',
        badge: '/apple-icon.png',
        // `tag` por tipo: dois avisos do mesmo tipo se substituem em vez de
        // empilhar cinco cartões na tela de bloqueio.
        tag: dados.tipo || 'portal-suporte',
        renotify: true,
        data: { url: dados.url || '/inbox' },
      })
    })(),
  )
})

self.addEventListener('notificationclick', (evento) => {
  evento.notification.close()
  const destino = (evento.notification.data && evento.notification.data.url) || '/inbox'
  evento.waitUntil(
    (async () => {
      const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // Já há uma aba do portal: navega nela em vez de abrir a quinta aba.
      for (const c of janelas) {
        if (!c.url.includes('/auth/')) {
          try {
            await c.focus()
            if ('navigate' in c) await c.navigate(destino)
            return
          } catch { /* cai para abrir nova */ }
        }
      }
      await self.clients.openWindow(destino)
    })(),
  )
})
