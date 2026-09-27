export interface PlanFeature {
  name: string;
  checked: boolean;
}

export interface IPlan {
  id: string;
  name: string;
  price: number;
  interval: string;
  currency: string;
  features: PlanFeature[];
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
  active: boolean;
  is_free: boolean;
  date_created?: Date;
  date_updated?: Date;
}

export interface PlanPublic {
  id: string;
  name: string;
  price: number;
  interval: string;
  currency: {
    name: string;
    symbol: string;
  };
  features: PlanFeature[];
  active?: boolean;
  is_free?: boolean;
  stripe_price_id?: string | null;
}
