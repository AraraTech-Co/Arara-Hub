import type { NextRequest } from "next/server"
import { stageController } from "@/app/server/controllers/stage.controller"

export function GET() {
  return stageController.list()
}

export function POST(req: NextRequest) {
  return stageController.create(req)
}
