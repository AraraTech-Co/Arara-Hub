export interface AccountDocument {
  id: string;
  plan?: string;
  name?: string;
  email?: string;
  active: boolean;
  stripe_subscription_id?: string;
  stripe_customer_id?: string;
  date_created?: Date;
}
