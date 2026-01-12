export interface ProductType {
  id: string;
  name: string;
  color: string;
  order: number;
  enabled: boolean;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  color: string;
  icon?: string;
  enabled: boolean;
  initialQuantity: number;
  promoEligible: boolean;
  order: number;
  typeId: string;
  subgroup?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  overridePrice?: number;
}

export type PromoMode = 'type_list' | 'combo';

export interface Promo {
  id: string;
  name: string;
  mode: PromoMode;
  typeId?: string;
  maxQuantity: number;
  prices: { [quantity: number]: number };
  incrementalPrice?: number;
  incrementalPrice10Plus?: number;
  comboProductIds?: string[];
  comboPrice?: number;
  order: number;
}

export interface Transaction {
  id: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  currency: Currency;
  paymentMethod: PaymentMethod;
  timestamp: Date;
  appliedPromotions: string[];
  email?: string;
  overrideTotal?: number;
  specialPrice?: number;
  originalCurrency?: Currency; // The currency that was displayed during the transaction
  originalTotal?: number; // The total in the original display currency
  originalSubtotal?: number; // The subtotal in the original display currency
}

export type Currency = 'USD' | 'EUR' | 'GBP';
export type PaymentMethod = 'cash' | 'card' | 'qr';

export interface AppSettings {
  eventName: string;
  userName: string;
  currency: Currency;
  currencyRoundUp: boolean;
  isSetupComplete: boolean;
  appPromoPricing: AppPromoPricing;
  promos?: Promo[];
}

export interface AppPromoPricing {
  maxAppsForPromo: number;
  prices: { [quantity: number]: number };
}

export interface CurrencyConfig {
  symbol: string;
  name: string;
  rate: number; // Exchange rate relative to USD
}

export interface ExchangeRates {
  USD: number;
  EUR: number;
  GBP: number;
  lastUpdated: Date;
  customRates?: {
    USD?: number;
    EUR?: number;
    GBP?: number;
  };
}