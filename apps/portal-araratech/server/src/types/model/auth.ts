export interface AuthDocument {
  id: string;
}

export interface TokenData {
  provider: string;
  data: Record<string, unknown>;
  user: string;
}
