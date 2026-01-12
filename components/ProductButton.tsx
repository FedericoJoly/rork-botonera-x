import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, TextInput, Modal, Pressable } from 'react-native';
import { Minus, Plus, X, Check } from 'lucide-react-native';
import { Product, Currency } from '@/types/sales';
import { CURRENCIES } from '@/constants/products';
import { useSales } from '@/hooks/sales-store';

interface ProductRowProps {
  product: Product;
  quantity: number;
  displayCurrency: string;
  mainCurrency: string;
  onAdd: () => void;
  onRemove: () => void;
}

export default function ProductRow({ product, quantity, displayCurrency, mainCurrency, onAdd, onRemove }: ProductRowProps) {
  const { cart, updateCartItemPrice, clearCartItemPriceOverride, settings, getEffectiveRate, getProductTypeById } = useSales();
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [editPrice, setEditPrice] = useState('');
  
  const displayCurrencyConfig = CURRENCIES[displayCurrency];
  const mainCurrencyRate = getEffectiveRate(mainCurrency as Currency);
  const displayCurrencyRate = getEffectiveRate(displayCurrency as Currency);
  const conversionRate = displayCurrency === mainCurrency ? 1 : displayCurrencyRate / mainCurrencyRate;
  
  // Get cart item to check for price override
  const cartItem = cart.find(item => item.product.id === product.id);
  const hasOverride = cartItem?.overridePrice !== undefined;
  const effectivePrice = hasOverride ? cartItem!.overridePrice! : product.price;
  
  // Convert price to display currency if different from main currency
  let displayPrice = effectivePrice * conversionRate;
  
  // Apply currency round-up if enabled and we're converting currencies
  if (settings.currencyRoundUp && displayCurrency !== mainCurrency) {
    displayPrice = Math.ceil(displayPrice);
  }
  
  const productTotal = displayPrice * quantity;
  
  const handlePriceDoublePress = () => {
    if (quantity > 0) {
      setEditPrice(displayPrice.toFixed(2));
      setShowPriceModal(true);
    }
  };
  
  const handleSavePrice = () => {
    const newPrice = parseFloat(editPrice);
    if (!isNaN(newPrice) && newPrice > 0) {
      // Convert back to main currency if needed
      const priceInMainCurrency = displayCurrency === mainCurrency ? newPrice : newPrice / conversionRate;
      updateCartItemPrice(product.id, priceInMainCurrency);
    }
    setShowPriceModal(false);
  };
  
  const handleClearOverride = () => {
    clearCartItemPriceOverride(product.id);
    setShowPriceModal(false);
  };

  // Get background color based on product type
  const getBackgroundColor = () => {
    const productType = getProductTypeById(product.typeId);
    if (productType) {
      return productType.color;
    }
    return '#fff'; // Default white
  };

  return (
    <View style={[styles.container, { backgroundColor: getBackgroundColor() }]}>
      {/* Product Name */}
      <View style={styles.nameColumn}>
        <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
      </View>
      
      {/* Unit Price */}
      <View style={styles.priceColumn}>
        <TouchableOpacity onPress={handlePriceDoublePress} disabled={quantity === 0}>
          <Text style={[styles.price, hasOverride && styles.overridePrice]}>
            {displayCurrencyConfig.symbol}{settings.currencyRoundUp && displayCurrency !== mainCurrency ? displayPrice.toFixed(0) : displayPrice.toFixed(2)}
          </Text>
          {hasOverride && <Text style={styles.overrideIndicator}>*</Text>}
        </TouchableOpacity>
      </View>
      
      {/* Quantity */}
      <View style={styles.quantityColumn}>
        <Text style={styles.quantity}>{quantity}</Text>
      </View>
      
      {/* Product Total */}
      <View style={styles.totalColumn}>
        <Text style={styles.total}>
          {displayCurrencyConfig.symbol}{settings.currencyRoundUp && displayCurrency !== mainCurrency ? productTotal.toFixed(0) : productTotal.toFixed(2)}
        </Text>
      </View>
      
      {/* Add/Remove Buttons */}
      <View style={styles.buttonsColumn}>
        <TouchableOpacity 
          style={[styles.button, styles.removeButton]}
          onPress={onRemove}
          activeOpacity={0.7}
          disabled={quantity === 0}
        >
          <Minus size={16} color={quantity === 0 ? '#ccc' : '#fff'} />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, styles.addButton]}
          onPress={onAdd}
          activeOpacity={0.7}
        >
          <Plus size={16} color="#fff" />
        </TouchableOpacity>
      </View>
      
      {/* Price Edit Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showPriceModal}
        onRequestClose={() => setShowPriceModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowPriceModal(false)}>
          <View style={styles.priceModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Price</Text>
              <TouchableOpacity onPress={() => setShowPriceModal(false)}>
                <X size={24} color="#666" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.productName}>{product.name}</Text>
            
            <View style={styles.priceInputContainer}>
              <Text style={styles.currencySymbol}>{displayCurrencyConfig.symbol}</Text>
              <TextInput
                style={styles.priceInput}
                value={editPrice}
                onChangeText={setEditPrice}
                keyboardType="numeric"
                placeholder="0.00"
                selectTextOnFocus
                autoFocus
              />
            </View>
            
            <View style={styles.modalActions}>
              {hasOverride && (
                <TouchableOpacity style={styles.clearButton} onPress={handleClearOverride}>
                  <Text style={styles.clearButtonText}>Reset to Original</Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity style={styles.saveButton} onPress={handleSavePrice}>
                <Check size={20} color="#fff" />
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    minHeight: 52,
  },
  nameColumn: {
    flex: 1.8,
    paddingRight: 8,
  },
  priceColumn: {
    flex: 1.4,
    alignItems: 'center',
  },
  quantityColumn: {
    flex: 0.8,
    alignItems: 'center',
  },
  totalColumn: {
    flex: 1.4,
    alignItems: 'center',
  },
  buttonsColumn: {
    flex: 1.2,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  name: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  price: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  quantity: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  total: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  overridePrice: {
    color: '#ff6b35',
    fontWeight: 'bold',
  },
  overrideIndicator: {
    fontSize: 10,
    color: '#ff6b35',
    textAlign: 'center',
    marginTop: -2,
  },
  button: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    backgroundColor: '#4CAF50',
  },
  removeButton: {
    backgroundColor: '#f44336',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  priceModal: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    minWidth: 300,
    maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  productName: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
    textAlign: 'center',
  },
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#4CAF50',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginRight: 8,
  },
  priceInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    paddingVertical: 12,
    color: '#333',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  clearButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#f44336',
    alignItems: 'center',
  },
  clearButtonText: {
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
});