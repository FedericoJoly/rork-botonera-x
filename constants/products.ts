import { CurrencyConfig, AppSettings, ProductType } from '@/types/sales';

export const CURRENCIES: Record<string, CurrencyConfig> = {
  USD: { symbol: '$', name: 'US Dollar', rate: 1 },
  EUR: { symbol: '€', name: 'Euro', rate: 1 },
  GBP: { symbol: '£', name: 'British Pound', rate: 1 }
};

export const DEFAULT_SETTINGS: AppSettings = {
  eventName: '',
  userName: '',
  currency: 'EUR',
  currencyRoundUp: false,
  isSetupComplete: false,
  appPromoPricing: {
    maxAppsForPromo: 7,
    prices: {
      2: 50,
      3: 75,
      4: 90,
      5: 110,
      6: 130,
      7: 150
    }
  }
};

export const DEFAULT_TYPES: ProductType[] = [
  { id: 'type_1', name: 'MagicPro Ideas', color: '#E3F2FD', order: 0, enabled: true },
  { id: 'type_2', name: 'Magic Stuff', color: '#FFF3E0', order: 1, enabled: true }
];
