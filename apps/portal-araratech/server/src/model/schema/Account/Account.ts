import prisma from "../../prisma";
import Model from "../Model";
import { IAccount } from "./IAccount";
import StripeService from "../../lib/Stripe/stripe";

const stripe = new StripeService();

export class Account extends Model<IAccount> {
  constructor() {
    super(prisma.account as never);
  }

  public custom = {
    create: {
      create: async ({ plan }: { plan?: string } = {}) => {
        const data = {
          name: "My Account",
          active: true,
          dateCreated: new Date(),
          plan: plan || "free",
        };

        return await this.create.new(data as Partial<IAccount>);
      },
    },
    read: {
      get: async (id: string) => {
        const accountData = await prisma.account.findFirst({
          where: { id },
        });

        if (!accountData) return null;

        const ownerLink = await prisma.accountUser.findFirst({
          where: {
            accountId: id,
            permission: { in: ["owner", "master"] },
          },
          include: { user: { select: { name: true, email: true } } },
        });

        return {
          ...accountData,
          date_created: accountData.dateCreated,
          stripe_subscription_id: accountData.stripeSubscriptionId,
          stripe_customer_id: accountData.stripeCustomerId,
          owner_email: ownerLink?.user.email,
          owner_name: ownerLink?.user.name,
        };
      },
      subscription: async (id: string) => {
        let subscription, status;

        const accountData = await prisma.account.findFirst({ where: { id } });
        if (!accountData) throw { message: `Account doesn't exist` };

        if (
          accountData.plan !== "free" &&
          accountData.stripeSubscriptionId
        ) {
          subscription = await stripe.getSubscription(
            accountData.stripeSubscriptionId,
          );

          status =
            subscription?.status !== "active" &&
            subscription?.status !== "trialing"
              ? subscription?.latest_invoice?.payment_intent?.status
              : subscription.status;

          if (status !== "active" && status !== "trialing") {
            await prisma.account.update({
              where: { id },
              data: { active: false },
            });
          }
        } else if (accountData.plan === "free") {
          status = "active";
        }

        return {
          status: status,
          data: subscription,
        };
      },
      listOwners: async () => {
        const accounts = await prisma.account.findMany({
          include: {
            accountUsers: {
              where: { permission: { in: ["owner", "master"] } },
              include: { user: { select: { name: true, email: true } } },
              take: 1,
            },
          },
          orderBy: { dateCreated: "desc" },
        });

        return accounts.map((account) => {
          const owner = account.accountUsers[0]?.user;

          return {
            id: account.id,
            account_id: account.id,
            account_name: account.name,
            owner_name: owner?.name ?? "",
            owner_email: owner?.email ?? "",
            plan: account.plan || "free",
            plan_active: account.active,
            date_created: account.dateCreated,
          };
        });
      },
    },
    update: {
      update: async ({
        id,
        data,
      }: {
        id: string;
        data: Record<string, unknown>;
      }) => {
        const prismaData: Record<string, unknown> = {};
        if (data.name !== undefined) prismaData.name = data.name;
        if (data.email !== undefined) prismaData.email = data.email;
        if (data.active !== undefined) prismaData.active = data.active;
        if (data.plan !== undefined) prismaData.plan = data.plan;
        if (data.stripe_subscription_id !== undefined) {
          prismaData.stripeSubscriptionId = data.stripe_subscription_id;
        }
        if (data.stripe_customer_id !== undefined) {
          prismaData.stripeCustomerId = data.stripe_customer_id;
        }

        return await prisma.account.update({
          where: { id },
          data: prismaData,
        });
      },
    },
    delete: {
      deleteAccount: async (id: string) => {
        return await prisma.account.delete({ where: { id } });
      },
    },
  };
}
