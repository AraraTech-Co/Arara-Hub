import type { NextRequest } from "next/server"
import { dealController } from "@/app/server/controllers/deal.controller"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return dealController.move(req, id)
}
