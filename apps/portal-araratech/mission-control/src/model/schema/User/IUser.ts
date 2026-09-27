export interface IUser {
  id: string;
  name: string;
  email: string;
  password?: string;
  date_created?: Date;
  last_active?: Date;
  disabled?: boolean;
  support_enabled?: boolean;
  "2fa_enabled"?: boolean;
  default_account?: string;
  facebook_id?: string;
  twitter_id?: string;
}
