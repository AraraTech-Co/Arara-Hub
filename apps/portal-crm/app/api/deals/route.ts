import type { NextRequest } from "next/server"
import { dealController } from "@/app/server/controllers/deal.controller"

export function GET() {
  return dealController.list()
}

export function POST(req: NextRequest) {
  return dealController.create(req)
}
