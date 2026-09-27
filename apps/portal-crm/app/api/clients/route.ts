import type { NextRequest } from "next/server"
import { clientController } from "@/app/server/controllers/client.controller"

export function GET(req: NextRequest) {
  return clientController.list(req)
}

export function POST(req: NextRequest) {
  return clientController.create(req)
}
