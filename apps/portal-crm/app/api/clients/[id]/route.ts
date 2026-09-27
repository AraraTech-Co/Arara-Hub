import type { NextRequest } from "next/server"
import { clientController } from "@/app/server/controllers/client.controller"

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return clientController.get(id)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return clientController.update(req, id)
}
