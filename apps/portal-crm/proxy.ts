import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { auth } from "@/auth"
import { canAccessPath } from "@/lib/auth/access-control"

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  const isPublic =
    /^\/api\/auth(\/|$)/.test(pathname) ||
    pathname === "/login" ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"

  if (isPublic) return NextResponse.next()

  try {
    const session = await auth()
    if (!session) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
      }
      return NextResponse.redirect(new URL("/login", req.url))
    }

    // Enforce de nível por rota (fonte única: access-control.json).
    // Sem isto, uma rota /api/admin/* que esqueça requireAdmin ficaria aberta.
    if (!canAccessPath(pathname, session.user.role)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json({ error: "Sem permissão" }, { status: 403 })
      }
      return NextResponse.redirect(new URL("/dashboard", req.url))
    }

    return NextResponse.next()
  } catch (err) {
    console.error("[proxy] auth error:", err)
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Erro de autenticação" }, { status: 500 })
    }
    return NextResponse.redirect(new URL("/login", req.url))
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
