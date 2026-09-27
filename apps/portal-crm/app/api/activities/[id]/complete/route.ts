import type { NextRequest } from "next/server"
import { activityController } from "@/app/server/controllers/activity.controller"

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return activityController.complete(req, id)
}
