import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db"
import { authConfig } from "@/auth.config"
import { rateLimit, rateLimitReset } from "@/lib/rate-limit"
import { araraAuthorize, isAraraServerEnabled } from "@/lib/arara-server"

const LOGIN_MAX_ATTEMPTS = 5
const LOGIN_WINDOW_MS = 15 * 60 * 1000

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Senha", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const email = (credentials.email as string).toLowerCase().trim()
        const password = credentials.password as string

        // Rate limit por e-mail: barra brute-force antes de tocar o banco.
        const rl = rateLimit(`login:${email}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS)
        if (!rl.allowed) {
          throw new Error(`Muitas tentativas. Tente novamente em ${Math.ceil(rl.retryAfterSec / 60)} min.`)
        }

        // Auth unificado Arara (quando ARARA_API_URL / NEXT_PUBLIC_ARARA_API_URL).
        if (isAraraServerEnabled()) {
          try {
            const user = await araraAuthorize(email, password)
            if (!user) return null
            rateLimitReset(`login:${email}`)
            return user
          } catch {
            return null
          }
        }

        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, name: true, email: true, passwordHash: true, role: true, active: true, teamId: true },
        })
        if (!user || !user.active) return null
        const valid = await bcrypt.compare(password, user.passwordHash)
        if (!valid) return null

        rateLimitReset(`login:${email}`) // sucesso limpa o contador
        return { id: user.id, name: user.name, email: user.email, role: user.role, teamId: user.teamId }
      },
    }),
  ],
})
