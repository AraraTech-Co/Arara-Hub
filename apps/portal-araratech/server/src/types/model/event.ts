export interface EventDocument {
  id: string;
  name: string;
  metadata?: Record<string, unknown>;
  time: Date;
  user_id?: string;
  account_id?: string;
}
