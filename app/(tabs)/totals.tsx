import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  FlatList,
} from 'react-native';
import { useSales } from '@/hooks/sales-store';
import { Product } from '@/types/sales';
import CustomHeader from '@/components/CustomHeader';

interface ProductSummary {
  product: Product;
  byCurrencyAndMethod: {
    [currency: string]: {
      [method: string]: {
        quantity: number;
        total: number;
      };
    };
  };
  totalQuantity: number;
}

interface CurrencySummary {
  [currency: string]: {
    [method: string]: {
      total: number;
      transactionCount: number;
    };
  };
}

interface TypeGroupSummary {
  type: string;
  total: number;
  byCurrencyAndMethod: {
    [currency: string]: {
      [method: string]: {
        quantity: number;
        total: number;
      };
    };
  };
  items: {
    productName: string;
    quantity: number;
    amount: number;
  }[];
}

interface SubgroupSummary {
  subgroupName: string;
  total: number;
  items: {
    productName: string;
    quantity: number;
    amount: number;
  }[];
}

export default function TotalsScreen() {
  const { transactions, products, settings, exchangeRates, getProductTypeById, productTypes } = useSales();
  const mainCurrency = settings.currency;
  const scrollViewRef = useRef<ScrollView>(null);
  const [currentSection, setCurrentSection] = useState(0);
  const { width: screenWidth } = useWindowDimensions();

  // Calculate main currency total from all transactions
  const mainCurrencyTotal = useMemo(() => {
    // Group transactions by date to get daily totals
    const dailyTotals = new Map<string, number>();
    
    transactions.forEach(transaction => {
      const date = new Date(transaction.timestamp);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      
      // Convert transaction total to main currency
      const fromRate = exchangeRates[transaction.currency];
      const toRate = exchangeRates[mainCurrency];
      const convertedAmount = transaction.total * (toRate / fromRate);
      
      dailyTotals.set(dateKey, (dailyTotals.get(dateKey) || 0) + convertedAmount);
    });
    
    // Sum all daily totals
    return Array.from(dailyTotals.values()).reduce((sum, total) => sum + total, 0);
  }, [transactions, mainCurrency, exchangeRates]);

  // Calculate currency summaries
  const currencySummaries = useMemo(() => {
    const summary: CurrencySummary = {};

    transactions.forEach(transaction => {
      const currency = transaction.currency;
      const method = transaction.paymentMethod;

      if (!summary[currency]) {
        summary[currency] = {};
      }
      if (!summary[currency][method]) {
        summary[currency][method] = {
          total: 0,
          transactionCount: 0,
        };
      }

      summary[currency][method].total += transaction.total;
      summary[currency][method].transactionCount += 1;
    });

    return summary;
  }, [transactions]);

  // Calculate product summaries
  const productSummaries = useMemo(() => {
    const summaryMap = new Map<string, ProductSummary>();

    // Initialize summaries for all products
    products.forEach(product => {
      summaryMap.set(product.id, {
        product,
        byCurrencyAndMethod: {},
        totalQuantity: 0,
      });
    });

    // Process all transactions
    transactions.forEach(transaction => {
      transaction.items.forEach(item => {
        const summary = summaryMap.get(item.product.id);
        if (!summary) return;

        const currency = transaction.currency;
        const method = transaction.paymentMethod;

        if (!summary.byCurrencyAndMethod[currency]) {
          summary.byCurrencyAndMethod[currency] = {};
        }
        if (!summary.byCurrencyAndMethod[currency][method]) {
          summary.byCurrencyAndMethod[currency][method] = {
            quantity: 0,
            total: 0,
          };
        }

        summary.byCurrencyAndMethod[currency][method].quantity += item.quantity;
        // Use the actual effective price from the transaction (which includes proportional discounts)
        summary.byCurrencyAndMethod[currency][method].total += item.product.price * item.quantity;
        summary.totalQuantity += item.quantity;
      });
    });

    // Filter out products with no sales
    return Array.from(summaryMap.values()).filter(s => s.totalQuantity > 0);
  }, [transactions, products]);

  const formatCurrency = (amount: number, currency: string) => {
    const currencySymbols: { [key: string]: string } = {
      'EUR': '€',
      'USD': '$',
      'GBP': '£',
    };
    const symbol = currencySymbols[currency] || currency;
    return `${symbol}${amount.toFixed(2)}`;
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'cash': return 'Cash';
      case 'card': return 'Card';
      case 'qr': return 'QR';
      default: return method;
    }
  };

  const handleSectionChange = (index: number) => {
    setCurrentSection(index);
    scrollViewRef.current?.scrollTo({ x: index * screenWidth, animated: true });
  };

  // Calculate subtotals by type
  const typeSubtotals = useMemo(() => {
    if (productTypes.length === 0) {
      console.log('⚠️ No product types defined');
      return [];
    }

    const typeMap = new Map<string, { typeId: string; name: string; color: string; total: number; order: number }>();

    // Initialize all types with 0
    productTypes.forEach(type => {
      typeMap.set(type.id, {
        typeId: type.id,
        name: type.name,
        color: type.color,
        total: 0,
        order: type.order
      });
      console.log(`📊 Initialized type: ${type.name} (${type.id})`);
    });

    // Calculate totals from transactions
    console.log(`💰 Calculating totals from ${transactions.length} transactions`);
    transactions.forEach(transaction => {
      const fromRate = exchangeRates[transaction.currency];
      const toRate = exchangeRates[mainCurrency];
      const conversionRate = toRate / fromRate;

      transaction.items.forEach(item => {
        console.log(`  📦 Product: ${item.product.name}, TypeId: ${item.product.typeId}`);
        const typeData = typeMap.get(item.product.typeId);
        if (typeData) {
          const convertedAmount = item.product.price * item.quantity * conversionRate;
          typeData.total += convertedAmount;
          console.log(`    ✅ Added ${convertedAmount} to ${typeData.name} (total now: ${typeData.total})`);
        } else {
          console.log(`    ⚠️ Type not found for typeId: ${item.product.typeId}`);
        }
      });
    });

    const result = Array.from(typeMap.values())
      .sort((a, b) => a.order - b.order);
    
    console.log('📊 Final type subtotals:', result.map(t => `${t.name}: ${t.total}`));
    return result;
  }, [transactions, mainCurrency, exchangeRates, productTypes]);

  const typeGroupSummaries = useMemo(() => {
    const typeMap = new Map<string, TypeGroupSummary>();

    transactions.forEach(transaction => {
      const fromRate = exchangeRates[transaction.currency];
      const toRate = exchangeRates[mainCurrency];
      const conversionRate = toRate / fromRate;
      const currency = transaction.currency;
      const method = transaction.paymentMethod;

      transaction.items.forEach(item => {
        const productType = getProductTypeById(item.product.typeId);
        const type = productType?.name || 'Unknown';

        if (!typeMap.has(type)) {
          typeMap.set(type, {
            type,
            total: 0,
            byCurrencyAndMethod: {},
            items: []
          });
        }

        const group = typeMap.get(type)!;
        const convertedAmount = item.product.price * item.quantity * conversionRate;
        group.total += convertedAmount;

        if (!group.byCurrencyAndMethod[currency]) {
          group.byCurrencyAndMethod[currency] = {};
        }
        if (!group.byCurrencyAndMethod[currency][method]) {
          group.byCurrencyAndMethod[currency][method] = {
            quantity: 0,
            total: 0
          };
        }

        group.byCurrencyAndMethod[currency][method].quantity += item.quantity;
        // Use the actual effective price from the transaction (which includes proportional discounts)
        group.byCurrencyAndMethod[currency][method].total += item.product.price * item.quantity;

        const existingItem = group.items.find(i => i.productName === item.product.name);
        if (existingItem) {
          existingItem.quantity += item.quantity;
          existingItem.amount += convertedAmount;
        } else {
          group.items.push({
            productName: item.product.name,
            quantity: item.quantity,
            amount: convertedAmount
          });
        }
      });
    });

    // Sort by the order defined in productTypes
    return Array.from(typeMap.values()).sort((a, b) => {
      const typeA = productTypes.find(t => t.name === a.type);
      const typeB = productTypes.find(t => t.name === b.type);
      return (typeA?.order || 999) - (typeB?.order || 999);
    });
  }, [transactions, mainCurrency, exchangeRates, getProductTypeById, productTypes]);

  const subgroupSummaries = useMemo(() => {
    const subgroupMap = new Map<string, SubgroupSummary & { type: string }>();

    transactions.forEach(transaction => {
      const fromRate = exchangeRates[transaction.currency];
      const toRate = exchangeRates[mainCurrency];
      const conversionRate = toRate / fromRate;

      transaction.items.forEach(item => {
        const subgroupName = item.product.subgroup;
        if (!subgroupName || subgroupName.trim() === '') return;

        if (!subgroupMap.has(subgroupName)) {
          const productType = getProductTypeById(item.product.typeId);
          subgroupMap.set(subgroupName, {
            subgroupName,
            total: 0,
            items: [],
            type: productType?.name || 'Unknown'
          });
        }

        const subgroup = subgroupMap.get(subgroupName)!;
        const convertedAmount = item.product.price * item.quantity * conversionRate;
        subgroup.total += convertedAmount;

        const existingItem = subgroup.items.find(i => i.productName === item.product.name);
        if (existingItem) {
          existingItem.quantity += item.quantity;
          existingItem.amount += convertedAmount;
        } else {
          subgroup.items.push({
            productName: item.product.name,
            quantity: item.quantity,
            amount: convertedAmount
          });
        }
      });
    });

    return Array.from(subgroupMap.values()).sort((a, b) => b.total - a.total);
  }, [transactions, mainCurrency, exchangeRates, getProductTypeById]);

  const handleScroll = (event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / screenWidth);
    if (index !== currentSection && index >= 0 && index <= 2) {
      setCurrentSection(index);
    }
  };

  const dynamicStyles = useMemo(() => styles(screenWidth), [screenWidth]);

  return (
    <View style={dynamicStyles.container}>
      <CustomHeader 
        eventName={settings.eventName || 'Event'}
        userName={settings.userName || 'User'}
        currency={settings.currency}
      />
      
      {/* Subtotals by Type */}
      <View style={dynamicStyles.totalSection}>
        {typeSubtotals.length > 0 ? (
          <>
            <Text style={dynamicStyles.subtotalsHeader}>Subtotals ({mainCurrency})</Text>
            <View style={dynamicStyles.subtotalsContainer}>
              <FlatList
                data={typeSubtotals}
                keyExtractor={(item) => item.typeId}
                showsVerticalScrollIndicator={true}
                style={dynamicStyles.subtotalsList}
                renderItem={({ item }) => (
                  <View style={dynamicStyles.subtotalRow}>
                    <View style={dynamicStyles.subtotalLabelContainer}>
                      <View style={[dynamicStyles.subtotalColorDot, { backgroundColor: item.color }]} />
                      <Text style={dynamicStyles.subtotalLabel}>{item.name} Subtotal</Text>
                    </View>
                    <Text style={dynamicStyles.subtotalAmount}>
                      {formatCurrency(item.total, mainCurrency)}
                    </Text>
                  </View>
                )}
              />
            </View>
            <View style={dynamicStyles.totalDivider} />
            <View style={dynamicStyles.totalRow}>
              <Text style={dynamicStyles.totalLabel}>Total</Text>
              <Text style={dynamicStyles.totalAmount}>
                {formatCurrency(mainCurrencyTotal, mainCurrency)}
              </Text>
            </View>
          </>
        ) : (
          <>
            <Text style={dynamicStyles.totalLabel}>Total Sales ({mainCurrency})</Text>
            <Text style={dynamicStyles.totalAmount}>
              {formatCurrency(mainCurrencyTotal, mainCurrency)}
            </Text>
            <Text style={dynamicStyles.totalSubtext}>No sales yet</Text>
          </>
        )}
      </View>

      {/* Section Navigation */}
      <View style={dynamicStyles.sectionNav}>
        <TouchableOpacity
          style={[
            dynamicStyles.navButton,
            currentSection === 0 && dynamicStyles.navButtonActive
          ]}
          onPress={() => handleSectionChange(0)}
        >
          <Text style={[
            dynamicStyles.navButtonText,
            currentSection === 0 && dynamicStyles.navButtonTextActive
          ]}>Products</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            dynamicStyles.navButton,
            currentSection === 1 && dynamicStyles.navButtonActive
          ]}
          onPress={() => handleSectionChange(1)}
        >
          <Text style={[
            dynamicStyles.navButtonText,
            currentSection === 1 && dynamicStyles.navButtonTextActive
          ]}>Currencies</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            dynamicStyles.navButton,
            currentSection === 2 && dynamicStyles.navButtonActive
          ]}
          onPress={() => handleSectionChange(2)}
        >
          <Text style={[
            dynamicStyles.navButtonText,
            currentSection === 2 && dynamicStyles.navButtonTextActive
          ]}>Groups</Text>
        </TouchableOpacity>
      </View>

      {/* Horizontal ScrollView for sections */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
        style={dynamicStyles.horizontalScroll}
      >
        {/* Products Section */}
        <ScrollView style={dynamicStyles.sectionContainer} showsVerticalScrollIndicator={false}>
          <View style={dynamicStyles.productsSection}>
            <Text style={dynamicStyles.sectionTitle}>Product Sales by Currency & Payment Method</Text>
            
            {productSummaries.length === 0 ? (
              <View style={dynamicStyles.emptyState}>
                <Text style={dynamicStyles.emptyText}>No sales recorded yet</Text>
              </View>
            ) : (
              productSummaries.map(summary => (
                <View key={summary.product.id} style={dynamicStyles.productCard}>
                  <View style={dynamicStyles.productHeader}>
                    <View 
                      style={[
                        dynamicStyles.productColor,
                        { backgroundColor: getProductTypeById(summary.product.typeId)?.color || '#999' }
                      ]} 
                    />
                    <View style={dynamicStyles.productNameContainer}>
                      <Text style={dynamicStyles.productName}>{summary.product.name}</Text>
                      <Text style={dynamicStyles.productSubtotal}>
                        {formatCurrency(
                          Object.entries(summary.byCurrencyAndMethod).reduce((sum, [currency, methods]) => 
                            sum + Object.values(methods).reduce((methodSum, data) => {
                              const fromRate = exchangeRates[currency as 'USD' | 'EUR' | 'GBP'];
                              const toRate = exchangeRates[mainCurrency];
                              const conversionRate = toRate / fromRate;
                              return methodSum + (data.total * conversionRate);
                            }, 0),
                          0),
                          mainCurrency
                        )}
                      </Text>
                    </View>
                    <Text style={dynamicStyles.productTotal}>
                      {summary.totalQuantity} units
                    </Text>
                  </View>

                  <View style={dynamicStyles.breakdownContainer}>
                    {Object.entries(summary.byCurrencyAndMethod).map(([currency, methods]) => (
                      <View key={currency} style={dynamicStyles.currencySection}>
                        <Text style={dynamicStyles.currencyLabel}>{currency}</Text>
                        {Object.entries(methods).map(([method, data]) => (
                          <View key={method} style={dynamicStyles.methodRow}>
                            <Text style={dynamicStyles.methodLabel}>
                              {getPaymentMethodLabel(method)}
                            </Text>
                            <View style={dynamicStyles.methodData}>
                              <Text style={dynamicStyles.quantityText}>
                                {data.quantity} units
                              </Text>
                              <Text style={dynamicStyles.amountText}>
                                {formatCurrency(data.total, currency)}
                              </Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        {/* Currencies Section */}
        <ScrollView style={dynamicStyles.sectionContainer} showsVerticalScrollIndicator={false}>
          <View style={dynamicStyles.currenciesSection}>
            <Text style={dynamicStyles.sectionTitle}>Sales by Currency & Payment Method</Text>
            
            {Object.keys(currencySummaries).length === 0 ? (
              <View style={dynamicStyles.emptyState}>
                <Text style={dynamicStyles.emptyText}>No sales recorded yet</Text>
              </View>
            ) : (
              Object.entries(currencySummaries).map(([currency, methods]) => {
                const currencyTotal = Object.values(methods).reduce((sum, m) => sum + m.total, 0);
                const totalTransactions = Object.values(methods).reduce((sum, m) => sum + m.transactionCount, 0);
                
                return (
                  <View key={currency} style={dynamicStyles.currencyCard}>
                    <View style={dynamicStyles.currencyHeader}>
                      <Text style={dynamicStyles.currencyName}>{currency}</Text>
                      <View>
                        <Text style={dynamicStyles.currencyTotal}>
                          {formatCurrency(currencyTotal, currency)}
                        </Text>
                        <Text style={dynamicStyles.currencyTransactions}>
                          {totalTransactions} transactions
                        </Text>
                      </View>
                    </View>

                    <View style={dynamicStyles.methodsBreakdown}>
                      {Object.entries(methods).map(([method, data]) => (
                        <View key={method} style={dynamicStyles.currencyMethodRow}>
                          <View style={dynamicStyles.methodInfo}>
                            <Text style={dynamicStyles.methodName}>
                              {getPaymentMethodLabel(method)}
                            </Text>
                            <Text style={dynamicStyles.methodTransactions}>
                              {data.transactionCount} transactions
                            </Text>
                          </View>
                          <Text style={dynamicStyles.methodAmount}>
                            {formatCurrency(data.total, currency)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>

        {/* Groups Section */}
        <ScrollView style={dynamicStyles.sectionContainer} showsVerticalScrollIndicator={false}>
          <View style={dynamicStyles.groupsSection}>
            <Text style={dynamicStyles.sectionTitle}>Sales by Groups ({mainCurrency})</Text>
            
            {typeGroupSummaries.length === 0 ? (
              <View style={dynamicStyles.emptyState}>
                <Text style={dynamicStyles.emptyText}>No sales recorded yet</Text>
              </View>
            ) : (
              <>
                {/* Type Groups */}
                <Text style={dynamicStyles.subsectionTitle}>By Type</Text>
                {typeGroupSummaries.map(group => {
                  const productType = productTypes.find(t => t.name === group.type);
                  const groupColor = productType?.color || '#999';
                  return (
                  <View key={group.type} style={dynamicStyles.groupCard}>
                    <View style={dynamicStyles.groupHeader}>
                      <Text style={[dynamicStyles.groupName, { color: groupColor }]}>{group.type}</Text>
                      <Text style={dynamicStyles.groupTotal}>
                        {formatCurrency(group.total, mainCurrency)}
                      </Text>
                    </View>

                    <View style={dynamicStyles.breakdownContainer}>
                      {Object.entries(group.byCurrencyAndMethod).map(([currency, methods]) => (
                        <View key={currency} style={dynamicStyles.currencySection}>
                          <Text style={[dynamicStyles.currencyLabel, { color: groupColor }]}>{currency}</Text>
                          {Object.entries(methods).map(([method, data]) => (
                            <View key={method} style={dynamicStyles.methodRow}>
                              <Text style={dynamicStyles.methodLabel}>
                                {getPaymentMethodLabel(method)}
                              </Text>
                              <View style={dynamicStyles.methodData}>
                                <Text style={dynamicStyles.quantityText}>
                                  {data.quantity} units
                                </Text>
                                <Text style={dynamicStyles.amountText}>
                                  {formatCurrency(data.total, currency)}
                                </Text>
                              </View>
                            </View>
                          ))}
                        </View>
                      ))}
                    </View>
                  </View>
                );
                })}

                {/* Subgroups */}
                {subgroupSummaries.length > 0 && (
                  <>
                    <Text style={dynamicStyles.subsectionTitle}>By Subgroup</Text>
                    {subgroupSummaries.map(subgroup => {
                      const productType = productTypes.find(t => t.name === subgroup.type);
                      const subgroupColor = productType?.color || '#999';
                      return (
                      <View key={subgroup.subgroupName} style={dynamicStyles.groupCard}>
                        <View style={dynamicStyles.groupHeader}>
                          <Text style={[dynamicStyles.groupName, { color: subgroupColor }]}>{subgroup.subgroupName}</Text>
                          <Text style={dynamicStyles.groupTotal}>
                            {formatCurrency(subgroup.total, mainCurrency)}
                          </Text>
                        </View>

                        <View style={dynamicStyles.groupItemsBreakdown}>
                          {subgroup.items.map(item => (
                            <View key={item.productName} style={dynamicStyles.groupItemRow}>
                              <View style={dynamicStyles.groupItemInfo}>
                                <Text style={dynamicStyles.groupItemName}>
                                  {item.productName}
                                </Text>
                                <Text style={dynamicStyles.groupItemQuantity}>
                                  {item.quantity} units
                                </Text>
                              </View>
                              <Text style={dynamicStyles.groupItemAmount}>
                                {formatCurrency(item.amount, mainCurrency)}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    );
                    })}
                  </>
                )}
              </>
            )}
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = (screenWidth: number) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  horizontalScroll: {
    flex: 1,
  },
  sectionContainer: {
    width: screenWidth,
    flex: 1,
  },
  sectionNav: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  navButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  navButtonActive: {
    borderBottomColor: '#2196F3',
  },
  navButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  navButtonTextActive: {
    color: '#2196F3',
  },
  totalSection: {
    backgroundColor: '#2196F3',
    padding: 20,
  },
  subtotalsHeader: {
    fontSize: 14,
    color: 'white',
    opacity: 0.9,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtotalsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    padding: 12,
    maxHeight: 120,
    minHeight: 120,
  },
  subtotalsList: {
    flex: 1,
  },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  subtotalLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  subtotalColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  subtotalLabel: {
    fontSize: 14,
    color: 'white',
    fontWeight: '500',
  },
  subtotalAmount: {
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
  },
  totalDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    marginVertical: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  totalLabel: {
    fontSize: 18,
    color: 'white',
    fontWeight: 'bold',
  },
  totalAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
  },
  totalSubtext: {
    fontSize: 12,
    color: 'white',
    opacity: 0.7,
    textAlign: 'center',
    marginTop: 8,
  },
  productsSection: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  productCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  productHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  productColor: {
    width: 24,
    height: 24,
    borderRadius: 4,
    marginRight: 12,
  },
  productName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  productTotal: {
    fontSize: 14,
    color: '#666',
  },
  breakdownContainer: {
    marginTop: 8,
  },
  currencySection: {
    marginBottom: 12,
  },
  currencyLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  methodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 16,
  },
  methodLabel: {
    fontSize: 14,
    color: '#666',
    minWidth: 60,
  },
  methodData: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  quantityText: {
    fontSize: 14,
    color: '#333',
    minWidth: 60,
    textAlign: 'right',
  },
  amountText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    minWidth: 80,
    textAlign: 'right',
  },
  currenciesSection: {
    padding: 16,
  },
  currencyCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  currencyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  currencyName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  currencyTotal: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'right',
  },
  currencyTransactions: {
    fontSize: 12,
    color: '#666',
    textAlign: 'right',
    marginTop: 2,
  },
  methodsBreakdown: {
    marginTop: 8,
  },
  currencyMethodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e030',
  },
  methodInfo: {
    flex: 1,
  },
  methodName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  methodTransactions: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  methodAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  groupsSection: {
    padding: 16,
  },
  groupCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  groupName: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  groupTotal: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  groupItemsBreakdown: {
    marginTop: 8,
  },
  groupItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e030',
  },
  groupItemInfo: {
    flex: 1,
  },
  groupItemName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  groupItemQuantity: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  groupItemAmount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 12,
  },
  productNameContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginRight: 12,
  },
  productSubtotal: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2196F3',
  },
});