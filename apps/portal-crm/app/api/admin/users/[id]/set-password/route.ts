import type { NextRequest } from "next/server"
import { userController } from "@/app/server/controllers/user.controller"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return userController.setPassword(req, id)
}
