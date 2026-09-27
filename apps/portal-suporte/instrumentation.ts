export async function register() {
  // Client-only / Arara mode: no local Prisma cron jobs
  if (process.env.ARARA_CLIENT_ONLY === '1' || process.env.NEXT_PUBLIC_ARARA_API_URL) {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      await import('./sentry.server.config').catch(() => undefined)
    }
    return
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')

    const cron = await import('node-cron')
    const { autoCloseResolvedTickets } = await import('@/lib/jobs/auto-close-tickets')
    const { CRON_SCHEDULES } = await import('@/config/cron-schedules')

    cron.schedule(CRON_SCHEDULES.AUTO_CLOSE_TICKETS, autoCloseResolvedTickets, {
      timezone: 'America/Sao_Paulo',
    })

    autoCloseResolvedTickets().catch(() => {})
  }
}
