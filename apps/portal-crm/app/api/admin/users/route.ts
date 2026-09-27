import type { NextRequest } from "next/server"
import { userController } from "@/app/server/controllers/user.controller"

export function GET() {
  return userController.list()
}

export function POST(req: NextRequest) {
  return userController.create(req)
}
