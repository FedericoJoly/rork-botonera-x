import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Product, Transaction, AppSettings, ProductType } from '@/types/sales';
import { User, Event, EventData, UserRole } from '@/types/auth';

// Storage keys for web fallback
const STORAGE_KEYS = {
  PRODUCTS: 'sales_products',
  TRANSACTIONS: 'sales_transactions',
  SETTINGS: 'sales_settings',
  CURRENCY: 'sales_currency',
  EXCHANGE_RATES: 'sales_exchange_rates',
  USERS: 'sales_users',
  EVENTS: 'sales_events',
  CURRENT_USER: 'sales_current_user',
  CURRENT_EVENT: 'sales_current_event',
};

class DatabaseService {
  private db: SQLite.SQLiteDatabase | null = null;
  private isInitialized = false;
  private initializationPromise: Promise<void> | null = null;
  private saveEventDataLock = false;
  private saveEventDataQueue: (() => Promise<void>)[] = [];

  async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.isInitialized) return;
    
    // If initialization is in progress, wait for it
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start initialization
    this.initializationPromise = (async () => {
      try {
        // Web uses AsyncStorage fallback
        if (Platform.OS === 'web') {
          console.log('🗄️ Using AsyncStorage for web...');
          this.isInitialized = true;
          console.log('✅ Web storage initialized successfully');
          return;
        }
        
        console.log('🗄️ Initializing SQLite database...');
        this.db = await SQLite.openDatabaseAsync('sales.db');
        
        await this.createTables();
        this.isInitialized = true;
        console.log('✅ Database initialized successfully');
      } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        this.db = null;
        this.isInitialized = false;
        this.initializationPromise = null;
        throw error;
      }
    })();

    return this.initializationPromise;
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Products table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        color TEXT NOT NULL,
        icon TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        initialQuantity INTEGER NOT NULL DEFAULT 0,
        promoEligible INTEGER NOT NULL DEFAULT 0,
        "order" INTEGER NOT NULL DEFAULT 0,
        typeId TEXT NOT NULL DEFAULT 'type_1',
        subgroup TEXT
      );
    `);

    // Transactions table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY,
        items TEXT NOT NULL,
        subtotal REAL NOT NULL,
        discount REAL NOT NULL,
        total REAL NOT NULL,
        currency TEXT NOT NULL,
        paymentMethod TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        appliedPromotions TEXT,
        email TEXT,
        overrideTotal REAL,
        specialPrice REAL,
        originalCurrency TEXT,
        originalTotal REAL,
        originalSubtotal REAL
      );
    `);

    // Settings table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        userName TEXT NOT NULL,
        eventName TEXT NOT NULL,
        currency TEXT NOT NULL,
        isSetupComplete INTEGER NOT NULL DEFAULT 0,
        appPromoPricing TEXT NOT NULL
      );
    `);

    // Currency preference table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS preferences (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    // Users table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        passwordHash TEXT NOT NULL,
        email TEXT NOT NULL DEFAULT '',
        fullName TEXT NOT NULL DEFAULT '',
        role TEXT NOT NULL DEFAULT 'standard',
        createdAt TEXT NOT NULL
      );
    `);

    // Events table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        eventName TEXT NOT NULL,
        userName TEXT NOT NULL,
        currency TEXT NOT NULL,
        currencyRoundUp INTEGER NOT NULL DEFAULT 0,
        appPromoPricing TEXT NOT NULL,
        isFinalized INTEGER NOT NULL DEFAULT 0,
        isTemplate INTEGER NOT NULL DEFAULT 0,
        templatePin TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id)
      );
    `);

    // Event products table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS event_products (
        id TEXT PRIMARY KEY,
        eventId TEXT NOT NULL,
        name TEXT NOT NULL,
        price REAL NOT NULL,
        color TEXT NOT NULL,
        icon TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        initialQuantity INTEGER NOT NULL DEFAULT 0,
        promoEligible INTEGER NOT NULL DEFAULT 0,
        "order" INTEGER NOT NULL DEFAULT 0,
        typeId TEXT NOT NULL DEFAULT 'type_1',
        subgroup TEXT,
        FOREIGN KEY (eventId) REFERENCES events(id)
      );
    `);

    // Product types table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS product_types (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        "order" INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1
      );
    `);

    // Event product types table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS event_product_types (
        id TEXT PRIMARY KEY,
        eventId TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        "order" INTEGER NOT NULL DEFAULT 0,
        enabled INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (eventId) REFERENCES events(id)
      );
    `);

    // Event transactions table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS event_transactions (
        id TEXT PRIMARY KEY,
        eventId TEXT NOT NULL,
        items TEXT NOT NULL,
        subtotal REAL NOT NULL,
        discount REAL NOT NULL,
        total REAL NOT NULL,
        currency TEXT NOT NULL,
        paymentMethod TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        appliedPromotions TEXT,
        email TEXT,
        overrideTotal REAL,
        specialPrice REAL,
        originalCurrency TEXT,
        originalTotal REAL,
        originalSubtotal REAL,
        FOREIGN KEY (eventId) REFERENCES events(id)
      );
    `);

    // Run migrations to add new columns to existing tables
    await this.runMigrations();

    // Initialize default user
    await this.initializeDefaultUser();

    console.log('✅ Database tables created/verified');
  }

  private async runMigrations(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Check if the new columns exist in transactions table
      const tableInfo = await this.db.getAllAsync(
        "PRAGMA table_info(transactions)"
      ) as any[];
      
      const columnNames = tableInfo.map(col => col.name);
      
      // Add missing columns if they don't exist
      if (!columnNames.includes('overrideTotal')) {
        await this.db.execAsync('ALTER TABLE transactions ADD COLUMN overrideTotal REAL');
        console.log('✅ Added overrideTotal column to transactions table');
      }
      if (!columnNames.includes('specialPrice')) {
        await this.db.execAsync('ALTER TABLE transactions ADD COLUMN specialPrice REAL');
        console.log('✅ Added specialPrice column to transactions table');
      }
      if (!columnNames.includes('originalCurrency')) {
        await this.db.execAsync('ALTER TABLE transactions ADD COLUMN originalCurrency TEXT');
        console.log('✅ Added originalCurrency column to transactions table');
      }
      if (!columnNames.includes('originalTotal')) {
        await this.db.execAsync('ALTER TABLE transactions ADD COLUMN originalTotal REAL');
        console.log('✅ Added originalTotal column to transactions table');
      }
      if (!columnNames.includes('originalSubtotal')) {
        await this.db.execAsync('ALTER TABLE transactions ADD COLUMN originalSubtotal REAL');
        console.log('✅ Added originalSubtotal column to transactions table');
      }
      
      // Check settings table for new columns
      const settingsTableInfo = await this.db.getAllAsync(
        "PRAGMA table_info(settings)"
      ) as any[];
      const settingsColumnNames = settingsTableInfo.map(col => col.name);
      
      if (!settingsColumnNames.includes('currencyRoundUp')) {
        await this.db.execAsync('ALTER TABLE settings ADD COLUMN currencyRoundUp INTEGER NOT NULL DEFAULT 0');
        console.log('✅ Added currencyRoundUp column to settings table');
      }
      if (!settingsColumnNames.includes('currencyConversionAdvantage')) {
        await this.db.execAsync('ALTER TABLE settings ADD COLUMN currencyConversionAdvantage REAL NOT NULL DEFAULT 0');
        console.log('✅ Added currencyConversionAdvantage column to settings table');
      }
      
      // Check products table for subgroup column
      const productsTableInfo = await this.db.getAllAsync(
        "PRAGMA table_info(products)"
      ) as any[];
      const productsColumnNames = productsTableInfo.map(col => col.name);
      
      if (!productsColumnNames.includes('subgroup')) {
        await this.db.execAsync('ALTER TABLE products ADD COLUMN subgroup TEXT');
        console.log('✅ Added subgroup column to products table');
      }
      
      // Check users table for email column
      const usersTableInfo = await this.db.getAllAsync(
        "PRAGMA table_info(users)"
      ) as any[];
      const usersColumnNames = usersTableInfo.map(col => col.name);
      
      if (!usersColumnNames.includes('email')) {
        await this.db.execAsync('ALTER TABLE users ADD COLUMN email TEXT NOT NULL DEFAULT ""');
        console.log('✅ Added email column to users table');
      }

      if (!usersColumnNames.includes('fullName')) {
        await this.db.execAsync('ALTER TABLE users ADD COLUMN fullName TEXT NOT NULL DEFAULT ""');
        console.log('✅ Added fullName column to users table');
      }

      if (!usersColumnNames.includes('role')) {
        await this.db.execAsync('ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT "standard"');
        console.log('✅ Added role column to users table');
      }
      
      // Check events table for promos column
      const eventsTableInfo = await this.db.getAllAsync(
        "PRAGMA table_info(events)"
      ) as any[];
      const eventsColumnNames = eventsTableInfo.map(col => col.name);
      
      if (!eventsColumnNames.includes('promos')) {
        await this.db.execAsync('ALTER TABLE events ADD COLUMN promos TEXT');
        console.log('✅ Added promos column to events table');
      }
      
      if (!eventsColumnNames.includes('isTemplate')) {
        await this.db.execAsync('ALTER TABLE events ADD COLUMN isTemplate INTEGER NOT NULL DEFAULT 0');
        console.log('✅ Added isTemplate column to events table');
      }
      
      if (!eventsColumnNames.includes('templatePin')) {
        await this.db.execAsync('ALTER TABLE events ADD COLUMN templatePin TEXT');
        console.log('✅ Added templatePin column to events table');
      }

      // Check event_products table for typeId column
      const eventProductsTableInfo = await this.db.getAllAsync(
        "PRAGMA table_info(event_products)"
      ) as any[];
      const eventProductsColumnNames = eventProductsTableInfo.map(col => col.name);
      
      if (!eventProductsColumnNames.includes('typeId')) {
        await this.db.execAsync('ALTER TABLE event_products ADD COLUMN typeId TEXT NOT NULL DEFAULT \'type_1\'');
        console.log('✅ Added typeId column to event_products table');
      }
      
      // Check products table for typeId column
      const productsTableInfo2 = await this.db.getAllAsync(
        "PRAGMA table_info(products)"
      ) as any[];
      const productsColumnNames2 = productsTableInfo2.map(col => col.name);
      
      if (!productsColumnNames2.includes('typeId')) {
        await this.db.execAsync('ALTER TABLE products ADD COLUMN typeId TEXT NOT NULL DEFAULT \'type_1\'');
        console.log('✅ Added typeId column to products table');
      }

      // Check product_types table for enabled column
      const productTypesTableInfo = await this.db.getAllAsync(
        "PRAGMA table_info(product_types)"
      ) as any[];
      const productTypesColumnNames = productTypesTableInfo.map(col => col.name);
      
      if (!productTypesColumnNames.includes('enabled')) {
        await this.db.execAsync('ALTER TABLE product_types ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1');
        console.log('✅ Added enabled column to product_types table');
      }

      // Check event_product_types table for enabled column
      const eventProductTypesTableInfo = await this.db.getAllAsync(
        "PRAGMA table_info(event_product_types)"
      ) as any[];
      const eventProductTypesColumnNames = eventProductTypesTableInfo.map(col => col.name);
      
      if (!eventProductTypesColumnNames.includes('enabled')) {
        await this.db.execAsync('ALTER TABLE event_product_types ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1');
        console.log('✅ Added enabled column to event_product_types table');
      }
    } catch (error) {
      console.error('⚠️ Migration error (non-critical):', error);
      // Don't throw - migrations are non-critical
    }
  }

  // Products methods
  async saveProducts(products: Product[]): Promise<void> {
    // Ensure database is initialized
    await this.initialize();
    
    // Web fallback
    if (Platform.OS === 'web') {
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
        console.log(`✅ Saved ${products.length} products to AsyncStorage`);
        return;
      } catch (error) {
        console.error('❌ Failed to save products to AsyncStorage:', error);
        throw error;
      }
    }
    
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.execAsync('DELETE FROM products;');
      
      for (const product of products) {
        await this.db.runAsync(
          `INSERT INTO products (id, name, price, color, icon, enabled, initialQuantity, promoEligible, "order", typeId, subgroup) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            product.id,
            product.name,
            product.price,
            product.color,
            product.icon || null,
            product.enabled ? 1 : 0,
            product.initialQuantity,
            product.promoEligible ? 1 : 0,
            product.order,
            product.typeId,
            product.subgroup || null
          ]
        );
      }
      console.log(`✅ Saved ${products.length} products to database`);
    } catch (error) {
      console.error('❌ Failed to save products:', error);
      throw error;
    }
  }

  async loadProducts(): Promise<Product[]> {
    // Ensure database is initialized
    await this.initialize();
    
    // Web fallback
    if (Platform.OS === 'web') {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEYS.PRODUCTS);
        if (stored) {
          const products = JSON.parse(stored) as Product[];
          console.log(`✅ Loaded ${products.length} products from AsyncStorage`);
          return products;
        }
        console.log('⚠️ No products found in AsyncStorage');
        return [];
      } catch (error) {
        console.error('❌ Error loading products from AsyncStorage:', error);
        return [];
      }
    }
    
    if (!this.db) {
      console.error('❌ Error loading products from database: Database not initialized');
      throw new Error('Database not initialized');
    }

    try {
      const result = await this.db.getAllAsync(
        'SELECT * FROM products ORDER BY "order" ASC'
      ) as any[];

      const products: Product[] = result.map(row => ({
        id: row.id,
        name: row.name,
        price: row.price,
        color: row.color,
        icon: row.icon,
        enabled: Boolean(row.enabled),
        initialQuantity: row.initialQuantity,
        promoEligible: Boolean(row.promoEligible),
        order: row.order,
        typeId: row.typeId || (row.type === 'Magic Stuff' ? 'type_2' : 'type_1'),
        subgroup: row.subgroup
      }));

      console.log(`✅ Loaded ${products.length} products from database`);
      return products;
    } catch (error) {
      console.error('❌ Error loading products from database:', error);
      return [];
    }
  }

  // Transactions methods
  async saveTransaction(transaction: Transaction): Promise<void> {
    // Ensure database is initialized
    await this.initialize();
    
    // Web fallback - load existing, add new, save all
    if (Platform.OS === 'web') {
      try {
        const existing = await this.loadTransactions();
        const updated = [transaction, ...existing];
        await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(updated));
        console.log(`✅ Saved transaction ${transaction.id} to AsyncStorage`);
        return;
      } catch (error) {
        console.error('❌ Failed to save transaction to AsyncStorage:', error);
        throw error;
      }
    }
    
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.runAsync(
        `INSERT INTO transactions (id, items, subtotal, discount, total, currency, paymentMethod, timestamp, appliedPromotions, email, overrideTotal, specialPrice, originalCurrency, originalTotal, originalSubtotal) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          transaction.id,
          JSON.stringify(transaction.items),
          transaction.subtotal,
          transaction.discount,
          transaction.total,
          transaction.currency,
          transaction.paymentMethod,
          transaction.timestamp.toISOString(),
          JSON.stringify(transaction.appliedPromotions),
          transaction.email || null,
          transaction.overrideTotal || null,
          transaction.specialPrice || null,
          transaction.originalCurrency || null,
          transaction.originalTotal || null,
          transaction.originalSubtotal || null
        ]
      );
      console.log(`✅ Saved transaction ${transaction.id} to database`);
    } catch (error) {
      console.error('❌ Failed to save transaction:', error);
      throw error;
    }
  }

  async saveTransactions(transactions: Transaction[]): Promise<void> {
    // Ensure database is initialized
    await this.initialize();
    
    // Web fallback
    if (Platform.OS === 'web') {
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
        console.log(`✅ Saved ${transactions.length} transactions to AsyncStorage`);
        return;
      } catch (error) {
        console.error('❌ Failed to save transactions to AsyncStorage:', error);
        throw error;
      }
    }
    
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.execAsync('DELETE FROM transactions;');
      
      for (const transaction of transactions) {
        await this.db.runAsync(
          `INSERT INTO transactions (id, items, subtotal, discount, total, currency, paymentMethod, timestamp, appliedPromotions, email, overrideTotal, specialPrice, originalCurrency, originalTotal, originalSubtotal) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            transaction.id,
            JSON.stringify(transaction.items),
            transaction.subtotal,
            transaction.discount,
            transaction.total,
            transaction.currency,
            transaction.paymentMethod,
            transaction.timestamp.toISOString(),
            JSON.stringify(transaction.appliedPromotions),
            transaction.email || null,
            transaction.overrideTotal || null,
            transaction.specialPrice || null,
            transaction.originalCurrency || null,
            transaction.originalTotal || null,
            transaction.originalSubtotal || null
          ]
        );
      }
      console.log(`✅ Saved ${transactions.length} transactions to database`);
    } catch (error) {
      console.error('❌ Failed to save transactions:', error);
      throw error;
    }
  }

  async loadTransactions(): Promise<Transaction[]> {
    // Ensure database is initialized
    await this.initialize();
    
    // Web fallback
    if (Platform.OS === 'web') {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
        if (stored) {
          const transactions = JSON.parse(stored) as any[];
          const parsed = transactions.map(t => ({
            ...t,
            timestamp: new Date(t.timestamp)
          }));
          console.log(`✅ Loaded ${parsed.length} transactions from AsyncStorage`);
          return parsed;
        }
        console.log('⚠️ No transactions found in AsyncStorage');
        return [];
      } catch (error) {
        console.error('❌ Error loading transactions from AsyncStorage:', error);
        return [];
      }
    }
    
    if (!this.db) {
      console.error('❌ Registry: Emergency restore failed! Database not initialized');
      throw new Error('Database not initialized');
    }

    try {
      const result = await this.db.getAllAsync(
        'SELECT * FROM transactions ORDER BY timestamp DESC'
      ) as any[];

      const transactions: Transaction[] = result.map(row => {
        try {
          let items = [];
          let appliedPromotions = [];
          
          // Safely parse items
          if (typeof row.items === 'string' && row.items.trim().length > 0) {
            try {
              items = JSON.parse(row.items);
            } catch (itemError) {
              console.error('❌ Error parsing items for transaction:', row.id, itemError);
              console.error('❌ Raw items value:', row.items);
              items = [];
            }
          } else if (Array.isArray(row.items)) {
            items = row.items;
          }
          
          // Safely parse appliedPromotions
          if (typeof row.appliedPromotions === 'string' && row.appliedPromotions.trim().length > 0) {
            try {
              appliedPromotions = JSON.parse(row.appliedPromotions);
            } catch (promoError) {
              console.error('❌ Error parsing appliedPromotions for transaction:', row.id, promoError);
              appliedPromotions = [];
            }
          } else if (Array.isArray(row.appliedPromotions)) {
            appliedPromotions = row.appliedPromotions;
          }
          
          return {
            id: row.id,
            items: items,
            subtotal: row.subtotal,
            discount: row.discount,
            total: row.total,
            currency: row.currency,
            paymentMethod: row.paymentMethod,
            timestamp: new Date(row.timestamp),
            appliedPromotions: appliedPromotions,
            email: row.email,
            overrideTotal: row.overrideTotal,
            specialPrice: row.specialPrice,
            originalCurrency: row.originalCurrency,
            originalTotal: row.originalTotal,
            originalSubtotal: row.originalSubtotal
          };
        } catch (parseError) {
          console.error('❌ Critical error parsing transaction:', row.id, parseError);
          console.error('❌ Transaction data:', JSON.stringify(row));
          // Return a minimal valid transaction on parse error
          return {
            id: row.id,
            items: [],
            subtotal: row.subtotal || 0,
            discount: row.discount || 0,
            total: row.total || 0,
            currency: row.currency || 'EUR',
            paymentMethod: row.paymentMethod || 'cash',
            timestamp: new Date(row.timestamp),
            appliedPromotions: [],
            email: row.email
          };
        }
      });

      console.log(`✅ Loaded ${transactions.length} transactions from database`);
      return transactions;
    } catch (error) {
      console.error('❌ Registry: Emergency restore failed!', error);
      return [];
    }
  }

  // Settings methods
  async saveSettings(settings: AppSettings): Promise<void> {
    // Ensure database is initialized
    await this.initialize();
    
    // Web fallback
    if (Platform.OS === 'web') {
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
        console.log('✅ Saved settings to AsyncStorage');
        return;
      } catch (error) {
        console.error('❌ Failed to save settings to AsyncStorage:', error);
        throw error;
      }
    }
    
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.runAsync(
        `INSERT OR REPLACE INTO settings (id, userName, eventName, currency, isSetupComplete, appPromoPricing, currencyRoundUp) 
         VALUES (1, ?, ?, ?, ?, ?, ?)`,
        [
          settings.userName,
          settings.eventName,
          settings.currency,
          settings.isSetupComplete ? 1 : 0,
          JSON.stringify(settings.appPromoPricing),
          settings.currencyRoundUp ? 1 : 0
        ]
      );
      console.log('✅ Saved settings to database');
    } catch (error) {
      console.error('❌ Failed to save settings:', error);
      throw error;
    }
  }

  async loadSettings(): Promise<AppSettings> {
    // Ensure database is initialized
    await this.initialize();
    
    // Web fallback
    if (Platform.OS === 'web') {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
        if (stored) {
          const settings = JSON.parse(stored) as AppSettings;
          console.log('✅ Loaded settings from AsyncStorage');
          return settings;
        }
        console.log('⚠️ No settings found in AsyncStorage');
        return {
          userName: '',
          eventName: '',
          currency: 'EUR',
          isSetupComplete: false,
          currencyRoundUp: true,
          appPromoPricing: {
            maxAppsForPromo: 7,
            prices: { 2: 50, 3: 75, 4: 90, 5: 110, 6: 130, 7: 150 }
          }
        };
      } catch (error) {
        console.error('❌ Error loading settings from AsyncStorage:', error);
        return {
          userName: '',
          eventName: '',
          currency: 'EUR',
          isSetupComplete: false,
          currencyRoundUp: true,
          appPromoPricing: {
            maxAppsForPromo: 7,
            prices: { 2: 50, 3: 75, 4: 90, 5: 110, 6: 130, 7: 150 }
          }
        };
      }
    }
    
    if (!this.db) throw new Error('Database not initialized');

    try {
      const result = await this.db.getFirstAsync(
        'SELECT * FROM settings WHERE id = 1'
      ) as any;

      if (result) {
        let appPromoPricing;
        try {
          appPromoPricing = typeof result.appPromoPricing === 'string' 
            ? JSON.parse(result.appPromoPricing) 
            : result.appPromoPricing;
        } catch {
          console.warn('⚠️ Failed to parse appPromoPricing, using default');
          appPromoPricing = {
            maxAppsForPromo: 7,
            prices: {
              2: 50,
              3: 75,
              4: 90,
              5: 110,
              6: 130,
              7: 150
            }
          };
        }
        
        const settings: AppSettings = {
          userName: result.userName,
          eventName: result.eventName,
          currency: result.currency,
          isSetupComplete: Boolean(result.isSetupComplete),
          appPromoPricing: appPromoPricing,
          currencyRoundUp: Boolean(result.currencyRoundUp)
        };
        console.log('✅ Loaded settings from database');
        return settings;
      } else {
        console.log('⚠️ No settings found, using defaults');
        return {
          userName: '',
          eventName: '',
          currency: 'EUR',
          isSetupComplete: false,
          currencyRoundUp: true,
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
      }
    } catch (error) {
      console.error('❌ Failed to load settings:', error);
      return {
        userName: '',
        eventName: '',
        currency: 'EUR',
        isSetupComplete: false,
        currencyRoundUp: true,
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
    }
  }

  // Currency preference methods
  async saveCurrency(currency: string): Promise<void> {
    // Ensure database is initialized
    await this.initialize();
    
    // Web fallback
    if (Platform.OS === 'web') {
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.CURRENCY, currency);
        console.log('✅ Saved currency preference to AsyncStorage');
        return;
      } catch (error) {
        console.error('❌ Failed to save currency to AsyncStorage:', error);
        throw error;
      }
    }
    
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.runAsync(
        'INSERT OR REPLACE INTO preferences (key, value) VALUES ("currency", ?)',
        [currency]
      );
      console.log('✅ Saved currency preference to database');
    } catch (error) {
      console.error('❌ Failed to save currency:', error);
      throw error;
    }
  }

  // Exchange rates methods
  async saveExchangeRates(rates: { USD: number; EUR: number; GBP: number; customRates?: any }): Promise<void> {
    // Ensure database is initialized
    await this.initialize();
    
    // Web fallback
    if (Platform.OS === 'web') {
      try {
        await AsyncStorage.setItem(STORAGE_KEYS.EXCHANGE_RATES, JSON.stringify(rates));
        console.log('✅ Saved exchange rates to AsyncStorage');
        return;
      } catch (error) {
        console.error('❌ Failed to save exchange rates to AsyncStorage:', error);
        throw error;
      }
    }
    
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.runAsync(
        'INSERT OR REPLACE INTO preferences (key, value) VALUES ("exchangeRates", ?)',
        [JSON.stringify(rates)]
      );
      console.log('✅ Saved exchange rates to database');
    } catch (error) {
      console.error('❌ Failed to save exchange rates:', error);
      throw error;
    }
  }

  async loadExchangeRates(): Promise<{ USD: number; EUR: number; GBP: number; customRates?: any } | null> {
    // Ensure database is initialized
    await this.initialize();
    
    // Web fallback
    if (Platform.OS === 'web') {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEYS.EXCHANGE_RATES);
        if (stored) {
          console.log('✅ Loaded exchange rates from AsyncStorage');
          return JSON.parse(stored);
        }
        console.log('⚠️ No exchange rates found in AsyncStorage');
        return null;
      } catch (error) {
        console.error('❌ Failed to load exchange rates from AsyncStorage:', error);
        return null;
      }
    }
    
    if (!this.db) throw new Error('Database not initialized');

    try {
      const result = await this.db.getFirstAsync(
        'SELECT value FROM preferences WHERE key = "exchangeRates"'
      ) as any;

      if (result) {
        console.log('✅ Loaded exchange rates from database');
        return JSON.parse(result.value);
      } else {
        console.log('⚠️ No exchange rates found in database');
        return null;
      }
    } catch (error) {
      console.error('❌ Failed to load exchange rates:', error);
      return null;
    }
  }

  async loadCurrency(): Promise<string> {
    // Ensure database is initialized
    await this.initialize();
    
    // Web fallback
    if (Platform.OS === 'web') {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEYS.CURRENCY);
        if (stored) {
          console.log('✅ Loaded currency preference from AsyncStorage');
          return stored;
        }
        console.log('⚠️ No currency preference found, using EUR');
        return 'EUR';
      } catch (error) {
        console.error('❌ Failed to load currency from AsyncStorage:', error);
        return 'EUR';
      }
    }
    
    if (!this.db) throw new Error('Database not initialized');

    try {
      const result = await this.db.getFirstAsync(
        'SELECT value FROM preferences WHERE key = "currency"'
      ) as any;

      if (result) {
        console.log('✅ Loaded currency preference from database');
        return result.value;
      } else {
        console.log('⚠️ No currency preference found, using EUR');
        return 'EUR';
      }
    } catch (error) {
      console.error('❌ Failed to load currency:', error);
      return 'EUR';
    }
  }

  // Clear methods
  async clearTransactions(): Promise<void> {
    // Ensure database is initialized
    await this.initialize();
    
    // Web fallback
    if (Platform.OS === 'web') {
      try {
        await AsyncStorage.removeItem(STORAGE_KEYS.TRANSACTIONS);
        console.log('✅ Cleared all transactions from AsyncStorage');
        return;
      } catch (error) {
        console.error('❌ Failed to clear transactions from AsyncStorage:', error);
        throw error;
      }
    }
    
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.execAsync('DELETE FROM transactions;');
      console.log('✅ Cleared all transactions from database');
    } catch (error) {
      console.error('❌ Failed to clear transactions:', error);
      throw error;
    }
  }

  async clearAllData(): Promise<void> {
    // Ensure database is initialized
    await this.initialize();
    
    // Web fallback
    if (Platform.OS === 'web') {
      try {
        await AsyncStorage.multiRemove([
          STORAGE_KEYS.PRODUCTS,
          STORAGE_KEYS.TRANSACTIONS,
          STORAGE_KEYS.SETTINGS,
          STORAGE_KEYS.CURRENCY,
          STORAGE_KEYS.EXCHANGE_RATES,
        ]);
        console.log('✅ Cleared all data from AsyncStorage');
        return;
      } catch (error) {
        console.error('❌ Failed to clear all data from AsyncStorage:', error);
        throw error;
      }
    }
    
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.execAsync('DELETE FROM products;');
      await this.db.execAsync('DELETE FROM transactions;');
      await this.db.execAsync('DELETE FROM settings;');
      await this.db.execAsync('DELETE FROM preferences;');
      console.log('✅ Cleared all data from database');
    } catch (error) {
      console.error('❌ Failed to clear all data:', error);
      throw error;
    }
  }

  // Debug methods
  async debugDatabase(): Promise<void> {
    // Ensure database is initialized
    await this.initialize();
    
    // Web fallback
    if (Platform.OS === 'web') {
      console.log('🔍 === ASYNCSTORAGE DEBUG ===');
      try {
        const products = await AsyncStorage.getItem(STORAGE_KEYS.PRODUCTS);
        const transactions = await AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
        const settings = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
        const currency = await AsyncStorage.getItem(STORAGE_KEYS.CURRENCY);
        
        console.log('📦 Products in storage:', products ? JSON.parse(products).length : 0);
        console.log('📦 Transactions in storage:', transactions ? JSON.parse(transactions).length : 0);
        console.log('⚙️ Settings in storage:', settings ? 'YES' : 'NO');
        console.log('🎯 Currency in storage:', currency || 'EUR');
        console.log('🔍 === ASYNCSTORAGE DEBUG COMPLETE ===');
      } catch (error) {
        console.error('💥 Error debugging AsyncStorage:', error);
      }
      return;
    }
    
    if (!this.db) throw new Error('Database not initialized');

    try {
      console.log('🔍 === DATABASE DEBUG ===');
      
      const products = await this.db.getAllAsync('SELECT COUNT(*) as count FROM products') as any[];
      const transactions = await this.db.getAllAsync('SELECT COUNT(*) as count FROM transactions') as any[];
      const settings = await this.db.getAllAsync('SELECT COUNT(*) as count FROM settings') as any[];
      const preferences = await this.db.getAllAsync('SELECT COUNT(*) as count FROM preferences') as any[];
      
      console.log('📦 Products in DB:', products[0]?.count || 0);
      console.log('📦 Transactions in DB:', transactions[0]?.count || 0);
      console.log('⚙️ Settings in DB:', settings[0]?.count || 0);
      console.log('🎯 Preferences in DB:', preferences[0]?.count || 0);
      
      console.log('🔍 === DATABASE DEBUG COMPLETE ===');
    } catch (error) {
      console.error('💥 Error debugging database:', error);
    }
  }

  async createUser(username: string, passwordHash: string, email: string = '', fullName: string = '', role?: UserRole): Promise<User> {
    await this.initialize();
    
    // Determine role: if not specified, check if this is the first user (should be admin)
    let userRole: UserRole = role || 'standard';
    if (!role) {
      const allUsers = await this.getAllUsers();
      if (allUsers.length === 0) {
        userRole = 'admin';
        console.log('🔐 First user created - automatically set as admin');
      }
    }
    
    const user: User = {
      id: Date.now().toString(),
      username,
      passwordHash,
      email,
      fullName,
      role: userRole,
      createdAt: new Date()
    };

    if (Platform.OS === 'web') {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.USERS);
      const users: User[] = stored ? JSON.parse(stored) : [];
      users.push(user);
      await AsyncStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
      console.log('✅ User created in AsyncStorage');
      return user;
    }

    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(
      'INSERT INTO users (id, username, passwordHash, email, fullName, role, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [user.id, user.username, user.passwordHash, user.email, user.fullName, user.role, user.createdAt.toISOString()]
    );
    console.log('✅ User created in database');
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    await this.initialize();

    if (Platform.OS === 'web') {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.USERS);
      if (!stored) return [];
      const users: any[] = JSON.parse(stored);
      return users.map(u => ({
        ...u,
        createdAt: new Date(u.createdAt),
        email: u.email || '',
        fullName: u.fullName || '',
        role: u.role || 'standard'
      }));
    }

    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getAllAsync(
      'SELECT * FROM users ORDER BY username ASC'
    ) as any[];

    return result.map(row => ({
      id: row.id,
      username: row.username,
      passwordHash: row.passwordHash,
      email: row.email || '',
      fullName: row.fullName || '',
      role: (row.role || 'standard') as UserRole,
      createdAt: new Date(row.createdAt)
    }));
  }

  async updateUser(userId: string, username: string, email: string, fullName?: string): Promise<void> {
    await this.initialize();

    if (Platform.OS === 'web') {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.USERS);
      if (!stored) return;
      const users: any[] = JSON.parse(stored);
      const userIndex = users.findIndex(u => u.id === userId);
      if (userIndex >= 0) {
        users[userIndex].username = username;
        users[userIndex].email = email;
        if (fullName !== undefined) {
          users[userIndex].fullName = fullName;
        }
        await AsyncStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
        console.log('✅ User updated in AsyncStorage');
      }
      return;
    }

    if (!this.db) throw new Error('Database not initialized');
    if (fullName !== undefined) {
      await this.db.runAsync(
        'UPDATE users SET username = ?, email = ?, fullName = ? WHERE id = ?',
        [username, email, fullName, userId]
      );
    } else {
      await this.db.runAsync(
        'UPDATE users SET username = ?, email = ? WHERE id = ?',
        [username, email, userId]
      );
    }
    console.log('✅ User updated in database');
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    await this.initialize();

    if (Platform.OS === 'web') {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.USERS);
      if (!stored) return;
      const users: any[] = JSON.parse(stored);
      const userIndex = users.findIndex(u => u.id === userId);
      if (userIndex >= 0) {
        users[userIndex].passwordHash = passwordHash;
        await AsyncStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
        console.log('✅ Password updated in AsyncStorage');
      }
      return;
    }

    if (!this.db) throw new Error('Database not initialized');
    await this.db.runAsync(
      'UPDATE users SET passwordHash = ? WHERE id = ?',
      [passwordHash, userId]
    );
    console.log('✅ Password updated in database');
  }

  async updateUserRole(userId: string, role: UserRole): Promise<void> {
    await this.initialize();

    if (Platform.OS === 'web') {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.USERS);
      if (!stored) return;
      const users: any[] = JSON.parse(stored);
      const userIndex = users.findIndex(u => u.id === userId);
      if (userIndex >= 0) {
        users[userIndex].role = role;
        await AsyncStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
        console.log('✅ User role updated in AsyncStorage');
      }
      return;
    }

    if (!this.db) throw new Error('Database not initialized');
    await this.db.runAsync(
      'UPDATE users SET role = ? WHERE id = ?',
      [role, userId]
    );
    console.log('✅ User role updated in database');
  }

  async deleteUser(userId: string): Promise<void> {
    await this.initialize();

    if (Platform.OS === 'web') {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.USERS);
      if (!stored) return;
      const users: any[] = JSON.parse(stored);
      const filtered = users.filter(u => u.id !== userId);
      await AsyncStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(filtered));
      console.log('✅ User deleted from AsyncStorage');
      return;
    }

    if (!this.db) throw new Error('Database not initialized');
    await this.db.runAsync('DELETE FROM users WHERE id = ?', [userId]);
    console.log('✅ User deleted from database');
  }

  async updateEventName(eventId: string, newName: string): Promise<void> {
    await this.initialize();

    if (Platform.OS === 'web') {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
      if (!stored) return;
      const events: any[] = JSON.parse(stored);
      const eventIndex = events.findIndex(e => e.id === eventId);
      if (eventIndex >= 0) {
        const userId = events[eventIndex].userId;
        const duplicateName = events.find(e => e.id !== eventId && e.userId === userId && e.eventName.toLowerCase() === newName.toLowerCase());
        if (duplicateName) {
          throw new Error(`An event with the name "${newName}" already exists`);
        }
        events[eventIndex].eventName = newName;
        events[eventIndex].updatedAt = new Date().toISOString();
        await AsyncStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
        console.log('✅ Event name updated in AsyncStorage');
      }
      return;
    }

    if (!this.db) throw new Error('Database not initialized');
    
    const event = await this.db.getFirstAsync(
      'SELECT userId FROM events WHERE id = ?',
      [eventId]
    ) as any;
    
    if (event) {
      const duplicate = await this.db.getFirstAsync(
        'SELECT id FROM events WHERE userId = ? AND eventName = ? AND id != ? COLLATE NOCASE',
        [event.userId, newName, eventId]
      ) as any;
      
      if (duplicate) {
        throw new Error(`An event with the name "${newName}" already exists`);
      }
    }
    
    await this.db.runAsync(
      'UPDATE events SET eventName = ?, updatedAt = ? WHERE id = ?',
      [newName, new Date().toISOString(), eventId]
    );
    console.log('✅ Event name updated in database');
  }

  async getUserByUsername(username: string): Promise<User | null> {
    await this.initialize();

    if (Platform.OS === 'web') {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.USERS);
      if (!stored) return null;
      const users: any[] = JSON.parse(stored);
      const user = users.find(u => u.username === username);
      return user ? { ...user, createdAt: new Date(user.createdAt), email: user.email || '', fullName: user.fullName || '', role: user.role || 'standard' } : null;
    }

    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getFirstAsync(
      'SELECT * FROM users WHERE username = ?',
      [username]
    ) as any;

    if (!result) return null;

    return {
      id: result.id,
      username: result.username,
      passwordHash: result.passwordHash,
      email: result.email || '',
      fullName: result.fullName || '',
      role: (result.role || 'standard') as UserRole,
      createdAt: new Date(result.createdAt),
      googleId: result.googleId,
      avatarUrl: result.avatarUrl
    };
  }

  async getUserByEmail(email: string): Promise<User | null> {
    await this.initialize();

    if (Platform.OS === 'web') {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.USERS);
      if (!stored) return null;
      const users: any[] = JSON.parse(stored);
      const user = users.find(u => u.email === email);
      return user ? { 
        ...user, 
        createdAt: new Date(user.createdAt), 
        email: user.email || '', 
        fullName: user.fullName || '',
        role: user.role || 'standard',
        googleId: user.googleId,
        avatarUrl: user.avatarUrl
      } : null;
    }

    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getFirstAsync(
      'SELECT * FROM users WHERE email = ?',
      [email]
    ) as any;

    if (!result) return null;

    return {
      id: result.id,
      username: result.username,
      passwordHash: result.passwordHash,
      email: result.email || '',
      fullName: result.fullName || '',
      role: (result.role || 'standard') as UserRole,
      createdAt: new Date(result.createdAt),
      googleId: result.googleId,
      avatarUrl: result.avatarUrl
    };
  }

  async createUserFromGoogle(googleId: string, email: string, fullName: string, avatarUrl?: string): Promise<User> {
    await this.initialize();

    // Check if this is the first user
    const allUsers = await this.getAllUsers();
    const userRole: UserRole = allUsers.length === 0 ? 'admin' : 'standard';

    const user: User = {
      id: `google_${googleId}`,
      username: email.split('@')[0],
      passwordHash: '',
      email,
      fullName,
      role: userRole,
      createdAt: new Date(),
      googleId,
      avatarUrl
    };

    if (Platform.OS === 'web') {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.USERS);
      const users: User[] = stored ? JSON.parse(stored) : [];
      users.push(user);
      await AsyncStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
      console.log('✅ Google user created in AsyncStorage');
      return user;
    }

    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(
      'INSERT INTO users (id, username, passwordHash, email, fullName, role, createdAt, googleId, avatarUrl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [user.id, user.username, user.passwordHash, user.email, user.fullName, user.role, user.createdAt.toISOString(), user.googleId || null, user.avatarUrl || null]
    );
    console.log('✅ Google user created in database');
    return user;
  }

  async saveCurrentUser(userId: string): Promise<void> {
    await this.initialize();
    
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_USER, userId);
      return;
    }

    if (!this.db) throw new Error('Database not initialized');
    await this.db.runAsync(
      'INSERT OR REPLACE INTO preferences (key, value) VALUES ("currentUser", ?)',
      [userId]
    );
  }

  async getCurrentUser(): Promise<string | null> {
    await this.initialize();
    
    if (Platform.OS === 'web') {
      return await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_USER);
    }

    if (!this.db) throw new Error('Database not initialized');
    const result = await this.db.getFirstAsync(
      'SELECT value FROM preferences WHERE key = "currentUser"'
    ) as any;
    return result?.value || null;
  }

  async clearCurrentUser(): Promise<void> {
    await this.initialize();
    
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
      await AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_EVENT);
      return;
    }

    if (!this.db) throw new Error('Database not initialized');
    await this.db.execAsync('DELETE FROM preferences WHERE key = "currentUser"');
    await this.db.execAsync('DELETE FROM preferences WHERE key = "currentEvent"');
  }

  async createEvent(userId: string, eventName: string, userName: string, settings: AppSettings): Promise<Event> {
    await this.initialize();
    
    const existingEvents = await this.getUserEvents(userId);
    const duplicateName = existingEvents.find(e => e.eventName.toLowerCase() === eventName.toLowerCase());
    if (duplicateName) {
      throw new Error(`An event with the name "${eventName}" already exists`);
    }
    
    const event: Event = {
      id: Date.now().toString(),
      userId,
      eventName,
      userName,
      currency: settings.currency,
      currencyRoundUp: settings.currencyRoundUp,
      appPromoPricing: JSON.stringify(settings.appPromoPricing),
      isFinalized: false,
      isTemplate: false,
      templatePin: undefined,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (Platform.OS === 'web') {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
      const events: Event[] = stored ? JSON.parse(stored) : [];
      events.push(event);
      await AsyncStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
      console.log('✅ Event created in AsyncStorage');
      return event;
    }

    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(
      'INSERT INTO events (id, userId, eventName, userName, currency, currencyRoundUp, appPromoPricing, isFinalized, isTemplate, templatePin, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        event.id,
        event.userId,
        event.eventName,
        event.userName,
        event.currency,
        event.currencyRoundUp ? 1 : 0,
        event.appPromoPricing,
        event.isFinalized ? 1 : 0,
        event.isTemplate ? 1 : 0,
        event.templatePin || null,
        event.createdAt.toISOString(),
        event.updatedAt.toISOString()
      ]
    );
    console.log('✅ Event created in database');
    return event;
  }

  async saveEventData(eventId: string, products: Product[], transactions: Transaction[], productTypes?: ProductType[], promos?: any[], settings?: AppSettings): Promise<void> {
    await this.initialize();

    if (Platform.OS === 'web') {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
      const events: any[] = stored ? JSON.parse(stored) : [];
      const eventIndex = events.findIndex(e => e.id === eventId);
      if (eventIndex >= 0) {
        events[eventIndex].products = products;
        events[eventIndex].transactions = transactions;
        events[eventIndex].productTypes = productTypes || [];
        events[eventIndex].promos = promos || [];
        events[eventIndex].updatedAt = new Date().toISOString();
        if (settings) {
          events[eventIndex].currency = settings.currency;
          events[eventIndex].currencyRoundUp = settings.currencyRoundUp;
          events[eventIndex].eventName = settings.eventName;
        }
        await AsyncStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
      }
      console.log('✅ Event data saved to AsyncStorage');
      return;
    }

    if (!this.db) throw new Error('Database not initialized');

    // Prevent concurrent saves - use a simple queue system
    if (this.saveEventDataLock) {
      return new Promise<void>((resolve, reject) => {
        this.saveEventDataQueue.push(async () => {
          try {
            await this.saveEventDataInternal(eventId, products, transactions, productTypes, promos, settings);
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    }

    this.saveEventDataLock = true;
    try {
      await this.saveEventDataInternal(eventId, products, transactions, productTypes, promos, settings);
    } finally {
      this.saveEventDataLock = false;
      
      // Process next item in queue
      if (this.saveEventDataQueue.length > 0) {
        const next = this.saveEventDataQueue.shift();
        if (next) {
          next().catch(err => console.error('❌ Queued save failed:', err));
        }
      }
    }
  }

  private async saveEventDataInternal(eventId: string, products: Product[], transactions: Transaction[], productTypes?: ProductType[], promos?: any[], settings?: AppSettings): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    try {
      await this.db.execAsync('BEGIN IMMEDIATE TRANSACTION');

      await this.db.runAsync('DELETE FROM event_products WHERE eventId = ?', [eventId]);
      await this.db.runAsync('DELETE FROM event_transactions WHERE eventId = ?', [eventId]);
      await this.db.runAsync('DELETE FROM event_product_types WHERE eventId = ?', [eventId]);

      for (const product of products) {
        await this.db.runAsync(
          'INSERT INTO event_products (id, eventId, name, price, color, icon, enabled, initialQuantity, promoEligible, "order", typeId, subgroup) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            `${eventId}_${product.id}`,
            eventId,
            product.name,
            product.price,
            product.color,
            product.icon || null,
            product.enabled ? 1 : 0,
            product.initialQuantity,
            product.promoEligible ? 1 : 0,
            product.order,
            product.typeId,
            product.subgroup || null
          ]
        );
      }

      const typesToSave = productTypes || [];
      for (const type of typesToSave) {
        await this.db.runAsync(
          'INSERT INTO event_product_types (id, eventId, name, color, "order", enabled) VALUES (?, ?, ?, ?, ?, ?)',
          [
            `${eventId}_${type.id}`,
            eventId,
            type.name,
            type.color,
            type.order,
            type.enabled ? 1 : 0
          ]
        );
      }

      for (const transaction of transactions) {
        await this.db.runAsync(
          'INSERT INTO event_transactions (id, eventId, items, subtotal, discount, total, currency, paymentMethod, timestamp, appliedPromotions, email, overrideTotal, specialPrice, originalCurrency, originalTotal, originalSubtotal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            `${eventId}_${transaction.id}`,
            eventId,
            JSON.stringify(transaction.items),
            transaction.subtotal,
            transaction.discount,
            transaction.total,
            transaction.currency,
            transaction.paymentMethod,
            transaction.timestamp.toISOString(),
            JSON.stringify(transaction.appliedPromotions),
            transaction.email || null,
            transaction.overrideTotal || null,
            transaction.specialPrice || null,
            transaction.originalCurrency || null,
            transaction.originalTotal || null,
            transaction.originalSubtotal || null
          ]
        );
      }

      await this.db.runAsync(
        'UPDATE events SET updatedAt = ?, promos = ?, currency = ?, currencyRoundUp = ?, eventName = ? WHERE id = ?',
        [
          new Date().toISOString(),
          JSON.stringify(promos || []),
          settings?.currency || 'EUR',
          settings?.currencyRoundUp ? 1 : 0,
          settings?.eventName || '',
          eventId
        ]
      );

      await this.db.execAsync('COMMIT');
      console.log('✅ Event data saved to database');
    } catch (error) {
      try {
        await this.db.execAsync('ROLLBACK');
      } catch (rollbackError) {
        console.error('❌ Rollback failed:', rollbackError);
      }
      console.error('❌ Failed to save event data, transaction rolled back:', error);
      throw error;
    }
  }

  async loadEventData(eventId: string): Promise<EventData | null> {
    await this.initialize();

    if (Platform.OS === 'web') {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
      if (!stored) return null;
      const events: any[] = JSON.parse(stored);
      const eventData = events.find(e => e.id === eventId);
      if (!eventData) return null;
      
      return {
        event: {
          ...eventData,
          createdAt: new Date(eventData.createdAt),
          updatedAt: new Date(eventData.updatedAt),
          isTemplate: eventData.isTemplate || false
        },
        products: eventData.products || [],
        productTypes: eventData.productTypes || [],
        transactions: (eventData.transactions || []).map((t: any) => ({
          ...t,
          timestamp: new Date(t.timestamp)
        })),
        settings: {
          eventName: eventData.eventName,
          userName: eventData.userName,
          currency: eventData.currency,
          currencyRoundUp: eventData.currencyRoundUp,
          isSetupComplete: true,
          appPromoPricing: typeof eventData.appPromoPricing === 'string' 
            ? JSON.parse(eventData.appPromoPricing) 
            : eventData.appPromoPricing,
          promos: eventData.promos || []
        }
      };
    }

    if (!this.db) throw new Error('Database not initialized');

    const event = await this.db.getFirstAsync(
      'SELECT * FROM events WHERE id = ?',
      [eventId]
    ) as any;

    if (!event) return null;

    const products = await this.db.getAllAsync(
      'SELECT * FROM event_products WHERE eventId = ? ORDER BY "order" ASC',
      [eventId]
    ) as any[];

    const transactionsRaw = await this.db.getAllAsync(
      'SELECT * FROM event_transactions WHERE eventId = ? ORDER BY timestamp DESC',
      [eventId]
    ) as any[];

    const productTypesRaw = await this.db.getAllAsync(
      'SELECT * FROM event_product_types WHERE eventId = ? ORDER BY "order" ASC',
      [eventId]
    ) as any[];

    const parsedProducts: Product[] = products.map(row => ({
      id: row.id.replace(`${eventId}_`, ''),
      name: row.name,
      price: row.price,
      color: row.color,
      icon: row.icon,
      enabled: Boolean(row.enabled),
      initialQuantity: row.initialQuantity,
      promoEligible: Boolean(row.promoEligible),
      order: row.order,
      typeId: row.typeId || (row.type === 'Magic Stuff' ? 'type_2' : 'type_1'),
      subgroup: row.subgroup
    }));

    const parsedTransactions: Transaction[] = transactionsRaw.map(row => ({
      id: row.id.replace(`${eventId}_`, ''),
      items: JSON.parse(row.items),
      subtotal: row.subtotal,
      discount: row.discount,
      total: row.total,
      currency: row.currency,
      paymentMethod: row.paymentMethod,
      timestamp: new Date(row.timestamp),
      appliedPromotions: JSON.parse(row.appliedPromotions || '[]'),
      email: row.email,
      overrideTotal: row.overrideTotal,
      specialPrice: row.specialPrice,
      originalCurrency: row.originalCurrency,
      originalTotal: row.originalTotal,
      originalSubtotal: row.originalSubtotal
    }));

    const parsedProductTypes: ProductType[] = productTypesRaw.length > 0
      ? productTypesRaw.map(row => ({
          id: row.id.replace(`${eventId}_`, ''),
          name: row.name,
          color: row.color,
          order: row.order,
          enabled: row.enabled !== undefined ? Boolean(row.enabled) : true
        }))
      : [];

    const parsedPromos = event.promos ? (typeof event.promos === 'string' ? JSON.parse(event.promos) : event.promos) : [];

    return {
      event: {
        id: event.id,
        userId: event.userId,
        eventName: event.eventName,
        userName: event.userName,
        currency: event.currency,
        currencyRoundUp: Boolean(event.currencyRoundUp),
        appPromoPricing: event.appPromoPricing,
        isFinalized: Boolean(event.isFinalized),
        isTemplate: Boolean(event.isTemplate),
        templatePin: event.templatePin || undefined,
        createdAt: new Date(event.createdAt),
        updatedAt: new Date(event.updatedAt)
      },
      products: parsedProducts,
      productTypes: parsedProductTypes,
      transactions: parsedTransactions,
      settings: {
        eventName: event.eventName,
        userName: event.userName,
        currency: event.currency,
        currencyRoundUp: Boolean(event.currencyRoundUp),
        isSetupComplete: true,
        appPromoPricing: typeof event.appPromoPricing === 'string' 
          ? JSON.parse(event.appPromoPricing) 
          : event.appPromoPricing,
        promos: parsedPromos
      }
    };
  }

  async getUserEvents(userId: string): Promise<Event[]> {
    await this.initialize();

    if (Platform.OS === 'web') {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
      if (!stored) return [];
      const events: any[] = JSON.parse(stored);
      return events
        .filter(e => e.userId === userId || e.isTemplate === true)
        .map(e => ({
          ...e,
          createdAt: new Date(e.createdAt),
          updatedAt: new Date(e.updatedAt),
          isTemplate: e.isTemplate || false
        }));
    }

    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getAllAsync(
      'SELECT * FROM events WHERE userId = ? OR isTemplate = 1 ORDER BY isTemplate DESC, updatedAt DESC',
      [userId]
    ) as any[];

    return result.map(row => ({
      id: row.id,
      userId: row.userId,
      eventName: row.eventName,
      userName: row.userName,
      currency: row.currency,
      currencyRoundUp: Boolean(row.currencyRoundUp),
      appPromoPricing: row.appPromoPricing,
      isFinalized: Boolean(row.isFinalized),
      isTemplate: Boolean(row.isTemplate),
      templatePin: row.templatePin || undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    }));
  }

  async markEventAsTemplate(eventId: string): Promise<void> {
    await this.initialize();

    if (Platform.OS === 'web') {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
      if (!stored) return;
      const events: any[] = JSON.parse(stored);
      const eventIndex = events.findIndex(e => e.id === eventId);
      if (eventIndex >= 0) {
        events[eventIndex].isTemplate = true;
        events[eventIndex].updatedAt = new Date().toISOString();
        await AsyncStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
      }
      console.log('✅ Event marked as template in AsyncStorage');
      return;
    }

    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(
      'UPDATE events SET isTemplate = 1, updatedAt = ? WHERE id = ?',
      [new Date().toISOString(), eventId]
    );
    console.log('✅ Event marked as template in database');
  }

  async setEventTemplatePin(eventId: string, pin: string): Promise<void> {
    await this.initialize();

    if (Platform.OS === 'web') {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
      if (!stored) return;
      const events: any[] = JSON.parse(stored);
      const eventIndex = events.findIndex(e => e.id === eventId);
      if (eventIndex >= 0) {
        events[eventIndex].templatePin = pin;
        events[eventIndex].updatedAt = new Date().toISOString();
        await AsyncStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
      }
      console.log('✅ Template PIN set in AsyncStorage');
      return;
    }

    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(
      'UPDATE events SET templatePin = ?, updatedAt = ? WHERE id = ?',
      [pin, new Date().toISOString(), eventId]
    );
    console.log('✅ Template PIN set in database');
  }

  async verifyEventTemplatePin(eventId: string, pin: string): Promise<boolean> {
    await this.initialize();

    if (Platform.OS === 'web') {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
      if (!stored) return false;
      const events: any[] = JSON.parse(stored);
      const event = events.find(e => e.id === eventId);
      return event?.templatePin === pin;
    }

    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getFirstAsync(
      'SELECT templatePin FROM events WHERE id = ?',
      [eventId]
    ) as any;

    return result?.templatePin === pin;
  }

  async unlockEvent(eventId: string): Promise<void> {
    await this.initialize();

    if (Platform.OS === 'web') {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
      if (!stored) return;
      const events: any[] = JSON.parse(stored);
      const eventIndex = events.findIndex(e => e.id === eventId);
      if (eventIndex >= 0) {
        events[eventIndex].templatePin = undefined;
        events[eventIndex].isTemplate = false;
        events[eventIndex].updatedAt = new Date().toISOString();
        await AsyncStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
      }
      console.log('✅ Event unlocked in AsyncStorage');
      return;
    }

    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(
      'UPDATE events SET templatePin = NULL, isTemplate = 0, updatedAt = ? WHERE id = ?',
      [new Date().toISOString(), eventId]
    );
    console.log('✅ Event unlocked in database');
  }

  async finalizeEvent(eventId: string): Promise<void> {
    await this.initialize();

    if (Platform.OS === 'web') {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
      if (!stored) return;
      const events: any[] = JSON.parse(stored);
      const eventIndex = events.findIndex(e => e.id === eventId);
      if (eventIndex >= 0) {
        events[eventIndex].isFinalized = true;
        events[eventIndex].updatedAt = new Date().toISOString();
        await AsyncStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(events));
      }
      console.log('✅ Event finalized in AsyncStorage');
      return;
    }

    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync(
      'UPDATE events SET isFinalized = 1, updatedAt = ? WHERE id = ?',
      [new Date().toISOString(), eventId]
    );
    console.log('✅ Event finalized in database');
  }

  async saveCurrentEvent(eventId: string): Promise<void> {
    await this.initialize();
    
    if (Platform.OS === 'web') {
      await AsyncStorage.setItem(STORAGE_KEYS.CURRENT_EVENT, eventId);
      return;
    }

    if (!this.db) throw new Error('Database not initialized');
    await this.db.runAsync(
      'INSERT OR REPLACE INTO preferences (key, value) VALUES ("currentEvent", ?)',
      [eventId]
    );
  }

  async getCurrentEvent(): Promise<string | null> {
    await this.initialize();
    
    if (Platform.OS === 'web') {
      return await AsyncStorage.getItem(STORAGE_KEYS.CURRENT_EVENT);
    }

    if (!this.db) throw new Error('Database not initialized');
    const result = await this.db.getFirstAsync(
      'SELECT value FROM preferences WHERE key = "currentEvent"'
    ) as any;
    return result?.value || null;
  }

  async clearCurrentEvent(): Promise<void> {
    await this.initialize();
    
    if (Platform.OS === 'web') {
      await AsyncStorage.removeItem(STORAGE_KEYS.CURRENT_EVENT);
      return;
    }

    if (!this.db) throw new Error('Database not initialized');
    await this.db.runAsync(
      'DELETE FROM preferences WHERE key = "currentEvent"'
    );
  }

  async getAllEvents(): Promise<Event[]> {
    await this.initialize();

    if (Platform.OS === 'web') {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
      if (!stored) return [];
      const events: any[] = JSON.parse(stored);
      return events.map(e => ({
        ...e,
        createdAt: new Date(e.createdAt),
        updatedAt: new Date(e.updatedAt),
        isTemplate: e.isTemplate || false
      }));
    }

    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getAllAsync(
      'SELECT * FROM events ORDER BY updatedAt DESC'
    ) as any[];

    return result.map(row => ({
      id: row.id,
      userId: row.userId,
      eventName: row.eventName,
      userName: row.userName,
      currency: row.currency,
      currencyRoundUp: Boolean(row.currencyRoundUp),
      appPromoPricing: row.appPromoPricing,
      isFinalized: Boolean(row.isFinalized),
      isTemplate: Boolean(row.isTemplate),
      templatePin: row.templatePin || undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    }));
  }

  async findEventByName(searchTerm: string): Promise<Event[]> {
    await this.initialize();

    if (Platform.OS === 'web') {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
      if (!stored) return [];
      const events: any[] = JSON.parse(stored);
      return events
        .filter(e => e.eventName.toLowerCase().includes(searchTerm.toLowerCase()))
        .map(e => ({
          ...e,
          createdAt: new Date(e.createdAt),
          updatedAt: new Date(e.updatedAt),
          isTemplate: e.isTemplate || false
        }));
    }

    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getAllAsync(
      'SELECT * FROM events WHERE eventName LIKE ? ORDER BY updatedAt DESC',
      [`%${searchTerm}%`]
    ) as any[];

    return result.map(row => ({
      id: row.id,
      userId: row.userId,
      eventName: row.eventName,
      userName: row.userName,
      currency: row.currency,
      currencyRoundUp: Boolean(row.currencyRoundUp),
      appPromoPricing: row.appPromoPricing,
      isFinalized: Boolean(row.isFinalized),
      isTemplate: Boolean(row.isTemplate),
      templatePin: row.templatePin || undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    }));
  }

  async debugAllEvents(): Promise<void> {
    await this.initialize();
    console.log('🔍 === ALL EVENTS DEBUG ===');

    if (Platform.OS === 'web') {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
      if (!stored) {
        console.log('⚠️ No events found in AsyncStorage');
        return;
      }
      const events: any[] = JSON.parse(stored);
      console.log(`📦 Total events in storage: ${events.length}`);
      events.forEach(e => {
        console.log(`   - ${e.eventName} (ID: ${e.id}, User: ${e.userId}, Template: ${e.isTemplate}, Updated: ${e.updatedAt})`);
      });
    } else if (this.db) {
      const result = await this.db.getAllAsync(
        'SELECT * FROM events ORDER BY updatedAt DESC'
      ) as any[];
      console.log(`📦 Total events in database: ${result.length}`);
      result.forEach(row => {
        console.log(`   - ${row.eventName} (ID: ${row.id}, User: ${row.userId}, Template: ${row.isTemplate}, Updated: ${row.updatedAt})`);
      });
    }
    console.log('🔍 === END DEBUG ===');
  }

  async debugAllUsers(): Promise<void> {
    await this.initialize();
    console.log('🔍 === ALL USERS DEBUG ===');

    if (Platform.OS === 'web') {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.USERS);
      if (!stored) {
        console.log('⚠️ No users found in AsyncStorage');
        return;
      }
      const users: any[] = JSON.parse(stored);
      console.log(`👥 Total users in storage: ${users.length}`);
      users.forEach(u => {
        console.log(`   - ${u.username} (ID: ${u.id}, Email: ${u.email}, Name: ${u.fullName})`);
      });
    } else if (this.db) {
      const result = await this.db.getAllAsync(
        'SELECT * FROM users ORDER BY username ASC'
      ) as any[];
      console.log(`👥 Total users in database: ${result.length}`);
      result.forEach(row => {
        console.log(`   - ${row.username} (ID: ${row.id}, Email: ${row.email}, Name: ${row.fullName})`);
      });
    }
    console.log('🔍 === END DEBUG ===');
  }

  async fullDatabaseDump(): Promise<{ users: any[], events: any[], eventDetails: any[] }> {
    await this.initialize();
    console.log('🔍 === FULL DATABASE DUMP ===');

    const dump = { users: [] as any[], events: [] as any[], eventDetails: [] as any[] };

    if (Platform.OS === 'web') {
      const usersStored = await AsyncStorage.getItem(STORAGE_KEYS.USERS);
      dump.users = usersStored ? JSON.parse(usersStored) : [];
      
      const eventsStored = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
      dump.events = eventsStored ? JSON.parse(eventsStored) : [];
      
      for (const event of dump.events) {
        dump.eventDetails.push({
          eventId: event.id,
          eventName: event.eventName,
          userId: event.userId,
          productsCount: event.products?.length || 0,
          transactionsCount: event.transactions?.length || 0,
        });
      }
    } else if (this.db) {
      dump.users = await this.db.getAllAsync('SELECT * FROM users') as any[];
      dump.events = await this.db.getAllAsync('SELECT * FROM events') as any[];
      
      for (const event of dump.events) {
        const products = await this.db.getAllAsync(
          'SELECT COUNT(*) as count FROM event_products WHERE eventId = ?',
          [event.id]
        ) as any[];
        const transactions = await this.db.getAllAsync(
          'SELECT COUNT(*) as count FROM event_transactions WHERE eventId = ?',
          [event.id]
        ) as any[];
        
        dump.eventDetails.push({
          eventId: event.id,
          eventName: event.eventName,
          userId: event.userId,
          isTemplate: event.isTemplate,
          productsCount: products[0]?.count || 0,
          transactionsCount: transactions[0]?.count || 0,
        });
      }
    }

    console.log('\n👥 USERS:');
    dump.users.forEach(u => {
      console.log(`   ${u.username} (ID: ${u.id})`);
      console.log(`      Email: ${u.email || 'none'}`);
      console.log(`      Full Name: ${u.fullName || 'none'}`);
    });

    console.log('\n📅 EVENTS:');
    dump.eventDetails.forEach(e => {
      console.log(`   ${e.eventName} (ID: ${e.eventId})`);
      console.log(`      User ID: ${e.userId}`);
      console.log(`      Template: ${e.isTemplate || false}`);
      console.log(`      Products: ${e.productsCount}`);
      console.log(`      Transactions: ${e.transactionsCount}`);
    });

    console.log('🔍 === END DUMP ===');
    return dump;
  }

  async restoreUserDetails(username: string, email: string, fullName: string): Promise<void> {
    await this.initialize();
    
    const user = await this.getUserByUsername(username);
    if (!user) {
      console.log(`❌ User ${username} not found`);
      return;
    }

    await this.updateUser(user.id, username, email, fullName);
    console.log(`✅ Updated user ${username} with email: ${email}, name: ${fullName}`);
  }

  async deleteEvent(eventId: string): Promise<void> {
    await this.initialize();

    if (Platform.OS === 'web') {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
      if (!stored) return;
      const events: any[] = JSON.parse(stored);
      const filtered = events.filter(e => e.id !== eventId);
      await AsyncStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(filtered));
      console.log('✅ Event deleted from AsyncStorage');
      return;
    }

    if (!this.db) throw new Error('Database not initialized');

    await this.db.runAsync('DELETE FROM event_products WHERE eventId = ?', [eventId]);
    await this.db.runAsync('DELETE FROM event_transactions WHERE eventId = ?', [eventId]);
    await this.db.runAsync('DELETE FROM events WHERE id = ?', [eventId]);
    console.log('✅ Event deleted from database');
  }

  async deleteAllUnnamedEvents(): Promise<{ success: boolean; deletedCount: number; message: string }> {
    await this.initialize();
    
    try {
      console.log('🗑️ Starting deletion of all unnamed events...');
      
      if (Platform.OS === 'web') {
        const stored = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
        if (!stored) return { success: true, deletedCount: 0, message: 'No events found' };
        
        const events: any[] = JSON.parse(stored);
        const unnamedEvents = events.filter(e => 
          !e.eventName || 
          e.eventName.trim() === '' || 
          e.eventName === 'Unnamed Event'
        );
        
        const deletedCount = unnamedEvents.length;
        const filtered = events.filter(e => 
          e.eventName && 
          e.eventName.trim() !== '' && 
          e.eventName !== 'Unnamed Event'
        );
        
        await AsyncStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(filtered));
        console.log(`✅ Deleted ${deletedCount} unnamed events from AsyncStorage`);
        
        return { 
          success: true, 
          deletedCount, 
          message: `Deleted ${deletedCount} unnamed event(s)` 
        };
      }

      if (!this.db) throw new Error('Database not initialized');

      const unnamedEvents = await this.db.getAllAsync(
        `SELECT * FROM events WHERE eventName IS NULL OR eventName = '' OR eventName = 'Unnamed Event'`
      ) as any[];
      
      const deletedCount = unnamedEvents.length;
      console.log(`🗑️ Found ${deletedCount} unnamed events to delete`);
      
      for (const event of unnamedEvents) {
        await this.db.runAsync('DELETE FROM event_products WHERE eventId = ?', [event.id]);
        await this.db.runAsync('DELETE FROM event_transactions WHERE eventId = ?', [event.id]);
        await this.db.runAsync('DELETE FROM event_product_types WHERE eventId = ?', [event.id]);
        await this.db.runAsync('DELETE FROM events WHERE id = ?', [event.id]);
        console.log(`   Deleted unnamed event ID: ${event.id}`);
      }
      
      console.log(`✅ Deleted ${deletedCount} unnamed events from database`);
      
      return { 
        success: true, 
        deletedCount, 
        message: `Deleted ${deletedCount} unnamed event(s)` 
      };
    } catch (error) {
      console.error('❌ Error deleting unnamed events:', error);
      return { 
        success: false, 
        deletedCount: 0, 
        message: `Error: ${error}` 
      };
    }
  }

  async manualRecoverFism2025(): Promise<{ success: boolean; message: string }> {
    return this.recoverOriginalEvent();
  }

  async recoverOriginalEvent(): Promise<{ success: boolean; message: string }> {
    try {
      console.log('🔄 Starting recovery of original event data...');
      await this.initialize();

      // Get the fsj user
      const fsjUser = await this.getUserByUsername('fsj');
      if (!fsjUser) {
        console.log('❌ FSJ user not found, cannot recover event');
        return { success: false, message: 'FSJ user not found' };
      }

      // Check if fism2025 already exists - if so, delete it first to re-create
      const existingEvents = await this.getUserEvents(fsjUser.id);
      const existingFism = existingEvents.find(e => e.eventName === 'fism2025');
      if (existingFism) {
        console.log('ℹ️ fism2025 event already exists, will update with fresh data');
        // Delete existing event data to recreate it
        if (Platform.OS === 'web') {
          const stored = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
          if (stored) {
            const events: any[] = JSON.parse(stored);
            const filtered = events.filter(e => e.id !== existingFism.id);
            await AsyncStorage.setItem(STORAGE_KEYS.EVENTS, JSON.stringify(filtered));
          }
        } else if (this.db) {
          await this.db.runAsync('DELETE FROM event_products WHERE eventId = ?', [existingFism.id]);
          await this.db.runAsync('DELETE FROM event_transactions WHERE eventId = ?', [existingFism.id]);
          await this.db.runAsync('DELETE FROM events WHERE id = ?', [existingFism.id]);
        }
      }

      // Load legacy data from the old tables
      let legacyProducts: Product[] = [];
      let legacyTransactions: Transaction[] = [];
      let legacySettings: AppSettings;

      if (Platform.OS === 'web') {
        const stored = await AsyncStorage.getItem('sales_products');
        legacyProducts = stored ? JSON.parse(stored) : [];
        const txStored = await AsyncStorage.getItem('sales_transactions');
        const txData = txStored ? JSON.parse(txStored) : [];
        legacyTransactions = txData.map((t: any) => ({
          ...t,
          timestamp: new Date(t.timestamp)
        }));
        const settingsStored = await AsyncStorage.getItem('sales_settings');
        legacySettings = settingsStored ? JSON.parse(settingsStored) : {
          userName: 'fsj',
          eventName: 'fism2025',
          currency: 'EUR',
          currencyRoundUp: true,
          isSetupComplete: true,
          appPromoPricing: {
            maxAppsForPromo: 7,
            prices: { 2: 50, 3: 75, 4: 90, 5: 110, 6: 130, 7: 150 }
          }
        };
      } else if (this.db) {
        const productsResult = await this.db.getAllAsync('SELECT * FROM products ORDER BY "order" ASC') as any[];
        legacyProducts = productsResult.map(row => ({
          id: row.id,
          name: row.name,
          price: row.price,
          color: row.color,
          icon: row.icon,
          enabled: Boolean(row.enabled),
          initialQuantity: row.initialQuantity,
          promoEligible: Boolean(row.promoEligible),
          order: row.order,
          typeId: row.typeId || (row.type === 'Magic Stuff' ? 'type_2' : 'type_1'),
          subgroup: row.subgroup
        }));

        const txResult = await this.db.getAllAsync('SELECT * FROM transactions ORDER BY timestamp DESC') as any[];
        legacyTransactions = txResult.map(row => ({
          id: row.id,
          items: JSON.parse(row.items || '[]'),
          subtotal: row.subtotal,
          discount: row.discount,
          total: row.total,
          currency: row.currency,
          paymentMethod: row.paymentMethod,
          timestamp: new Date(row.timestamp),
          appliedPromotions: JSON.parse(row.appliedPromotions || '[]'),
          email: row.email,
          overrideTotal: row.overrideTotal,
          specialPrice: row.specialPrice,
          originalCurrency: row.originalCurrency,
          originalTotal: row.originalTotal,
          originalSubtotal: row.originalSubtotal
        }));

        const settingsResult = await this.db.getFirstAsync('SELECT * FROM settings WHERE id = 1') as any;
        if (settingsResult) {
          legacySettings = {
            userName: settingsResult.userName || 'fsj',
            eventName: 'fism2025',
            currency: settingsResult.currency || 'EUR',
            currencyRoundUp: Boolean(settingsResult.currencyRoundUp),
            isSetupComplete: true,
            appPromoPricing: typeof settingsResult.appPromoPricing === 'string'
              ? JSON.parse(settingsResult.appPromoPricing)
              : settingsResult.appPromoPricing || {
                  maxAppsForPromo: 7,
                  prices: { 2: 50, 3: 75, 4: 90, 5: 110, 6: 130, 7: 150 }
                }
          };
        } else {
          legacySettings = {
            userName: 'fsj',
            eventName: 'fism2025',
            currency: 'EUR',
            currencyRoundUp: true,
            isSetupComplete: true,
            appPromoPricing: {
              maxAppsForPromo: 7,
              prices: { 2: 50, 3: 75, 4: 90, 5: 110, 6: 130, 7: 150 }
            }
          };
        }
      } else {
        console.log('❌ No database available for recovery');
        return { success: false, message: 'No database available for recovery' };
      }

      // Create event even if there's no data - we'll add the original configuration
      console.log(`📦 Creating fism2025 event with ${legacyProducts.length} products and ${legacyTransactions.length} transactions...`);

      // If no legacy data found, create with default original configuration
      if (legacyProducts.length === 0) {
        console.log('ℹ️ No legacy products found, using original FISM configuration');
        legacyProducts = this.getOriginalFismProducts();
      }

      // Create the fism2025 event
      const event = await this.createEvent(
        fsjUser.id,
        'fism2025',
        legacySettings.userName || 'fsj',
        legacySettings
      );

      // Save the data to the event
      await this.saveEventData(event.id, legacyProducts, legacyTransactions);

      console.log(`✅ Successfully recovered/created original event as "fism2025"`);
      console.log(`   - ${legacyProducts.length} products`);
      console.log(`   - ${legacyTransactions.length} transactions`);
      return { success: true, message: `Event created with ${legacyProducts.length} products and ${legacyTransactions.length} transactions` };
    } catch (error) {
      console.error('❌ Error recovering original event:', error);
      return { success: false, message: String(error) };
    }
  }

  private getOriginalFismProducts(): Product[] {
    // Original FISM configuration with all apps, products, promos, and subgroups
    return [
      // MagicPro Ideas Apps
      { id: '1', name: 'Gemini AI', price: 30, color: '#FF6B6B', enabled: true, initialQuantity: 0, promoEligible: true, order: 0, typeId: 'type_1', subgroup: 'Apps' },
      { id: '2', name: 'ChatGPT', price: 30, color: '#4ECDC4', enabled: true, initialQuantity: 0, promoEligible: true, order: 1, typeId: 'type_1', subgroup: 'Apps' },
      { id: '3', name: 'Claude AI', price: 30, color: '#95E1D3', enabled: true, initialQuantity: 0, promoEligible: true, order: 2, typeId: 'type_1', subgroup: 'Apps' },
      { id: '4', name: 'Perplexity', price: 30, color: '#F38181', enabled: true, initialQuantity: 0, promoEligible: true, order: 3, typeId: 'type_1', subgroup: 'Apps' },
      { id: '5', name: 'DeepSeek', price: 30, color: '#AA96DA', enabled: true, initialQuantity: 0, promoEligible: true, order: 4, typeId: 'type_1', subgroup: 'Apps' },
      { id: '6', name: 'Midjourney', price: 30, color: '#FCBAD3', enabled: true, initialQuantity: 0, promoEligible: true, order: 5, typeId: 'type_1', subgroup: 'Apps' },
      { id: '7', name: 'DALL-E', price: 30, color: '#FFFFD2', enabled: true, initialQuantity: 0, promoEligible: true, order: 6, typeId: 'type_1', subgroup: 'Apps' },
      { id: '8', name: 'Stable Diffusion', price: 30, color: '#A8D8EA', enabled: true, initialQuantity: 0, promoEligible: true, order: 7, typeId: 'type_1', subgroup: 'Apps' },
      { id: '9', name: 'RunwayML', price: 30, color: '#FFD93D', enabled: true, initialQuantity: 0, promoEligible: true, order: 8, typeId: 'type_1', subgroup: 'Apps' },
      { id: '10', name: 'ElevenLabs', price: 30, color: '#6BCB77', enabled: true, initialQuantity: 0, promoEligible: true, order: 9, typeId: 'type_1', subgroup: 'Apps' },
      
      // Magic Stuff Products
      { id: '11', name: 'Magic Wand', price: 15, color: '#FFB6C1', enabled: true, initialQuantity: 0, promoEligible: false, order: 10, typeId: 'type_2', subgroup: 'Tools' },
      { id: '12', name: 'Crystal Ball', price: 25, color: '#DDA0DD', enabled: true, initialQuantity: 0, promoEligible: false, order: 11, typeId: 'type_2', subgroup: 'Tools' },
      { id: '13', name: 'Magic Hat', price: 20, color: '#87CEEB', enabled: true, initialQuantity: 0, promoEligible: false, order: 12, typeId: 'type_2', subgroup: 'Accessories' },
      { id: '14', name: 'Spell Book', price: 35, color: '#F0E68C', enabled: true, initialQuantity: 0, promoEligible: false, order: 13, typeId: 'type_2', subgroup: 'Books' },
      { id: '15', name: 'Potion', price: 10, color: '#98FB98', enabled: true, initialQuantity: 0, promoEligible: false, order: 14, typeId: 'type_2', subgroup: 'Consumables' },
    ];
  }

  private async initializeDefaultUser(): Promise<void> {
    try {
      console.log('🔐 Checking for default user...');
      
      // Hash the password 'fsj'
      let hash = 0;
      const password = 'fsj';
      for (let i = 0; i < password.length; i++) {
        const char = password.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      const passwordHash = hash.toString();

      // Direct database access (no initialize() calls)
      let user: User | null = null;
      
      if (Platform.OS === 'web') {
        const stored = await AsyncStorage.getItem(STORAGE_KEYS.USERS);
        if (stored) {
          const users: any[] = JSON.parse(stored);
          const foundUser = users.find(u => u.username === 'fsj');
          if (foundUser) {
            user = { ...foundUser, createdAt: new Date(foundUser.createdAt), email: foundUser.email || '', fullName: foundUser.fullName || '' };
          }
        }
        
        if (!user) {
          console.log('🔐 Creating default user "fsj"...');
          const newUser: User = {
            id: Date.now().toString(),
            username: 'fsj',
            passwordHash,
            email: '',
            fullName: '',
            role: 'admin',
            createdAt: new Date()
          };
          const users = stored ? JSON.parse(stored) : [];
          users.push(newUser);
          await AsyncStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
          user = newUser;
          console.log('✅ Default user "fsj" created successfully');
        } else {
          console.log('✅ Default user already exists');
        }
      } else if (this.db) {
        const result = await this.db.getFirstAsync(
          'SELECT * FROM users WHERE username = ?',
          ['fsj']
        ) as any;
        
        if (result) {
          user = {
            id: result.id,
            username: result.username,
            passwordHash: result.passwordHash,
            email: result.email || '',
            fullName: result.fullName || '',
            role: (result.role || 'admin') as UserRole,
            createdAt: new Date(result.createdAt)
          };
          console.log('✅ Default user already exists');
          
          // Update password hash if different
          if (user && user.passwordHash !== passwordHash) {
            console.log('🔄 Updating password hash for default user...');
            await this.db.runAsync(
              'UPDATE users SET passwordHash = ? WHERE id = ?',
              [passwordHash, user.id]
            );
            console.log('✅ Password hash updated');
          }
        } else {
          console.log('🔐 Creating default user "fsj"...');
          const userId = Date.now().toString();
          await this.db.runAsync(
            'INSERT INTO users (id, username, passwordHash, email, fullName, role, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [userId, 'fsj', passwordHash, '', '', 'admin', new Date().toISOString()]
          );
          user = {
            id: userId,
            username: 'fsj',
            passwordHash,
            email: '',
            fullName: '',
            role: 'admin',
            createdAt: new Date()
          };
          console.log('✅ Default user "fsj" created successfully');
        }
      }

      if (!user) {
        console.log('⚠️ Could not initialize default user');
        return;
      }

      // Check if user has any events (direct DB access)
      let hasEvents = false;
      if (Platform.OS === 'web') {
        const stored = await AsyncStorage.getItem(STORAGE_KEYS.EVENTS);
        if (stored) {
          const events: any[] = JSON.parse(stored);
          hasEvents = events.some(e => e.userId === user?.id);
        }
      } else if (this.db && user) {
        const result = await this.db.getAllAsync(
          'SELECT * FROM events WHERE userId = ?',
          [user.id]
        ) as any[];
        hasEvents = result.length > 0;
      }

      if (hasEvents) {
        console.log('✅ User already has events, skipping migration');
        return;
      }

      console.log('ℹ️ No events found for user');
    } catch (error) {
      console.error('⚠️ Error initializing default user (non-critical):', error);
    }
  }


}

export const databaseService = new DatabaseService();