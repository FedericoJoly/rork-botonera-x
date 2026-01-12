import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { CartItem, Transaction, Currency, PaymentMethod, Product, AppSettings, ExchangeRates, ProductType, Promo } from '@/types/sales';
import { DEFAULT_SETTINGS } from '@/constants/products';
import { databaseService } from './database';

// SALES STORE WITH SQLITE - RELIABLE PERSISTENT STORAGE
export const [SalesProvider, useSales] = createContextHook(() => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [displayCurrency, setDisplayCurrency] = useState<Currency>('EUR');
  const [products, setProducts] = useState<Product[]>([]);
  const [productTypes, setProductTypes] = useState<ProductType[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [overrideTotal, setOverrideTotal] = useState<number | undefined>(undefined);
  const [currentEventId, setCurrentEventId] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates>({
    USD: 1,
    EUR: 1,
    GBP: 1,
    lastUpdated: new Date()
  });
  const [isLoadingRates, setIsLoadingRates] = useState(false);

  // Fetch live exchange rates
  const fetchExchangeRates = useCallback(async () => {
    setIsLoadingRates(true);
    try {
      console.log('💱 Fetching live exchange rates...');
      const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
      const data = await response.json();
      
      const newRates: ExchangeRates = {
        USD: 1,
        EUR: data.rates.EUR || 0.92,
        GBP: data.rates.GBP || 0.79,
        lastUpdated: new Date(),
        customRates: undefined
      };
      
      setExchangeRates(newRates);
      console.log('✅ Exchange rates updated:', newRates);
    } catch (error) {
      console.error('❌ Failed to fetch exchange rates:', error);
    } finally {
      setIsLoadingRates(false);
    }
  }, []);

  const updateCustomRate = useCallback(async (currency: Currency, rate: number) => {
    const newRates = {
      ...exchangeRates,
      customRates: {
        ...exchangeRates.customRates,
        [currency]: rate
      }
    };
    setExchangeRates(newRates);
    
    // Save to database immediately
    try {
      await databaseService.saveExchangeRates({
        USD: newRates.USD,
        EUR: newRates.EUR,
        GBP: newRates.GBP,
        customRates: newRates.customRates
      });
      console.log('✅ Custom rate saved to database');
    } catch (error) {
      console.error('❌ Failed to save custom rate:', error);
    }
  }, [exchangeRates]);

  const clearCustomRates = useCallback(() => {
    setExchangeRates(current => ({
      ...current,
      customRates: undefined
    }));
  }, []);

  const getEffectiveRate = useCallback((currency: Currency): number => {
    if (exchangeRates.customRates && exchangeRates.customRates[currency] !== undefined) {
      return exchangeRates.customRates[currency]!;
    }
    return exchangeRates[currency];
  }, [exchangeRates]);

  // Initialize database - DON'T load any data here (data comes from events)
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('🔄 Initializing database...');
        
        // Initialize SQLite database first - this MUST complete before any data operations
        await databaseService.initialize();
        console.log('✅ Database initialization complete');
        
        // Load only non-event-specific data (exchange rates and currency preference)
        const loadedCurrency = await databaseService.loadCurrency();
        const loadedRates = await databaseService.loadExchangeRates();
        
        setDisplayCurrency(loadedCurrency as Currency);
        
        // Load exchange rates if available, otherwise fetch live rates
        if (loadedRates) {
          console.log('💱 Using saved exchange rates from database');
          setExchangeRates({
            USD: loadedRates.USD,
            EUR: loadedRates.EUR,
            GBP: loadedRates.GBP,
            lastUpdated: new Date(),
            customRates: loadedRates.customRates
          });
        } else {
          console.log('💱 No saved rates found, fetching live rates...');
          await fetchExchangeRates();
        }
        
        console.log('🎉 Database initialization complete!');
        console.log('⚠️ No event data loaded - waiting for event selection');
      } catch (error) {
        console.error('💥 Critical error initializing database:', error);
        // Fallback to defaults on error
        setProducts([]);
        setSettings(DEFAULT_SETTINGS);
        setTransactions([]);
        setDisplayCurrency('EUR');
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, [fetchExchangeRates]);

  // Auto-save data to SQLite when it changes (except transactions - they're saved immediately)

  useEffect(() => {
    if (!isLoading) {
      databaseService.saveCurrency(displayCurrency).catch(error => {
        console.error('❌ Failed to save currency to database:', error);
      });
    }
  }, [displayCurrency, isLoading]);

  useEffect(() => {
    if (!isLoading && products.length >= 0) {
      databaseService.saveProducts(products).catch(error => {
        console.error('❌ Failed to save products to database:', error);
      });
    }
  }, [products, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      databaseService.saveSettings(settings).catch(error => {
        console.error('❌ Failed to save settings to database:', error);
      });
    }
  }, [settings, isLoading]);

  const addToCart = useCallback((productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    setCart(current => {
      const existing = current.find(item => item.product.id === productId);
      if (existing) {
        return current.map(item =>
          item.product.id === productId
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...current, { product, quantity: 1 }];
    });
    
    // Clear total override when cart changes
    setOverrideTotal(undefined);
  }, [products]);

  const removeFromCart = useCallback((productId: string) => {
    setCart(current => {
      const existing = current.find(item => item.product.id === productId);
      if (!existing) return current;
      
      if (existing.quantity === 1) {
        return current.filter(item => item.product.id !== productId);
      }
      
      return current.map(item =>
        item.product.id === productId
          ? { ...item, quantity: item.quantity - 1 }
          : item
      );
    });
    
    // Clear total override when cart changes
    setOverrideTotal(undefined);
  }, []); 

  const clearCart = useCallback(() => {
    setCart([]);
    setOverrideTotal(undefined);
  }, []);

  const getItemQuantity = useCallback((productId: string): number => {
    const item = cart.find(item => item.product.id === productId);
    return item?.quantity || 0;
  }, [cart]);

  // Calculate totals based on quantity (automatic combo logic) with price overrides
  const totals = useMemo(() => {
    const mainCurrency = settings.currency;
    const mainCurrencyRate = getEffectiveRate(mainCurrency);
    const displayCurrencyRate = getEffectiveRate(displayCurrency);
    
    const conversionRate = displayCurrencyRate / mainCurrencyRate;
    
    // Calculate subtotal using override prices when available (natural subtotal)
    const naturalSubtotal = cart.reduce((sum, item) => {
      const effectivePrice = item.overridePrice !== undefined ? item.overridePrice : item.product.price;
      return sum + (effectivePrice * item.quantity);
    }, 0);
    
    let promoTotal = naturalSubtotal;
    const appliedPromos: string[] = [];
    
    // Calculate promo totals by type and combo
    const hasOverrides = cart.some(item => item.overridePrice !== undefined);
    if (!hasOverrides && overrideTotal === undefined) {
      // First, handle combo promos (they take priority)
      const comboPromos = promos.filter(p => p.mode === 'combo' && p.comboProductIds && p.comboProductIds.length > 0);
      
      // Track which cart items have been used in combos
      const cartItemUsage = cart.map(item => ({
        product: item.product,
        quantity: item.quantity,
        remainingQuantity: item.quantity
      }));
      
      let comboSubtotal = 0;
      
      // Process each combo promo
      for (const comboPromo of comboPromos) {
        if (!comboPromo.comboProductIds || !comboPromo.comboPrice) continue;
        
        // Check if we can form any complete combos
        let canFormCombo = true;
        let maxCombos = Infinity;
        
        // Calculate max number of combos we can form
        for (const productId of comboPromo.comboProductIds) {
          const cartUsage = cartItemUsage.find(u => u.product.id === productId);
          if (!cartUsage || cartUsage.remainingQuantity < 1 || !cartUsage.product.promoEligible) {
            canFormCombo = false;
            break;
          }
          maxCombos = Math.min(maxCombos, cartUsage.remainingQuantity);
        }
        
        if (canFormCombo && maxCombos > 0 && maxCombos !== Infinity) {
          // We can form combos! Apply the combo price
          comboSubtotal += comboPromo.comboPrice * maxCombos;
          appliedPromos.push(`${comboPromo.name}`);
          
          // Deduct the used quantities
          for (const productId of comboPromo.comboProductIds) {
            const cartUsage = cartItemUsage.find(u => u.product.id === productId);
            if (cartUsage) {
              cartUsage.remainingQuantity -= maxCombos;
            }
          }
        }
      }
      
      // Now handle type_list promos and remaining items
      const typeGroups = productTypes.map(type => {
        const typeItems = cart.filter(item => item.product.typeId === type.id);
        
        // Check for Type List promo
        const typeListPromo = promos.find(p => p.mode === 'type_list' && p.typeId === type.id);
        
        // Separate eligible and non-eligible items, considering combo usage
        const promoEligibleItems = typeItems.filter(item => item.product.promoEligible).map(item => {
          const usage = cartItemUsage.find(u => u.product.id === item.product.id);
          return {
            ...item,
            quantity: usage ? usage.remainingQuantity : item.quantity
          };
        }).filter(item => item.quantity > 0);
        
        const nonEligibleItems = typeItems.filter(item => !item.product.promoEligible).map(item => {
          const usage = cartItemUsage.find(u => u.product.id === item.product.id);
          return {
            ...item,
            quantity: usage ? usage.remainingQuantity : item.quantity
          };
        }).filter(item => item.quantity > 0);
        
        // Calculate natural price for non-eligible items
        const nonEligibleSubtotal = nonEligibleItems.reduce((sum, item) => {
          const effectivePrice = item.overridePrice !== undefined ? item.overridePrice : item.product.price;
          return sum + (effectivePrice * item.quantity);
        }, 0);
        
        // Calculate promo or natural price for eligible items
        let eligibleSubtotal = 0;
        
        if (typeListPromo && promoEligibleItems.length > 0) {
          const promoQuantity = promoEligibleItems.reduce((sum, item) => sum + item.quantity, 0);
          
          if (promoQuantity >= 2) {
            if (promoQuantity <= typeListPromo.maxQuantity) {
              // Use promo price from table
              if (typeListPromo.prices[promoQuantity]) {
                eligibleSubtotal = typeListPromo.prices[promoQuantity];
                appliedPromos.push(`${typeListPromo.name}`);
              }
            } else {
              // Use incremental pricing
              const basePrice = typeListPromo.prices[typeListPromo.maxQuantity] || 0;
              const extraQuantity = promoQuantity - typeListPromo.maxQuantity;
              
              if (extraQuantity < 6 && typeListPromo.incrementalPrice !== undefined) {
                // First 5 extra apps use +4 pricing (quantities 5-9)
                eligibleSubtotal = basePrice + (extraQuantity * typeListPromo.incrementalPrice);
                appliedPromos.push(`${typeListPromo.name}`);
              } else if (extraQuantity >= 6 && typeListPromo.incrementalPrice !== undefined && typeListPromo.incrementalPrice10Plus !== undefined) {
                // From quantity 10+, first 5 use +4, then +10 kicks in
                eligibleSubtotal = basePrice + (5 * typeListPromo.incrementalPrice) + ((extraQuantity - 5) * typeListPromo.incrementalPrice10Plus);
                appliedPromos.push(`${typeListPromo.name}`);
              }
            }
          } else {
            // Less than 2 eligible items, use natural price
            eligibleSubtotal = promoEligibleItems.reduce((sum, item) => {
              const effectivePrice = item.overridePrice !== undefined ? item.overridePrice : item.product.price;
              return sum + (effectivePrice * item.quantity);
            }, 0);
          }
        } else {
          // No promo or no eligible items, use natural price
          eligibleSubtotal = promoEligibleItems.reduce((sum, item) => {
            const effectivePrice = item.overridePrice !== undefined ? item.overridePrice : item.product.price;
            return sum + (effectivePrice * item.quantity);
          }, 0);
        }
        
        // Total for this type = eligible subtotal + non-eligible subtotal
        return eligibleSubtotal + nonEligibleSubtotal;
      });
      
      promoTotal = comboSubtotal + typeGroups.reduce((sum, subtotal) => sum + subtotal, 0);
    }
    
    const discount = naturalSubtotal - promoTotal;
    const finalTotal = overrideTotal !== undefined ? overrideTotal : promoTotal;
    
    // Convert to display currency if different from main currency
    let convertedSubtotal = displayCurrency === mainCurrency ? naturalSubtotal : naturalSubtotal * conversionRate;
    let convertedDiscount = displayCurrency === mainCurrency ? discount : discount * conversionRate;
    let convertedTotal = displayCurrency === mainCurrency ? finalTotal : finalTotal * conversionRate;
    
    // Apply currency round-up if enabled and we're converting currencies
    if (settings.currencyRoundUp && displayCurrency !== mainCurrency) {
      convertedSubtotal = Math.ceil(convertedSubtotal);
      convertedTotal = Math.ceil(convertedTotal);
    }
    
    return {
      subtotal: convertedSubtotal,
      discount: convertedDiscount,
      total: convertedTotal,
      appliedPromotions: appliedPromos,
      hasOverrides: hasOverrides || overrideTotal !== undefined
    };
  }, [cart, settings.currency, displayCurrency, overrideTotal, settings.currencyRoundUp, getEffectiveRate, productTypes, promos]);

  const completeTransaction = useCallback(async (paymentMethod: PaymentMethod, email?: string) => {
    if (cart.length === 0) return;
    
    if (!currentEventId) {
      console.error('❌ Cannot complete transaction: No current event ID');
      return;
    }
    
    // Check if event is locked
    const eventData = await databaseService.loadEventData(currentEventId);
    if (eventData?.event.templatePin) {
      console.error('❌ Cannot complete transaction: Event is locked');
      throw new Error('This event is locked. You cannot register new transactions.');
    }
    
    console.log(`💳 Processing transaction for event: ${currentEventId}`);
    
    // For card payments, convert to EUR
    // For QR payments, keep the display currency (no conversion needed)
    const shouldConvertToEUR = paymentMethod === 'card' && displayCurrency !== 'EUR';
    const transactionCurrency = shouldConvertToEUR ? 'EUR' : displayCurrency;
    const conversionRate = shouldConvertToEUR ? getEffectiveRate(displayCurrency) / getEffectiveRate('EUR') : 1;
    
    // Create transaction items with the actual prices that were used
    // We need to preserve the effective prices for accurate transaction history
    const transactionItems = cart.map(item => {
      let effectivePrice = item.overridePrice !== undefined ? item.overridePrice : item.product.price;
      
      // If there's a forced total (overrideTotal), apply proportional discount to each item
      if (overrideTotal !== undefined) {
        const originalSubtotal = cart.reduce((sum, cartItem) => {
          const price = cartItem.overridePrice !== undefined ? cartItem.overridePrice : cartItem.product.price;
          return sum + (price * cartItem.quantity);
        }, 0);
        
        // Calculate the proportion of this item's contribution to the total
        const itemOriginalTotal = effectivePrice * item.quantity;
        const proportion = itemOriginalTotal / originalSubtotal;
        
        // Apply the proportional discount
        const discountAmount = (originalSubtotal - overrideTotal) * proportion;
        effectivePrice = (itemOriginalTotal - discountAmount) / item.quantity;
      }
      // If there's a promo discount (from automatic promo or special price), apply proportional discount to promo-eligible items
      else if (totals.discount > 0 && totals.appliedPromotions.length > 0) {
        // Check if this is an app promo or special price
        const isAppPromo = totals.appliedPromotions.some(promo => promo.includes('Apps Promo') || promo === 'Special Price');
        
        const magicProType = productTypes.find(t => t.name === 'MagicPro Ideas');
        if (isAppPromo && magicProType && item.product.typeId === magicProType.id) {
          // Calculate the original total for all app items
          const appItems = cart.filter(cartItem => magicProType && cartItem.product.typeId === magicProType.id);
          const originalAppsTotal = appItems.reduce((sum, cartItem) => {
            const price = cartItem.overridePrice !== undefined ? cartItem.overridePrice : cartItem.product.price;
            return sum + (price * cartItem.quantity);
          }, 0);
          
          // Calculate the proportion of this item's contribution to the app items total
          const itemOriginalTotal = effectivePrice * item.quantity;
          const proportion = itemOriginalTotal / originalAppsTotal;
          
          // Apply the proportional discount (discount is already calculated in totals)
          const discountAmount = totals.discount * proportion;
          effectivePrice = (itemOriginalTotal - discountAmount) / item.quantity;
        }
      }
      
      const convertedPrice = shouldConvertToEUR ? effectivePrice * conversionRate : effectivePrice;
      return {
        product: {
          ...item.product,
          price: convertedPrice // Store the actual price that was used, converted if needed
        },
        quantity: item.quantity
        // Don't include overridePrice in transaction - the effective price is now in product.price
      };
    });
    
    const transaction: Transaction = {
      id: Date.now().toString(),
      items: transactionItems,
      subtotal: shouldConvertToEUR ? totals.subtotal * conversionRate : totals.subtotal,
      discount: shouldConvertToEUR ? totals.discount * conversionRate : totals.discount,
      total: shouldConvertToEUR ? totals.total * conversionRate : totals.total,
      currency: transactionCurrency,
      paymentMethod,
      timestamp: new Date(),
      appliedPromotions: totals.appliedPromotions,
      email: email?.trim() || undefined,
      overrideTotal: shouldConvertToEUR && overrideTotal ? overrideTotal * conversionRate : overrideTotal,
      originalCurrency: shouldConvertToEUR ? displayCurrency : undefined,
      originalTotal: shouldConvertToEUR ? totals.total : undefined,
      originalSubtotal: shouldConvertToEUR ? totals.subtotal : undefined
    };
    
    // Save transaction to event-specific storage immediately
    try {
      const eventData = await databaseService.loadEventData(currentEventId);
      if (eventData) {
        const updatedTransactions = [transaction, ...eventData.transactions];
        await databaseService.saveEventData(currentEventId, eventData.products, updatedTransactions);
        console.log(`💾 Transaction saved to event ${currentEventId} storage immediately`);
        
        // Update local state with the new transaction list
        setTransactions(updatedTransactions);
      } else {
        console.error('❌ Failed to load event data for transaction save');
      }
    } catch (error) {
      console.error('❌ Failed to save transaction to event storage:', error);
    }
    
    clearCart(); // This also clears overrideTotal
    
    return transaction;
  }, [cart, totals, displayCurrency, clearCart, overrideTotal, getEffectiveRate, currentEventId, productTypes]);

  const getTodaysSales = useCallback(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return transactions.filter(t => {
      const transDate = new Date(t.timestamp);
      transDate.setHours(0, 0, 0, 0);
      return transDate.getTime() === today.getTime();
    });
  }, [transactions]);

  const clearHistory = useCallback(async () => {
    console.log('🗑️ Clearing transaction history...');
    setTransactions([]);
    await databaseService.clearTransactions();
    console.log('✅ Transaction history cleared');
  }, []);

  // Helper to check if event is locked
  const checkIfLocked = useCallback(async (): Promise<boolean> => {
    if (!currentEventId) return false;
    const eventData = await databaseService.loadEventData(currentEventId);
    return !!eventData?.event.templatePin;
  }, [currentEventId]);

  // Product management functions
  const addProduct = useCallback((product: Omit<Product, 'id'>, insertAfterOrder?: number) => {
    let newOrder: number;
    
    if (insertAfterOrder !== undefined) {
      // Insert after the specified order, shifting subsequent products
      newOrder = insertAfterOrder + 1;
      
      // Update orders of products that come after the insertion point
      setProducts(current => {
        const updatedProducts = current.map(p => 
          p.order > insertAfterOrder ? { ...p, order: p.order + 1 } : p
        );
        
        const newProduct: Product = {
          ...product,
          id: Date.now().toString(),
          order: newOrder
        };
        
        return [...updatedProducts, newProduct];
      });
    } else {
      // Add at the end (default behavior)
      const maxOrder = Math.max(...products.map(p => p.order), -1);
      newOrder = maxOrder + 1;
      
      const newProduct: Product = {
        ...product,
        id: Date.now().toString(),
        order: newOrder
      };
      setProducts(current => [...current, newProduct]);
    }
  }, [products]);

  const updateProduct = useCallback(async (id: string, updates: Partial<Product>) => {
    const locked = await checkIfLocked();
    if (locked) {
      console.warn('🔒 Blocked: Cannot update product in locked event');
      return;
    }
    setProducts(current => 
      current.map(p => p.id === id ? { ...p, ...updates } : p)
    );
  }, [checkIfLocked]);

  const deleteProduct = useCallback((id: string) => {
    setProducts(current => current.filter(p => p.id !== id));
  }, []);

  const getEnabledProducts = useCallback(() => {
    return products.filter(p => p.enabled).sort((a, b) => a.order - b.order);
  }, [products]);

  const reorderProducts = useCallback((fromIndex: number, toIndex: number) => {
    const sortedProducts = [...products].sort((a, b) => a.order - b.order);
    const [movedProduct] = sortedProducts.splice(fromIndex, 1);
    sortedProducts.splice(toIndex, 0, movedProduct);
    
    const reorderedProducts = sortedProducts.map((product, index) => ({
      ...product,
      order: index
    }));
    
    setProducts(reorderedProducts);
  }, [products]);

  // Product Types management
  const addProductType = useCallback((type: Omit<ProductType, 'id'>) => {
    const maxOrder = Math.max(...productTypes.map(t => t.order), -1);
    const newType: ProductType = {
      ...type,
      id: Date.now().toString(),
      order: maxOrder + 1,
      enabled: type.enabled ?? true
    };
    setProductTypes(current => [...current, newType]);
  }, [productTypes]);

  const updateProductType = useCallback((id: string, updates: Partial<ProductType>) => {
    setProductTypes(current => 
      current.map(t => t.id === id ? { ...t, ...updates } : t)
    );
  }, []);

  const deleteProductType = useCallback((id: string) => {
    setProductTypes(current => current.filter(t => t.id !== id));
  }, []);

  const reorderProductTypes = useCallback((fromIndex: number, toIndex: number) => {
    const sortedTypes = [...productTypes].sort((a, b) => a.order - b.order);
    const [movedType] = sortedTypes.splice(fromIndex, 1);
    sortedTypes.splice(toIndex, 0, movedType);
    
    const reorderedTypes = sortedTypes.map((type, index) => ({
      ...type,
      order: index
    }));
    
    setProductTypes(reorderedTypes);
  }, [productTypes]);

  const getProductTypeById = useCallback((typeId: string): ProductType | undefined => {
    return productTypes.find(t => t.id === typeId);
  }, [productTypes]);

  // Promo management
  const addPromo = useCallback((promo: Omit<Promo, 'id'>) => {
    const maxOrder = Math.max(...promos.map(p => p.order), -1);
    const newPromo: Promo = {
      ...promo,
      id: Date.now().toString(),
      order: maxOrder + 1
    };
    const updatedPromos = [...promos, newPromo];
    setPromos(updatedPromos);
    setSettings(current => ({ ...current, promos: updatedPromos }));
  }, [promos]);

  const updatePromo = useCallback((id: string, updates: Partial<Promo>) => {
    const updatedPromos = promos.map(p => p.id === id ? { ...p, ...updates } : p);
    setPromos(updatedPromos);
    setSettings(current => ({ ...current, promos: updatedPromos }));
  }, [promos]);

  const deletePromo = useCallback((id: string) => {
    const updatedPromos = promos.filter(p => p.id !== id);
    setPromos(updatedPromos);
    setSettings(current => ({ ...current, promos: updatedPromos }));
  }, [promos]);

  const reorderPromos = useCallback((fromIndex: number, toIndex: number) => {
    const sortedPromos = [...promos].sort((a, b) => a.order - b.order);
    const [movedPromo] = sortedPromos.splice(fromIndex, 1);
    sortedPromos.splice(toIndex, 0, movedPromo);
    
    const reorderedPromos = sortedPromos.map((promo, index) => ({
      ...promo,
      order: index
    }));
    
    setPromos(reorderedPromos);
    setSettings(current => ({ ...current, promos: reorderedPromos }));
  }, [promos]);

  // Settings management
  const updateSettings = useCallback(async (newSettings: Partial<AppSettings>) => {
    const locked = await checkIfLocked();
    if (locked) {
      console.warn('🔒 Blocked: Cannot update settings in locked event');
      return;
    }
    setSettings(current => ({ ...current, ...newSettings }));
  }, [checkIfLocked]);

  // Save all data (settings, products, AND transactions) to current event
  const saveAllData = useCallback(async (silent = false) => {
    try {
      if (!currentEventId) {
        if (!silent) console.error('❌ Cannot save: No current event ID');
        return false;
      }
      
      // Check if event is locked
      const eventData = await databaseService.loadEventData(currentEventId);
      if (eventData?.event.templatePin) {
        if (!silent) console.error('❌ Cannot save: Event is locked');
        return false;
      }
      
      setIsSaving(true);
      if (!silent) console.log(`💾 Saving all data to event ${currentEventId}...`);
      if (!silent) console.log(`📦 Products: ${products.length}, Transactions: ${transactions.length}, Types: ${productTypes.length}`);
      
      // Update event name in the events table
      await databaseService.updateEventName(currentEventId, settings.eventName);
      
      // Save event data (products AND transactions) using the CURRENT event ID
      await databaseService.saveEventData(currentEventId, products, transactions, productTypes, promos, settings);
      
      // Also save exchange rates
      await databaseService.saveExchangeRates({
        USD: exchangeRates.USD,
        EUR: exchangeRates.EUR,
        GBP: exchangeRates.GBP,
        customRates: exchangeRates.customRates
      });
      
      setLastSavedAt(new Date());
      setIsSaving(false);
      if (!silent) console.log(`✅ All data saved successfully to event ${currentEventId} (${products.length} products, ${transactions.length} transactions, ${productTypes.length} types)!`);
      return true;
    } catch (error) {
      setIsSaving(false);
      console.error('❌ Error saving data to event:', error);
      return false;
    }
  }, [currentEventId, products, transactions, exchangeRates, productTypes, promos, settings]);

  // Clear panel data (transactions and cart only)
  const clearPanelData = useCallback(async () => {
    try {
      console.log('🗑️ Clearing panel data...');
      await databaseService.clearTransactions();
      setTransactions([]);
      setCart([]);
      setOverrideTotal(undefined);
      console.log('✅ Panel data cleared');
      return true;
    } catch (error) {
      console.error('❌ Error clearing panel data:', error);
      return false;
    }
  }, []);

  // Clear ALL data from database
  const clearAllData = useCallback(async () => {
    try {
      console.log('🗑️ Clearing ALL data from database...');
      
      await databaseService.clearAllData();
      
      // Reset to defaults
      setProducts([]);
      setSettings(DEFAULT_SETTINGS);
      setTransactions([]);
      setDisplayCurrency('EUR');
      setCart([]);
      setOverrideTotal(undefined);
      
      console.log('✅ All data cleared from database');
      return true;
    } catch (error) {
      console.error('❌ Error clearing data from database:', error);
      return false;
    }
  }, []);



  // Debug function for SQLite database
  const debugStoredData = useCallback(async () => {
    try {
      await databaseService.debugDatabase();
      
      console.log('🎯 Current state in memory:');
      console.log('  Products in memory:', products.length);
      console.log('  Settings loaded:', settings.userName ? 'YES' : 'NO');
      console.log('  Transactions in memory:', transactions.length);
      console.log('  Display currency:', displayCurrency);
    } catch (error) {
      console.error('💥 Error debugging database:', error);
    }
  }, [products, settings, transactions, displayCurrency]);

  // New functions for price overrides
  const updateCartItemPrice = useCallback((productId: string, newPrice: number) => {
    setCart(current => 
      current.map(item => 
        item.product.id === productId 
          ? { ...item, overridePrice: newPrice }
          : item
      )
    );
  }, []);
  
  const clearCartItemPriceOverride = useCallback((productId: string) => {
    setCart(current => 
      current.map(item => 
        item.product.id === productId 
          ? { ...item, overridePrice: undefined }
          : item
      )
    );
  }, []);
  
  const updateTotalOverride = useCallback((newTotal: number) => {
    setOverrideTotal(newTotal);
  }, []);
  
  const clearTotalOverride = useCallback(() => {
    setOverrideTotal(undefined);
  }, []);
  


  const forceLoadBackupProducts = useCallback(async () => {
    try {
      console.log('🔄 Attempting to load products from database...');
      const loadedProducts = await databaseService.loadProducts();
      
      if (loadedProducts.length > 0) {
        setProducts(loadedProducts);
        console.log(`✅ Loaded ${loadedProducts.length} products from database`);
        return { success: true, count: loadedProducts.length };
      } else {
        console.log('ℹ️ No products found in database (this is normal for new setup)');
        return { success: false, count: 0, message: 'No products in database' };
      }
    } catch (error) {
      console.error('❌ Error loading products from database:', error);
      return { success: false, count: 0, error: String(error) };
    }
  }, []);

  const loadEventData = useCallback(async (eventId: string) => {
    try {
      console.log('📅 Loading event data into sales store...');
      console.log(`🔑 Loading event ID: ${eventId}`);
      const eventData = await databaseService.loadEventData(eventId);
      
      if (eventData) {
        console.log('🧹 Clearing previous event data...');
        setCart([]);
        setOverrideTotal(undefined);
        
        setCurrentEventId(eventId);
        setProducts(eventData.products);
        setProductTypes(eventData.productTypes || []);
        setSettings(eventData.settings);
        setPromos(eventData.settings.promos || []);
        setTransactions(eventData.transactions);
        setDisplayCurrency(eventData.settings.currency);
        setLastSavedAt(new Date(eventData.event.updatedAt));
        console.log(`✅ Event data loaded into sales store (${eventData.products.length} products, ${eventData.transactions.length} transactions, ${eventData.productTypes?.length || 0} types)`);
        console.log(`🔑 Current event ID set to: ${eventId}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Error loading event data:', error);
      return false;
    }
  }, []);

  const clearEventData = useCallback(() => {
    console.log('🗑️ Clearing event data...');
    setCurrentEventId(null);
    setProducts([]);
    setProductTypes([]);
    setPromos([]);
    setSettings({
      userName: '',
      eventName: '',
      currency: 'EUR',
      currencyRoundUp: false,
      isSetupComplete: false,
      appPromoPricing: {
        maxAppsForPromo: 7,
        prices: { 2: 50, 3: 75, 4: 90, 5: 110, 6: 130, 7: 150 }
      }
    });
    setTransactions([]);
    setCart([]);
    setDisplayCurrency('EUR');
    setOverrideTotal(undefined);
    setLastSavedAt(null);
    setIsSaving(false);
    console.log('✅ Event data cleared');
  }, []);

  const deleteTransaction = useCallback(async (transactionId: string) => {
    try {
      if (!currentEventId) {
        console.error('❌ Cannot delete transaction: No current event ID');
        return false;
      }

      const locked = await checkIfLocked();
      if (locked) {
        console.error('❌ Cannot delete transaction: Event is locked');
        return false;
      }

      console.log(`🗑️ Deleting transaction ${transactionId} from event ${currentEventId}...`);
      
      const updatedTransactions = transactions.filter(t => t.id !== transactionId);
      setTransactions(updatedTransactions);
      
      const eventData = await databaseService.loadEventData(currentEventId);
      if (eventData) {
        await databaseService.saveEventData(currentEventId, eventData.products, updatedTransactions);
        console.log(`✅ Transaction ${transactionId} deleted successfully`);
        return true;
      } else {
        console.error('❌ Failed to load event data for transaction deletion');
        return false;
      }
    } catch (error) {
      console.error('❌ Error deleting transaction:', error);
      return false;
    }
  }, [currentEventId, transactions, checkIfLocked]);

  const updateTransaction = useCallback(async (transactionId: string, updates: Partial<Transaction>) => {
    try {
      if (!currentEventId) {
        console.error('❌ Cannot update transaction: No current event ID');
        return false;
      }

      const locked = await checkIfLocked();
      if (locked) {
        console.error('❌ Cannot update transaction: Event is locked');
        return false;
      }

      console.log(`✏️ Updating transaction ${transactionId}...`, updates);
      
      const updatedTransactions = transactions.map(t => 
        t.id === transactionId ? { ...t, ...updates } : t
      );
      setTransactions(updatedTransactions);
      
      const eventData = await databaseService.loadEventData(currentEventId);
      if (eventData) {
        await databaseService.saveEventData(currentEventId, eventData.products, updatedTransactions);
        console.log(`✅ Transaction ${transactionId} updated successfully`);
        return true;
      } else {
        console.error('❌ Failed to load event data for transaction update');
        return false;
      }
    } catch (error) {
      console.error('❌ Error updating transaction:', error);
      return false;
    }
  }, [currentEventId, transactions, checkIfLocked]);

  // Auto-save when important data changes (debounced)
  useEffect(() => {
    if (!currentEventId || isLoading) return;
    
    const autoSaveTimer = setTimeout(() => {
      console.log('💾 Auto-saving event data...');
      saveAllData(true);
    }, 2000); // Save 2 seconds after last change
    
    return () => clearTimeout(autoSaveTimer);
  }, [products, transactions, settings, promos, productTypes, currentEventId, isLoading, saveAllData]);

  return {
    cart,
    transactions,
    displayCurrency,
    setDisplayCurrency,
    addToCart,
    removeFromCart,
    clearCart,
    getItemQuantity,
    totals,
    applicablePromotions: [], // No longer using named promotions
    completeTransaction,
    getTodaysSales,
    clearHistory,
    isLoading,
    products,
    settings,
    addProduct,
    updateProduct,
    deleteProduct,
    getEnabledProducts,
    updateSettings,
    saveAllData,
    clearPanelData,
    clearAllData,
    reorderProducts,
    debugStoredData,
    updateCartItemPrice,
    clearCartItemPriceOverride,
    updateTotalOverride,
    clearTotalOverride,
    overrideTotal,
    exchangeRates,
    fetchExchangeRates,
    isLoadingRates,
    updateCustomRate,
    clearCustomRates,
    getEffectiveRate,
    forceLoadBackupProducts,
    loadEventData,
    clearEventData,
    currentEventId,
    deleteTransaction,
    updateTransaction,
    productTypes,
    addProductType,
    updateProductType,
    deleteProductType,
    reorderProductTypes,
    getProductTypeById,
    promos,
    addPromo,
    updatePromo,
    deletePromo,
    reorderPromos,
    lastSavedAt,
    isSaving,
    checkIfLocked
  };


});