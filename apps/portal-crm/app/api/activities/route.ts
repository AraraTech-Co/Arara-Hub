import type { NextRequest } from "next/server"
import { activityController } from "@/app/server/controllers/activity.controller"

export function GET(req: NextRequest) {
  return activityController.list(req)
}

export function POST(req: NextRequest) {
  return activityController.create(req)
}
