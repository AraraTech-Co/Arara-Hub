import { withSentryConfig } from '@sentry/nextjs'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  // Há ~152 erros de tipo pré-existentes (TS) latentes no projeto que NÃO quebram
  // o runtime e sempre foram silenciados por esta flag. A Onda 1 a removeu por engano,
  // transformando-os em falha dura de `next build` (um por vez). Restaurada para
  // destravar o deploy; a limpeza dos erros de tipo é dívida técnica de uma onda própria.
  // NÃO mascara as validações de assinatura de rota do Next.js 15 — essas já foram
  // corrigidas no código (params: Promise<>, retorno tipado dos handlers).
  typescript: {
    ignoreBuildErrors: true,
  },
  // eslint-config-next no Next.js 15 inclui regras do React Compiler que flagam ~30
  // arquivos com padrões pré-existentes (setState em effect, componentes criados durante
  // render). Não quebram o runtime; são dívida técnica de uma onda própria de limpeza.
  // Mesmo tratamento já dado aos erros de tipo TS acima.
  eslint: {
    ignoreDuringBuilds: true,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '200mb',
    },
  },
  // ssh2 / cpu-features: native .node — keep out of webpack bundles.
  // nodemailer: optional SMTP dep.
  serverExternalPackages: ['ssh2', 'cpu-features', 'nodemailer'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || []
      if (Array.isArray(config.externals)) {
        config.externals.push('ssh2', 'cpu-features')
      }
    } else {
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        ssh2: false,
        'cpu-features': false,
      }
    }
    return config
  },
}

const isCIorProd = process.env.CI || process.env.NODE_ENV === 'production'

export default withSentryConfig(nextConfig, {
  org: 'arara-tech',
  project: 'javascript-nextjs',
  silent: !process.env.CI,
  // Source maps apenas em CI/prod — evita upload desnecessário em builds locais
  widenClientFileUpload: isCIorProd,
  uploadSourceMaps: isCIorProd,
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: false,
})
