/**
 * Arara Platform — server-only authorize for NextAuth.
 * Do not import from Client Components.
 */

import { prisma } from "@/lib/db"

function araraBaseUrl() {
  return (
    process.env.ARARA_API_URL ||
    process.env.NEXT_PUBLIC_ARARA_API_URL ||
    "http://localhost:4100"
  ).replace(/\/$/, "")
}

export function isAraraServerEnabled() {
  return Boolean(process.env.ARARA_API_URL || process.env.NEXT_PUBLIC_ARARA_API_URL)
}

/** Validate against Arara and map to a NextAuth user shape. */
export async function araraAuthorize(email: string, password: string) {
  const base = araraBaseUrl()
  const res = await fetch(`${base}/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (!res.ok) return null

  const normalized = email.toLowerCase().trim()
  const local = await prisma.user.findUnique({
    where: { email: normalized },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      teamId: true,
    },
  })

  if (local) {
    if (!local.active) return null
    return {
      id: local.id,
      name: local.name,
      email: local.email,
      role: local.role,
      teamId: local.teamId,
    }
  }

  const roles: string[] = data.user?.roles || []
  const role = roles.includes("admin") ? "admin" : "vendedor"
  return {
    id: data.user.id,
    name: data.user.name || normalized,
    email: data.user.email || normalized,
    role,
    teamId: null as string | null,
  }
}
