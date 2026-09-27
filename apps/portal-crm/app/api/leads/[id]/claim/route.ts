import type { NextRequest } from "next/server"
import { leadController } from "@/app/server/controllers/lead.controller"

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return leadController.claim(id)
}
