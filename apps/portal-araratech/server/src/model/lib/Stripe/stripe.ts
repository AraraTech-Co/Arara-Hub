import config from "config";
import Stripe from "stripe";

export default class StripeService {
  private stripe: Stripe;
  private settings: any = config.get("stripe");

  constructor(apiKey = process.env.STRIPE_SECRET_API_KEY) {
    this.stripe = new Stripe(apiKey || "", {
      apiVersion: "2022-11-15",
    });
  }

  async getSubscription(id: string) {
    return await this.stripe.subscriptions.retrieve(id, {
      expand: ["latest_invoice.payment_intent"],
    });
  }

  async updateSubscription({
    subscription,
    priceId,
    plan,
  }: {
    subscription: Stripe.Subscription;
    priceId?: string;
    plan?: string;
  }) {
    const item = { id: subscription.items.data[0].id };

    if (priceId) {
      return await this.stripe.subscriptions.update(subscription.id, {
        items: [{ ...item, price: priceId }],
      });
    }

    return await this.stripe.subscriptions.update(subscription.id, {
      items: [{ ...item, plan: plan as string }],
    });
  }

  async deleteSubscription(id: string) {
    return await this.stripe.subscriptions.del(id);
  }

  async getCustomer(id: string) {
    return await this.stripe.customers.retrieve(id, {
      expand: ["sources"],
    });
  }

  async createCustomer({ email, token }: { email: string; token: string }) {
    return await this.stripe.customers.create({
      email: email,
      source: token,
    });
  }

  async updateCustomer({ id, token }: { id: string; token: string }) {
    return await this.stripe.customers.update(id, {
      source: token,
    });
  }

  async listInvoices({ id, limit }: { id: string; limit: number | null }) {
    return await this.stripe.invoices.list({
      customer: id,
      limit: limit,
    });
  }

  async createProduct({
    name,
    metadata,
  }: {
    name: string;
    metadata?: Record<string, string>;
  }) {
    return await this.stripe.products.create({ name, metadata });
  }

  async updateProduct(
    id: string,
    data: { name?: string; metadata?: Record<string, string> },
  ) {
    return await this.stripe.products.update(id, data);
  }

  async createPrice({
    productId,
    unitAmount,
    currency,
    interval,
  }: {
    productId: string;
    unitAmount: number;
    currency: string;
    interval: "month" | "year";
  }) {
    return await this.stripe.prices.create({
      product: productId,
      unit_amount: unitAmount,
      currency,
      recurring: { interval },
    });
  }

  async archivePrice(priceId: string) {
    return await this.stripe.prices.update(priceId, { active: false });
  }

  async subscribeCustomer({
    id,
    priceId,
    plan,
  }: {
    id: string;
    priceId?: string;
    plan?: string;
  }) {
    const item = priceId ? { price: priceId } : { plan: plan as string };

    const subscription: any = await this.stripe.subscriptions.create({
      customer: id,
      items: [item],
      expand: ["latest_invoice.payment_intent"],
    });

    const amount =
      subscription.items.data[0].price?.unit_amount ??
      subscription.items.data[0].plan?.amount ??
      0;
    const currency =
      subscription.items.data[0].price?.currency ??
      subscription.items.data[0].plan?.currency ??
      "usd";

    subscription.price =
      (this.settings.currencySymbol?.[currency] ||
        currency.toUpperCase()) + (amount / 100).toFixed(2);

    return subscription;
  }

  async deleteCustomer(id: string) {
    return await this.stripe.customers.del(id);
  }
}
