import React, { useState, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useSales } from '@/hooks/sales-store';
import TransactionItem from '@/components/TransactionItem';
import CustomHeader from '@/components/CustomHeader';
import { CURRENCIES } from '@/constants/products';

export default function HistoryScreen() {
  const { transactions, settings, exchangeRates, deleteTransaction, updateTransaction, getProductTypeById, checkIfLocked } = useSales();
  const [selectedDateIndex, setSelectedDateIndex] = useState(0);
  const [currentView, setCurrentView] = useState<'transactions' | 'groups'>('transactions');
  const scrollViewRef = useRef<ScrollView>(null);
  const { width: screenWidth } = useWindowDimensions();
  const [isLocked, setIsLocked] = useState(false);
  
  React.useEffect(() => {
    const checkLockStatus = async () => {
      const locked = await checkIfLocked();
      setIsLocked(locked);
    };
    checkLockStatus();
  }, [checkIfLocked]);
  
  const transactionsByDate = useMemo(() => {
    const groups: { [key: string]: typeof transactions } = {};
    
    transactions.forEach(transaction => {
      const date = new Date(transaction.timestamp);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;
      
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(transaction);
    });
    
    const sortedDates = Object.keys(groups).sort((a, b) => {
      const [yearA, monthA, dayA] = a.split('-').map(Number);
      const [yearB, monthB, dayB] = b.split('-').map(Number);
      const dateA = new Date(yearA, monthA - 1, dayA);
      const dateB = new Date(yearB, monthB - 1, dayB);
      return dateB.getTime() - dateA.getTime();
    });
    
    return sortedDates.map(dateKey => {
      const [year, month, day] = dateKey.split('-').map(Number);
      return {
        date: new Date(year, month - 1, day),
        transactions: groups[dateKey].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      };
    });
  }, [transactions]);
  
  const currentDateData = transactionsByDate[selectedDateIndex];
  const currentTransactions = currentDateData?.transactions || [];
  
  const mainCurrency = settings.currency;
  const mainCurrencyConfig = CURRENCIES[mainCurrency];
  
  const convertToMainCurrency = (amount: number, fromCurrency: string) => {
    const fromRate = CURRENCIES[fromCurrency].rate;
    const toRate = CURRENCIES[mainCurrency].rate;
    return amount * (toRate / fromRate);
  };
  
  const todaysTotal = currentTransactions.reduce((sum, t) => {
    return sum + convertToMainCurrency(t.total, t.currency);
  }, 0);
  const todaysCount = currentTransactions.length;
  
  const isToday = currentDateData && 
    new Date().toDateString() === currentDateData.date.toDateString();

  const dayGroupsSummary = useMemo(() => {
    if (!currentDateData) return null;

    const dayTransactions = currentDateData.transactions;
    const typeGroups = new Map<string, {
      total: number;
      byCurrencyAndMethod: {
        [currency: string]: {
          [method: string]: {
            quantity: number;
            total: number;
          };
        };
      };
      items: { productName: string; quantity: number; amount: number }[];
    }>();

    const subgroups = new Map<string, {
      total: number;
      items: { productName: string; quantity: number; amount: number }[];
      type: string;
    }>();

    dayTransactions.forEach(transaction => {
      const fromRate = exchangeRates[transaction.currency];
      const toRate = exchangeRates[mainCurrency];
      const conversionRate = toRate / fromRate;
      const currency = transaction.currency;
      const method = transaction.paymentMethod;

      transaction.items.forEach(item => {
        const productType = getProductTypeById(item.product.typeId);
        const type = productType?.name || 'Unknown';

        if (!typeGroups.has(type)) {
          typeGroups.set(type, {
            total: 0,
            byCurrencyAndMethod: {},
            items: []
          });
        }

        const group = typeGroups.get(type)!;
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

        const subgroupName = item.product.subgroup;
        if (subgroupName && subgroupName.trim() !== '') {
          if (!subgroups.has(subgroupName)) {
            const productType = getProductTypeById(item.product.typeId);
            subgroups.set(subgroupName, {
              total: 0,
              items: [],
              type: productType?.name || 'Unknown'
            });
          }

          const subgroup = subgroups.get(subgroupName)!;
          subgroup.total += convertedAmount;

          const existingSubItem = subgroup.items.find(i => i.productName === item.product.name);
          if (existingSubItem) {
            existingSubItem.quantity += item.quantity;
            existingSubItem.amount += convertedAmount;
          } else {
            subgroup.items.push({
              productName: item.product.name,
              quantity: item.quantity,
              amount: convertedAmount
            });
          }
        }
      });
    });

    return {
      typeGroups: Array.from(typeGroups.entries()).map(([type, data]) => ({ type, ...data })).sort((a, b) => 
        a.type === 'MagicPro Ideas' ? -1 : 1
      ),
      subgroups: Array.from(subgroups.entries()).map(([subgroupName, data]) => ({ subgroupName, ...data })).sort((a, b) => b.total - a.total)
    };
  }, [currentDateData, mainCurrency, exchangeRates, getProductTypeById]);
  
  const getDateTitle = () => {
    if (!currentDateData) return "Today's Sales";
    if (isToday) return "Today's Sales";
    return currentDateData.date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric'
    });
  };
  
  const canGoLeft = selectedDateIndex < transactionsByDate.length - 1;
  const canGoRight = selectedDateIndex > 0;

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

  const handleViewChange = (view: 'transactions' | 'groups') => {
    setCurrentView(view);
    const index = view === 'transactions' ? 0 : 1;
    scrollViewRef.current?.scrollTo({ x: index * screenWidth, animated: true });
  };

  const handleScroll = (event: { nativeEvent: { contentOffset: { x: number } } }) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / screenWidth);
    const newView = index === 0 ? 'transactions' : 'groups';
    if (newView !== currentView) {
      setCurrentView(newView);
    }
  };

  return (
    <View style={styles.container}>
      <CustomHeader 
        eventName={settings.eventName || 'Event'}
        userName={settings.userName || 'User'}
        currency={settings.currency}
      />
      
      <View style={styles.summary}>
        <View style={[styles.summaryCard, isToday ? styles.todayCard : styles.previousDayCard]}>
          <View style={styles.summaryHeader}>
            <TouchableOpacity 
              onPress={() => setSelectedDateIndex(selectedDateIndex + 1)}
              disabled={!canGoLeft}
              style={[styles.navButton, !canGoLeft && styles.navButtonDisabled]}
            >
              <ChevronLeft size={20} color={canGoLeft ? '#fff' : 'rgba(255,255,255,0.3)'} />
            </TouchableOpacity>
            
            <Text style={styles.summaryTitle}>{getDateTitle()}</Text>
            
            <TouchableOpacity 
              onPress={() => setSelectedDateIndex(selectedDateIndex - 1)}
              disabled={!canGoRight}
              style={[styles.navButton, !canGoRight && styles.navButtonDisabled]}
            >
              <ChevronRight size={20} color={canGoRight ? '#fff' : 'rgba(255,255,255,0.3)'} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.summaryContent}>
            <View style={styles.summaryColumn}>
              <Text style={styles.summaryLabel}>Transactions</Text>
              <Text style={styles.summaryValue}>{todaysCount}</Text>
            </View>
            
            <View style={styles.summaryColumn}>
              <Text style={styles.summaryLabel}>Total Amount</Text>
              <Text style={styles.summaryValue}>
                {mainCurrencyConfig.symbol}{todaysTotal.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {currentTransactions.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>
            {transactionsByDate.length === 0 ? 'No transactions yet' : 'No transactions on this date'}
          </Text>
          <Text style={styles.emptySubtext}>
            {transactionsByDate.length === 0 ? 'Complete a sale to see it here' : 'Try a different date'}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.viewNav}>
            <TouchableOpacity
              style={[
                styles.viewButton,
                currentView === 'transactions' && styles.viewButtonActive
              ]}
              onPress={() => handleViewChange('transactions')}
            >
              <Text style={[
                styles.viewButtonText,
                currentView === 'transactions' && styles.viewButtonTextActive
              ]}>Transactions</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.viewButton,
                currentView === 'groups' && styles.viewButtonActive
              ]}
              onPress={() => handleViewChange('groups')}
            >
              <Text style={[
                styles.viewButtonText,
                currentView === 'groups' && styles.viewButtonTextActive
              ]}>Groups</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollViewRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleScroll}
            scrollEventThrottle={16}
            style={styles.horizontalScroll}
          >
            <View style={[styles.scrollSection, { width: screenWidth }]}>
              <FlatList
                data={currentTransactions}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TransactionItem 
                    transaction={item} 
                    onDelete={deleteTransaction}
                    onUpdate={updateTransaction}
                    isLocked={isLocked}
                  />
                )}
                contentContainerStyle={styles.list}
                keyboardShouldPersistTaps="handled"
              />
            </View>

            <ScrollView style={[styles.scrollSection, { width: screenWidth }]} showsVerticalScrollIndicator={false}>
              <View style={styles.groupsContainer}>
                {dayGroupsSummary && dayGroupsSummary.typeGroups.length > 0 ? (
                  <>
                    <Text style={styles.groupsSectionTitle}>By Type</Text>
                    {dayGroupsSummary.typeGroups.map(group => {
                      const groupColor = group.type === 'MagicPro Ideas' ? '#2196F3' : '#FF9500';
                      return (
                        <View key={group.type} style={styles.groupCard}>
                          <View style={styles.groupHeader}>
                            <Text style={[styles.groupName, { color: groupColor }]}>{group.type}</Text>
                            <Text style={styles.groupTotal}>
                              {formatCurrency(group.total, mainCurrency)}
                            </Text>
                          </View>

                          <View style={styles.breakdownContainer}>
                            {Object.entries(group.byCurrencyAndMethod).map(([currency, methods]) => (
                              <View key={currency} style={styles.currencySection}>
                                <Text style={[styles.currencyLabel, { color: groupColor }]}>{currency}</Text>
                                {Object.entries(methods).map(([method, data]) => (
                                  <View key={method} style={styles.methodRow}>
                                    <Text style={styles.methodLabel}>
                                      {getPaymentMethodLabel(method)}
                                    </Text>
                                    <View style={styles.methodData}>
                                      <Text style={styles.quantityText}>
                                        {data.quantity} units
                                      </Text>
                                      <Text style={styles.amountText}>
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

                    {dayGroupsSummary.subgroups.length > 0 && (
                      <>
                        <Text style={styles.groupsSectionTitle}>By Subgroup</Text>
                        {dayGroupsSummary.subgroups.map(subgroup => {
                          const subgroupColor = subgroup.type === 'MagicPro Ideas' ? '#2196F3' : '#FF9500';
                          return (
                            <View key={subgroup.subgroupName} style={styles.groupCard}>
                              <View style={styles.groupHeader}>
                                <Text style={[styles.groupName, { color: subgroupColor }]}>{subgroup.subgroupName}</Text>
                                <Text style={styles.groupTotal}>
                                  {formatCurrency(subgroup.total, mainCurrency)}
                                </Text>
                              </View>

                              <View style={styles.groupItemsBreakdown}>
                                {subgroup.items.map(item => (
                                  <View key={item.productName} style={styles.groupItemRow}>
                                    <View style={styles.groupItemInfo}>
                                      <Text style={styles.groupItemName}>
                                        {item.productName}
                                      </Text>
                                      <Text style={styles.groupItemQuantity}>
                                        {item.quantity} units
                                      </Text>
                                    </View>
                                    <Text style={styles.groupItemAmount}>
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
                ) : (
                  <View style={styles.emptyGroupState}>
                    <Text style={styles.emptyText}>No group data available</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  summary: {
    padding: 16,
  },
  summaryCard: {
    borderRadius: 16,
    padding: 16,
  },
  todayCard: {
    backgroundColor: '#4CAF50',
  },
  previousDayCard: {
    backgroundColor: '#FFC107',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    flex: 1,
  },
  navButton: {
    padding: 8,
    borderRadius: 8,
  },
  navButtonDisabled: {
    opacity: 0.3,
  },
  summaryContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryColumn: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  list: {
    paddingBottom: 20,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
  },
  viewNav: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    marginBottom: 0,
  },
  viewButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  viewButtonActive: {
    borderBottomColor: '#4CAF50',
  },
  viewButtonText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  viewButtonTextActive: {
    color: '#4CAF50',
  },
  horizontalScroll: {
    flex: 1,
  },
  scrollSection: {
    flex: 1,
  },
  groupsContainer: {
    padding: 16,
    paddingBottom: 32,
  },
  groupsSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 8,
    marginBottom: 12,
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
    fontSize: 18,
    fontWeight: 'bold',
  },
  groupTotal: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
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
    textAlign: 'right' as const,
  },
  amountText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    minWidth: 80,
    textAlign: 'right' as const,
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
  emptyGroupState: {
    padding: 40,
    alignItems: 'center',
  },
});
