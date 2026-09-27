import { auth } from "@/auth"
import { NextResponse } from "next/server"

export async function verify() {
  const session = await auth()
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) }
  }
  return { session }
}

export async function verifyRole(allowedRoles: string[]) {
  const { session, error } = await verify()
  if (error || !session) return { error: error ?? NextResponse.json({ error: "Não autenticado" }, { status: 401 }) }
  if (!allowedRoles.includes(session.user.role)) {
    return { error: NextResponse.json({ error: "Sem permissão" }, { status: 403 }) }
  }
  return { session }
}
