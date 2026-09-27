import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1,
  environment: process.env.NODE_ENV ?? 'production',
  // Não enviar erros em desenvolvimento local
  enabled: process.env.NODE_ENV === 'production',
})
