export interface TokenDocument {
  id: string;
  provider: string;
  jwt?: string;
  access?: string;
  refresh?: string;
  user_id: string;
}
