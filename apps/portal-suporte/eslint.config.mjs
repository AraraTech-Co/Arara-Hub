import nextConfig from 'eslint-config-next'

export default [
  // Cópias locais "arquivo 2.ext" (gitignored, artefato do macOS) não são código
  // do projeto — não lintar, senão todo achado sai duplicado.
  { ignores: ['**/* 2.ts', '**/* 2.tsx'] },

  ...nextConfig,

  // Guarda de dead code: acusa imports/variáveis/parâmetros nunca usados.
  // 'warn' por enquanto — o projeto nunca teve essa regra ativa, então há
  // um volume real de ocorrências pré-existentes para limpar antes de
  // considerar subir para 'error'. Argumentos prefixados com `_` são
  // ignorados (padrão comum para parâmetros obrigatórios por assinatura
  // mas não usados no corpo, ex.: handlers de rota do Next.js).
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },

  // Regra de arquitetura: route.ts não pode importar prisma diretamente.
  // Acesso ao banco pertence ao Repository. Se este arquivo acusar, mova
  // a lógica para Controller → Service → Repository.
  {
    files: ['app/api/**/route.ts', 'app/api/**/route.tsx'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          paths: [
            {
              name: '@/lib/prisma',
              message:
                '[arquitetura] route.ts não deve importar prisma diretamente. Use Controller → Service → Repository.',
            },
          ],
        },
      ],
    },
  },

  // Regra de DRY: componentes não devem redefinir mapas de status/prioridade.
  // Importe de @/lib/ticket-status ou @/lib/ticket-priority em vez disso.
  {
    files: ['app/_components/**/*.ts', 'app/_components/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'warn',
        {
          selector:
            "VariableDeclarator[id.name=/^(STATUS_LABELS|PRIORITY_LABELS|STATUS_COLORS|PRIORITY_COLORS)$/]",
          message:
            '[DRY] Não redefina mapas de status/prioridade. Importe de @/lib/ticket-status ou @/lib/ticket-priority.',
        },
      ],
    },
  },
]
