export interface IUser {
  id: string;
  name: string;
  email: string;
  password?: string;
  date_created?: Date;
  last_active?: Date;
  disabled?: boolean;
  support_enabled: boolean;
  "2fa_enabled": boolean;
  "2fa_secret"?: string;
  "2fa_backup_code"?: string;
  default_account: string;
  facebook_id?: string;
  twitter_id?: string;
  account?: unknown[];
  push_token?: string;
  account_id?: string | null;
  has_password?: boolean | null;
  plan?: string;
  stripe_subscription_id?: string;
  stripe_customer_id?: string;
  permission?: string;
  onboarded?: boolean;
}
