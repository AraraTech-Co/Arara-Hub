import type { NextRequest } from "next/server"
import { userController } from "@/app/server/controllers/user.controller"

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return userController.update(req, id)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return userController.remove(id)
}
