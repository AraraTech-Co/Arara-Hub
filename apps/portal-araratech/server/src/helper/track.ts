import prisma from "@/model/prisma";
import { NextFunction, Request, Response } from "express";

const track = async (req: Request | Record<string, unknown>, _: Response, next: NextFunction) => {
  if (
    (!(req as Record<string, unknown>).account &&
      !(req as Record<string, unknown>).user) ||
    process.env.NODE_ENV === "test"
  ) {
    next();
    return;
  }

  try {
    const userId = (req as Record<string, unknown>).user as string;
    const accountId = (req as Record<string, unknown>).account as string;
    const route = (req as Record<string, unknown>).route as { path?: string };

    const tracker = await prisma.tracker.upsert({
      where: { userId },
      create: { accountId, userId },
      update: { accountId },
    });

    await prisma.trackerEntry.create({
      data: {
        trackerId: tracker.id,
        path: route?.path || "/",
        permission: ((req as Record<string, unknown>).permission as string) || null,
        provider: ((req as Record<string, unknown>).provider as string) || null,
      },
    });

    next();
  } catch (e) {
    console.error("Failed Tracking User. Skipping...", e);
    next();
  }
};

export default track;
