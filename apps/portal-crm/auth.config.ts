import type { NextAuthConfig } from "next-auth"
import type { User } from "next-auth"
import { canAccessPath } from "@/lib/auth/access-control"

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl
      if (pathname === "/login") return true

      if (!auth?.user) return false

      return canAccessPath(pathname, auth.user.role)
    },
    jwt({ token, user }) {
      if (user) {
        const u = user as User & { role: string; teamId: string | null }
        token.id = u.id ?? ""
        token.role = u.role
        token.teamId = u.teamId
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.id as string
      session.user.role = token.role as string
      session.user.teamId = (token.teamId ?? null) as string | null
      return session
    },
  },
}
