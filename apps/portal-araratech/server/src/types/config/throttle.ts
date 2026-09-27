export interface ThrottleConfig {
  api: {
    max: number;
    windowMs: number;
    headers: boolean;
    message: string;
  };
  signup: {
    max: number;
    windowMs: number;
    headers: boolean;
    message: string;
  };
  signin: {
    max: number;
    windowMs: number;
    headers: boolean;
    message: string;
  };
  password_reset: {
    max: number;
    windowMs: number;
    headers: boolean;
    message: string;
  };
}
