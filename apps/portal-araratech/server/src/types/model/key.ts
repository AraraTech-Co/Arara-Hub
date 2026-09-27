export interface KeyDocument {
  id: string;
  name?: string;
  key: string;
  scope: unknown[];
  date_created: Date;
  active: boolean;
  account_id: string;
}
