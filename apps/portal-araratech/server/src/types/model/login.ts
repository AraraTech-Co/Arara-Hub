export interface LoginDocument {
  id: string;
  user_id: string;
  ip: string;
  time: Date;
  browser?: string;
  device?: string;
}
