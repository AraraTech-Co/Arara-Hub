export interface InviteDocument {
  id: string;
  email: string;
  permission: string;
  account_id: string;
  date_sent: Date;
  used: boolean;
}
