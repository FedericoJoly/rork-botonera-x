import React, { useState, useMemo, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal, Pressable, TextInput, KeyboardAvoidingView, Platform, ScrollView, Alert, Keyboard } from 'react-native';
import { CreditCard, Smartphone, Banknote, X, Check, Edit3 } from 'lucide-react-native';
import { useSales } from '@/hooks/sales-store';
import { useAuth } from '@/hooks/auth-store';
import { CURRENCIES } from '@/constants/products';
import { PaymentMethod } from '@/types/sales';
import { databaseService } from '@/hooks/database';

export default function CartSummary() {
  const { cart, displayCurrency, setDisplayCurrency, completeTransaction, clearCart, settings, updateTotalOverride, clearTotalOverride, overrideTotal, totals, getEffectiveRate, productTypes, promos, currentEventId } = useSales();
  const { currentEvent } = useAuth();
  const [showPayment, setShowPayment] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [email, setEmail] = useState('');
  const [showTotalModal, setShowTotalModal] = useState(false);
  const [editTotal, setEditTotal] = useState('');
  const [isLocked, setIsLocked] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const notesInputRef = useRef<TextInput>(null);
  const [notesInputY, setNotesInputY] = useState(0);

  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => {
        setKeyboardVisible(true);
        setTimeout(() => {
          if (notesInputY > 0) {
            scrollViewRef.current?.scrollTo({ y: notesInputY - 50, animated: true });
          }
        }, 150);
      }
    );

    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardVisible(false);
        scrollViewRef.current?.scrollTo({ y: 0, animated: true });
      }
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, [notesInputY]);
  
  const currencyConfig = CURRENCIES[displayCurrency];
  const hasItems = cart.length > 0;
  
  const typeSubtotals = useMemo(() => {
    const mainCurrency = settings.currency;
    const mainCurrencyRate = getEffectiveRate(mainCurrency);
    const displayCurrencyRate = getEffectiveRate(displayCurrency);
    const conversionRate = displayCurrencyRate / mainCurrencyRate;
    
    const sortedTypes = [...productTypes].filter(t => t.enabled).sort((a, b) => a.order - b.order);
    
    return sortedTypes.map(type => {
      const typeItems = cart.filter(item => item.product.typeId === type.id);
      
      // Check if there's a Type List promo for this type
      const typeListPromo = promos.find(p => p.mode === 'type_list' && p.typeId === type.id);
      
      // Separate eligible and non-eligible items
      const promoEligibleItems = typeItems.filter(item => item.product.promoEligible);
      const nonEligibleItems = typeItems.filter(item => !item.product.promoEligible);
      
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
            }
          } else {
            // Use incremental pricing
            const basePrice = typeListPromo.prices[typeListPromo.maxQuantity] || 0;
            const extraQuantity = promoQuantity - typeListPromo.maxQuantity;
            
            if (extraQuantity < 6 && typeListPromo.incrementalPrice !== undefined) {
              // First 5 extra (quantities 5-9), use +4 pricing
              eligibleSubtotal = basePrice + (extraQuantity * typeListPromo.incrementalPrice);
            } else if (extraQuantity >= 6 && typeListPromo.incrementalPrice !== undefined && typeListPromo.incrementalPrice10Plus !== undefined) {
              // From quantity 10+, first 5 use +4, then +10 kicks in
              eligibleSubtotal = basePrice + (5 * typeListPromo.incrementalPrice) + ((extraQuantity - 5) * typeListPromo.incrementalPrice10Plus);
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
      const promoSubtotal = eligibleSubtotal + nonEligibleSubtotal;
      
      let convertedPromoSubtotal = displayCurrency === mainCurrency ? promoSubtotal : promoSubtotal * conversionRate;
      
      if (settings.currencyRoundUp && displayCurrency !== mainCurrency) {
        convertedPromoSubtotal = Math.ceil(convertedPromoSubtotal);
      }
      
      return {
        type,
        subtotal: convertedPromoSubtotal,
        hasPromo: typeListPromo !== undefined,
        promoName: typeListPromo?.name
      };
    });
  }, [cart, productTypes, settings.currency, displayCurrency, settings.currencyRoundUp, getEffectiveRate, promos]);

  React.useEffect(() => {
    const checkLockStatus = async () => {
      if (!currentEventId) {
        setIsLocked(false);
        return;
      }
      
      const eventData = await databaseService.loadEventData(currentEventId);
      const locked = !!eventData?.event.templatePin;
      setIsLocked(locked);
      
      console.log('🔐 CartSummary: Lock status check:', {
        hasCurrentEvent: !!currentEvent,
        eventId: currentEvent?.id,
        eventName: currentEvent?.eventName,
        templatePin: eventData?.event.templatePin,
        isLocked: locked,
        canPay: hasItems && totals.total > 0
      });
    };
    
    checkLockStatus();
  }, [currentEvent, currentEventId, hasItems, totals.total]);
  
  const canPay = hasItems && totals.total > 0;
  
  // Payment method availability:
  // - QR: When transaction currency matches main currency (all currencies)
  // - Card: Only for EUR transactions
  const canUseQR = displayCurrency === settings.currency;
  const canUseCard = displayCurrency === 'EUR';

  const handlePayment = async (method: PaymentMethod) => {
    try {
      await completeTransaction(method, email);
      setShowPayment(false);
      setShowSuccess(true);
      setEmail('');
      setTimeout(() => setShowSuccess(false), 2000);
    } catch (error: any) {
      setShowPayment(false);
      Alert.alert('Cannot Complete Transaction', error?.message || 'This event is locked.');
    }
  };
  
  const handleTotalDoublePress = () => {
    if (isLocked || totals.total <= 0) {
      return;
    }
    setEditTotal(totals.total.toFixed(2));
    setShowTotalModal(true);
  };
  
  const handleSaveTotal = () => {
    const newTotal = parseFloat(editTotal);
    if (!isNaN(newTotal) && newTotal >= 0) {
      // Convert back to main currency if needed
      const mainCurrency = settings.currency;
      const mainCurrencyRate = getEffectiveRate(mainCurrency);
      const displayCurrencyRate = getEffectiveRate(displayCurrency);
      const conversionRate = displayCurrency === mainCurrency ? 1 : displayCurrencyRate / mainCurrencyRate;
      const totalInMainCurrency = displayCurrency === mainCurrency ? newTotal : newTotal / conversionRate;
      updateTotalOverride(totalInMainCurrency);
    }
    setShowTotalModal(false);
  };
  
  const handleClearTotalOverride = () => {
    clearTotalOverride();
    setShowTotalModal(false);
  };

  const sortedCurrencies = useMemo(() => {
    const entries = Object.entries(CURRENCIES);
    return entries.sort(([codeA], [codeB]) => {
      if (codeA === settings.currency) return -1;
      if (codeB === settings.currency) return 1;
      return 0;
    });
  }, [settings.currency]);

  return (
    <>
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 140 : 0}
      >
        <ScrollView 
          ref={scrollViewRef}
          style={styles.scrollContainer}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.totalsContainer}>
          <View style={styles.totals}>
            {/* Scrollable type-based subtotals (max 3 rows visible) */}
            <ScrollView 
              style={styles.subtotalsScrollView}
              showsVerticalScrollIndicator={true}
            >
              {typeSubtotals.map(({ type, subtotal, hasPromo, promoName }) => (
                <View 
                  key={type.id} 
                  style={[
                    styles.totalRow, 
                    styles.subtotalRow,
                    { backgroundColor: type.color }
                  ]}
                >
                  <Text style={[styles.totalLabel, styles.subtotalLabel]}>{type.name} Subtotal:</Text>
                  <Text style={[styles.totalValue, styles.subtotalValue]}>
                    {currencyConfig.symbol}{settings.currencyRoundUp && displayCurrency !== settings.currency ? subtotal.toFixed(0) : subtotal.toFixed(2)}
                  </Text>
                </View>
              ))}
            </ScrollView>
            
            {/* Final Total - Always visible */}
            <View style={[styles.totalRow, styles.finalTotal]}>
              <Text style={styles.finalLabel}>Total:</Text>
              <TouchableOpacity onPress={handleTotalDoublePress} disabled={totals.total <= 0 || isLocked}>
                <Text style={[
                  styles.finalValue, 
                  overrideTotal !== undefined && styles.overrideTotal
                ]}>
                  {currencyConfig.symbol}{settings.currencyRoundUp && displayCurrency !== settings.currency ? totals.total.toFixed(0) : totals.total.toFixed(2)}
                </Text>
                {overrideTotal !== undefined && <Text style={styles.overrideIndicator}>*</Text>}
              </TouchableOpacity>
            </View>
          </View>

          {/* Currency Selection Buttons */}
          <View style={styles.currencySelector}>
            {sortedCurrencies.map(([code, config]) => (
              <TouchableOpacity
                key={code}
                style={[
                  styles.currencyButton,
                  displayCurrency === code && styles.currencyButtonActive,
                ]}
                onPress={() => setDisplayCurrency(code as any)}
              >
                <Text
                  style={[
                    styles.currencyText,
                    displayCurrency === code && styles.currencyTextActive,
                  ]}
                >
                  {config.symbol} {code}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View 
          style={styles.emailSection}
          onLayout={(e) => setNotesInputY(e.nativeEvent.layout.y)}
        >
          <View style={styles.emailInputContainer}>
            <Edit3 size={20} color="#666" style={styles.emailIcon} />
            <TextInput
              ref={notesInputRef}
              style={styles.emailInput}
              placeholder="Notes (optional)"
              value={email}
              onChangeText={setEmail}
              keyboardType="default"
              autoCapitalize="none"
              autoCorrect={false}
              onFocus={() => {
                setTimeout(() => {
                  scrollViewRef.current?.scrollToEnd({ animated: true });
                }, 200);
              }}
            />
          </View>
        </View>

          <View style={styles.actions}>
            <TouchableOpacity 
              style={[styles.clearButton, !hasItems && styles.buttonDisabled]}
              onPress={clearCart}
              disabled={!hasItems}
            >
              <Text style={styles.clearButtonText}>Clear</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.payButton, (!canPay || isLocked) && styles.buttonDisabled]}
              onPress={() => {
                if (isLocked) {
                  Alert.alert('Read-Only Event', 'This is a read-only event.');
                  return;
                }
                if (!hasItems || totals.total <= 0) {
                  return;
                }
                setShowPayment(true);
              }}
              disabled={!canPay || isLocked}
            >
              <Text style={[styles.payButtonText, (!canPay || isLocked) && styles.disabledText]}>Pay Now</Text>
            </TouchableOpacity>
          </View>
          
          {keyboardVisible && <View style={styles.keyboardSpacer} />}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Payment Method Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showPayment}
        onRequestClose={() => setShowPayment(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowPayment(false)}>
          <View style={styles.paymentModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Payment Method</Text>
              <TouchableOpacity onPress={() => setShowPayment(false)}>
                <X size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.paymentTotal}>
              Total: {currencyConfig.symbol}{settings.currencyRoundUp && displayCurrency !== settings.currency ? totals.total.toFixed(0) : totals.total.toFixed(2)}
            </Text>
            
            <TouchableOpacity 
              style={styles.paymentOption}
              onPress={() => handlePayment('cash')}
            >
              <Banknote size={32} color="#4CAF50" />
              <Text style={styles.paymentOptionText}>Cash</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.paymentOption, !canUseCard && styles.paymentOptionDisabled]}
              onPress={() => handlePayment('card')}
              disabled={!canUseCard}
            >
              <CreditCard size={32} color={canUseCard ? "#2196F3" : "#999"} />
              <Text style={[styles.paymentOptionText, !canUseCard && styles.paymentOptionTextDisabled]}>Card</Text>
              {!canUseCard && <Text style={styles.disabledReasonText}>(EUR only)</Text>}
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.paymentOption, !canUseQR && styles.paymentOptionDisabled]}
              onPress={() => handlePayment('qr')}
              disabled={!canUseQR}
            >
              <Smartphone size={32} color={canUseQR ? "#9C27B0" : "#999"} />
              <Text style={[styles.paymentOptionText, !canUseQR && styles.paymentOptionTextDisabled]}>QR Code</Text>
              {!canUseQR && <Text style={styles.disabledReasonText}>({settings.currency} only)</Text>}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Success Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showSuccess}
        onRequestClose={() => setShowSuccess(false)}
      >
        <View style={styles.successOverlay}>
          <View style={styles.successModal}>
            <View style={styles.successIcon}>
              <Check size={48} color="#fff" />
            </View>
            <Text style={styles.successText}>Transaction Complete!</Text>
          </View>
        </View>
      </Modal>

      {/* Total Edit Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showTotalModal}
        onRequestClose={() => setShowTotalModal(false)}
      >
        <KeyboardAvoidingView 
          style={styles.modalOverlay} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowTotalModal(false)}>
            <View style={styles.totalModal}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Edit Total</Text>
                <TouchableOpacity onPress={() => setShowTotalModal(false)}>
                  <X size={24} color="#666" />
                </TouchableOpacity>
              </View>
              
              <Text style={styles.totalDescription}>Override the final total amount</Text>
              
              <View style={styles.totalInputContainer}>
                <Text style={styles.currencySymbol}>{currencyConfig.symbol}</Text>
                <TextInput
                  style={styles.totalInput}
                  value={editTotal}
                  onChangeText={setEditTotal}
                  keyboardType="numeric"
                  placeholder="0.00"
                  selectTextOnFocus
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleSaveTotal}
                  blurOnSubmit={true}
                />
              </View>
              
              <View style={styles.modalActions}>
                {overrideTotal !== undefined && (
                  <TouchableOpacity style={styles.modalClearButton} onPress={handleClearTotalOverride}>
                    <Text style={styles.modalClearButtonText}>Reset to Calculated</Text>
                  </TouchableOpacity>
                )}
                
                <TouchableOpacity style={styles.saveButton} onPress={handleSaveTotal}>
                  <Check size={20} color="#fff" />
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
      

    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  keyboardSpacer: {
    height: 120,
  },

  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  totalsContainer: {
    flexDirection: 'row',
  },
  currencySelector: {
    flexDirection: 'column',
    justifyContent: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 12,
    backgroundColor: '#fff',
    gap: 8,
  },
  subtotalsScrollView: {
    maxHeight: 108,
  },
  currencyButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
  },
  currencyButtonActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  currencyText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  currencyTextActive: {
    color: 'white',
  },

  itemsList: {
    padding: 16,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemName: {
    flex: 1,
    fontSize: 16,
  },
  itemQuantity: {
    fontSize: 16,
    color: '#666',
    marginRight: 16,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: '600',
  },
  greyedOut: {
    color: '#999',
    opacity: 0.6,
  },
  greyedOutText: {
    color: '#999',
    opacity: 0.5,
  },
  specialPriceContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  specialPriceInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'right',
    minWidth: 80,
    backgroundColor: '#fff',
  },
  totals: {
    flex: 1,
    padding: 12,
    paddingBottom: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingVertical: 4,
  },
  totalLabel: {
    fontSize: 16,
    color: '#666',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  subtotalLabel: {
    fontSize: 17,
    fontWeight: '500',
  },
  subtotalValue: {
    fontSize: 17,
    fontWeight: '700',
  },
  subtotalRow: {
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  discountLabel: {
    fontSize: 16,
    color: '#4CAF50',
  },
  discountValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4CAF50',
  },
  promoLabel: {
    fontSize: 14,
    color: '#4CAF50',
  },
  promoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  finalTotal: {
    marginTop: 4,
    paddingTop: 4,
    marginBottom: 0,
  },
  finalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  finalValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  actions: {
    flexDirection: 'row',
    padding: 8,
    paddingBottom: 4,
    gap: 12,
  },
  clearButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#f44336',
    alignItems: 'center',
  },
  clearButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  payButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
  },
  payButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  buttonDisabled: {
    opacity: 0.5,
    backgroundColor: '#ccc',
  },
  emailSection: {
    paddingHorizontal: 12,
    paddingBottom: 4,
  },
  emailInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  emailIcon: {
    marginRight: 8,
  },
  emailInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  paymentTotal: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 24,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    marginBottom: 12,
  },
  paymentOptionText: {
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 16,
  },
  successOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  successModal: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  successText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  overrideTotal: {
    color: '#ff6b35',
  },
  overrideIndicator: {
    fontSize: 12,
    color: '#ff6b35',
    textAlign: 'center',
    marginTop: -4,
  },
  totalModal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    minWidth: 300,
    maxWidth: 400,
    marginHorizontal: 20,
  },
  totalDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
  },
  totalInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#4CAF50',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  currencySymbol: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginRight: 8,
  },
  totalInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    paddingVertical: 12,
    color: '#333',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalClearButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f44336',
    alignItems: 'center',
  },
  modalClearButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  editablePrice: {
    color: '#4CAF50',
    textDecorationLine: 'underline',
  },
  paymentOptionDisabled: {
    backgroundColor: '#f0f0f0',
    opacity: 0.6,
  },
  paymentOptionTextDisabled: {
    color: '#999',
  },
  disabledReasonText: {
    fontSize: 12,
    color: '#999',
    marginLeft: 8,
    fontStyle: 'italic',
  },
  disabledText: {
    color: '#ccc',
  },
});