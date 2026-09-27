import config from "config";
import StripeService from "../Stripe/stripe";
import Database from "../../Database";
import { toPublicPlan } from "../../schema/Plan/Plan";
import { PlanFeature } from "../../schema/Plan/IPlan";
import * as mail from "@/helper/mail";
import { assert } from "@/helper/utility";

const settings: any = config.get("stripe");
const stripe = new StripeService();

const SLUG_REGEX = /^[a-z0-9-]+$/;
const VALID_INTERVALS = ["month", "year"];

export interface CreatePlanInput {
  id: string;
  name: string;
  price: number;
  interval: string;
  currency?: string;
  features?: PlanFeature[];
}

export interface UpdatePlanInput {
  name?: string;
  price?: number;
  interval?: string;
  currency?: string;
  features?: PlanFeature[];
}

export interface AssignPlanInput {
  plan?: string;
  active?: boolean;
}

function validateSlug(id: string) {
  assert(id && SLUG_REGEX.test(id), "Invalid plan id slug");
}

async function getPlansFromDb(activeOnly = false) {
  const records = await Database.Plan.custom.read.get({ activeOnly });
  return (records as Record<string, unknown>[]) || [];
}

async function getPlansWithFallback(activeOnly = false) {
  const records = await getPlansFromDb(activeOnly);
  if (records.length) {
    return records.map((r) => toPublicPlan(r));
  }

  return (settings.plans || []).map((p: any) => ({
    ...p,
    active: true,
    is_free: p.id === "free",
  }));
}

async function findPlanById(planId: string) {
  const record = await Database.Plan.custom.read.get({ id: planId });
  if (record) return record as Record<string, unknown>;

  const configPlan = (settings.plans || []).find((p: any) => p.id === planId);
  if (configPlan) {
    return {
      id: configPlan.id,
      name: configPlan.name,
      price: Math.round((configPlan.price || 0) * 100),
      interval: configPlan.interval || "month",
      currency: configPlan.currency?.name || "usd",
      features: configPlan.features || [],
      stripe_product_id: null,
      stripe_price_id: configPlan.id === "free" ? null : configPlan.id,
      active: true,
      is_free: configPlan.id === "free",
    };
  }

  return undefined;
}

class PlanService {
  async listPublic() {
    return getPlansWithFallback(true);
  }

  async listAll() {
    const records = await getPlansFromDb(false);
    if (records.length) {
      return records.map((r) => ({
        ...toPublicPlan(r),
        stripe_product_id: r.stripe_product_id,
        stripe_price_id: r.stripe_price_id,
        active: r.active,
        is_free: r.is_free,
      }));
    }
    return getPlansWithFallback(false);
  }

  async findById(planId: string) {
    return findPlanById(planId);
  }

  async create(input: CreatePlanInput) {
    validateSlug(input.id);
    assert(input.id !== "free", "Cannot create a plan with id free");
    assert(input.price > 0, "Price must be greater than zero");
    assert(VALID_INTERVALS.includes(input.interval), "Invalid billing interval");

    const existing = await Database.Plan.custom.read.get({ id: input.id });
    assert(!existing, "Plan id already exists");

    const priceCents = Math.round(input.price * 100);

    const product = await stripe.createProduct({
      name: input.name,
      metadata: { plan_id: input.id },
    });

    const stripePrice = await stripe.createPrice({
      productId: product.id,
      unitAmount: priceCents,
      currency: input.currency || "brl",
      interval: input.interval as "month" | "year",
    });

    const record = await Database.Plan.custom.create.create({
      id: input.id,
      name: input.name,
      price: priceCents,
      interval: input.interval,
      currency: input.currency || "brl",
      features: input.features || [],
      stripeProductId: product.id,
      stripePriceId: stripePrice.id,
      isFree: false,
    });

    return toPublicPlan(record as Record<string, unknown>);
  }

  async update(planId: string, input: UpdatePlanInput) {
    const record = (await Database.Plan.custom.read.get({
      id: planId,
    })) as Record<string, unknown> | undefined;
    assert(record, "Plan not found");

    const updates: UpdatePlanInput & {
      stripePriceId?: string | null;
    } = { ...input };

    if (record.stripe_product_id && input.name) {
      await stripe.updateProduct(record.stripe_product_id as string, {
        name: input.name,
      });
    }

    const priceChanged =
      input.price !== undefined &&
      Math.round(input.price * 100) !== (record.price as number);
    const intervalChanged =
      input.interval !== undefined && input.interval !== record.interval;
    const currencyChanged =
      input.currency !== undefined && input.currency !== record.currency;

    if (
      !record.is_free &&
      (priceChanged || intervalChanged || currencyChanged)
    ) {
      assert(record.stripe_product_id, "Plan has no Stripe product");

      const newPriceCents =
        input.price !== undefined
          ? Math.round(input.price * 100)
          : (record.price as number);
      const newInterval = input.interval || (record.interval as string);
      const newCurrency = input.currency || (record.currency as string);

      const stripePrice = await stripe.createPrice({
        productId: record.stripe_product_id as string,
        unitAmount: newPriceCents,
        currency: newCurrency,
        interval: newInterval as "month" | "year",
      });

      if (record.stripe_price_id) {
        await stripe.archivePrice(record.stripe_price_id as string);
      }

      updates.price = newPriceCents;
      updates.interval = newInterval;
      updates.currency = newCurrency;
      (updates as any).stripePriceId = stripePrice.id;
    } else if (input.price !== undefined) {
      updates.price = Math.round(input.price * 100);
    }

    const updated = await Database.Plan.custom.update.update(planId, {
      name: updates.name,
      price: updates.price as number | undefined,
      interval: updates.interval,
      currency: updates.currency,
      features: updates.features,
      stripePriceId: (updates as any).stripePriceId,
    });

    return toPublicPlan(updated as Record<string, unknown>);
  }

  async deactivate(planId: string) {
    assert(planId !== "free", "Cannot deactivate the free plan");

    const record = await Database.Plan.custom.read.get({ id: planId });
    assert(record, "Plan not found");

    const accountCount =
      await Database.Plan.custom.read.countAccountsByPlan(planId);
    assert(accountCount === 0, "Plan is in use by active accounts");

    if ((record as any).stripe_price_id) {
      await stripe.archivePrice((record as any).stripe_price_id);
    }

    await Database.Plan.custom.update.update(planId, { active: false });
    return { id: planId, active: false };
  }

  async assignPlanToAccount(accountId: string, input: AssignPlanInput) {
    const accountData = await Database.Account.custom.read.get(accountId);
    assert(accountData, "Account does not exist");

    if (input.active !== undefined) {
      await Database.Account.custom.update.update({
        id: accountId,
        data: { active: input.active },
      });
    }

    if (!input.plan) {
      return {
        account_id: accountId,
        plan: accountData.plan,
        active: input.active ?? accountData.active,
      };
    }

    const plan = await findPlanById(input.plan);
    assert(plan, "No plan with that ID");
    assert(plan.active !== false, "Plan is not active");

    const planId = plan.id as string;
    const isFree = plan.is_free || planId === "free";

    if (accountData.plan === "free" && !isFree) {
      throw {
        message:
          "The account holder will need to enter their card details and upgrade to a paid plan.",
        status: 402,
        plan: planId,
      };
    }

    if (isFree) {
      if (accountData.stripe_subscription_id) {
        const subscription = await stripe.getSubscription(
          accountData.stripe_subscription_id,
        );

        await Database.Account.custom.update.update({
          id: accountId,
          data: { stripe_subscription_id: null, plan: planId },
        });

        if (subscription.status !== "canceled") {
          await stripe.deleteSubscription(accountData.stripe_subscription_id);
        }
      } else {
        await Database.Account.custom.update.update({
          id: accountId,
          data: { plan: planId },
        });
      }
    } else if (accountData.stripe_subscription_id) {
      let subscription = await stripe.getSubscription(
        accountData.stripe_subscription_id,
      );

      if (
        subscription.status === "trialing" ||
        subscription.status === "active"
      ) {
        const priceId = plan.stripe_price_id as string;
        assert(priceId, "Paid plan has no Stripe price configured");

        subscription = await stripe.updateSubscription({
          subscription,
          priceId,
        });

        await Database.Account.custom.update.update({
          id: accountId,
          data: { plan: planId },
        });
      } else if (subscription.status === "canceled") {
        await Database.Account.custom.update.update({
          id: accountId,
          data: { stripe_subscription_id: null, plan: "free" },
        });

        throw {
          message:
            "The account holder will need to enter their card details and upgrade to a paid plan.",
          status: 402,
        };
      }
    } else if (!isFree) {
      throw {
        message:
          "The account holder will need to enter their card details and upgrade to a paid plan.",
        status: 402,
      };
    } else {
      await Database.Account.custom.update.update({
        id: accountId,
        data: { plan: planId },
      });
    }

    if (input.plan && accountData.owner_email) {
      try {
        await mail.send({
          to: accountData.owner_email,
          template: "plan-updated",
          content: {
            name: accountData.owner_name,
            plan: plan.name,
          },
        });
      } catch {
        console.error("Failed sending plan-updated email");
      }
    }

    const updated = await Database.Account.custom.read.get(accountId);

    return {
      account_id: accountId,
      plan: updated?.plan,
      active: updated?.active,
    };
  }

  getStripePriceId(plan: Record<string, unknown>) {
    if (plan.is_free) return null;
    return (plan.stripe_price_id as string) || (plan.id as string);
  }

  formatPlanForEmail(plan: Record<string, unknown>) {
    const publicPlan = toPublicPlan(plan);
    return {
      name: publicPlan.name,
      price: `${publicPlan.currency.symbol}${publicPlan.price}`,
    };
  }
}

export default new PlanService();
