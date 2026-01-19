export type UserRole = 'admin' | 'standard';

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  email: string;
  fullName: string;
  role: UserRole;
  createdAt: Date;
  googleId?: string;
  avatarUrl?: string;
}

export interface Event {
  id: string;
  userId: string;
  eventName: string;
  userName: string;
  currency: string;
  currencyRoundUp: boolean;
  appPromoPricing: string;
  isFinalized: boolean;
  isTemplate: boolean;
  templatePin?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventData {
  event: Event;
  products: any[];
  transactions: any[];
  settings: any;
  productTypes?: any[];
}
