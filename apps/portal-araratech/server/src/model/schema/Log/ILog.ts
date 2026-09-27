export interface ILog {
  id: string;
  time: Date;
  message?: string;
  body?: string;
  method?: string;
  endpoint?: string;
  account_id?: string;
  user_id?: string;
}
