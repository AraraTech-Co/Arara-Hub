import prisma from "../../prisma";
import Model from "../Model";
import { IPlan, PlanFeature, PlanPublic } from "./IPlan";
import { currencySymbol } from "@/helper/utility";

function formatPlan(record: Record<string, unknown>): Record<string, unknown> {
  return {
    id: record.id,
    name: record.name,
    price: record.price,
    interval: record.interval,
    currency: record.currency,
    features: record.features,
    stripe_product_id: record.stripeProductId,
    stripe_price_id: record.stripePriceId,
    active: record.active,
    is_free: record.isFree,
    date_created: record.dateCreated,
    date_updated: record.dateUpdated,
  };
}

export function toPublicPlan(record: Record<string, unknown>): PlanPublic {
  const currency = (record.currency as string) || "brl";
  const priceCents = record.price as number;

  return {
    id: record.id as string,
    name: record.name as string,
    price: priceCents / 100,
    interval: record.interval as string,
    currency: {
      name: currency,
      symbol: currencySymbol[currency] || currency.toUpperCase(),
    },
    features: (record.features as PlanFeature[]) || [],
    active: record.active as boolean | undefined,
    is_free: record.isFree as boolean | undefined,
    stripe_price_id: (record.stripePriceId as string | null) ?? null,
  };
}

export class Plan extends Model<IPlan> {
  constructor() {
    super(prisma.plan as never);
  }

  public custom = {
    read: {
      get: async ({
        id,
        activeOnly = false,
      }: {
        id?: string;
        activeOnly?: boolean;
      }) => {
        const where: Record<string, unknown> = {};
        if (id) where.id = id;
        if (activeOnly) where.active = true;

        const records = await prisma.plan.findMany({
          where,
          orderBy: { dateCreated: "asc" },
        });

        if (id) {
          return records[0] ? formatPlan(records[0] as never) : undefined;
        }

        return records.map((r) => formatPlan(r as never));
      },
      countAccountsByPlan: async (planId: string) => {
        return await prisma.account.count({ where: { plan: planId } });
      },
    },
    create: {
      create: async (data: {
        id: string;
        name: string;
        price: number;
        interval: string;
        currency?: string;
        features?: PlanFeature[];
        stripeProductId?: string | null;
        stripePriceId?: string | null;
        isFree?: boolean;
      }) => {
        const record = await prisma.plan.create({
          data: {
            id: data.id,
            name: data.name,
            price: data.price,
            interval: data.interval,
            currency: data.currency || "brl",
            features: data.features || [],
            stripeProductId: data.stripeProductId ?? null,
            stripePriceId: data.stripePriceId ?? null,
            active: true,
            isFree: data.isFree ?? false,
          },
        });

        return formatPlan(record as never);
      },
    },
    update: {
      update: async (
        id: string,
        data: Partial<{
          name: string;
          price: number;
          interval: string;
          currency: string;
          features: PlanFeature[];
          stripeProductId: string | null;
          stripePriceId: string | null;
          active: boolean;
        }>,
      ) => {
        const prismaData: Record<string, unknown> = {};
        if (data.name !== undefined) prismaData.name = data.name;
        if (data.price !== undefined) prismaData.price = data.price;
        if (data.interval !== undefined) prismaData.interval = data.interval;
        if (data.currency !== undefined) prismaData.currency = data.currency;
        if (data.features !== undefined) prismaData.features = data.features;
        if (data.stripeProductId !== undefined) {
          prismaData.stripeProductId = data.stripeProductId;
        }
        if (data.stripePriceId !== undefined) {
          prismaData.stripePriceId = data.stripePriceId;
        }
        if (data.active !== undefined) prismaData.active = data.active;

        const record = await prisma.plan.update({
          where: { id },
          data: prismaData,
        });

        return formatPlan(record as never);
      },
    },
  };
}
