import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, TextInput, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { CreditCard, Smartphone, Banknote, ChevronDown, ChevronRight, Mail, Trash2 } from 'lucide-react-native';
import { Transaction } from '@/types/sales';
import { CURRENCIES } from '@/constants/products';

interface TransactionItemProps {
  transaction: Transaction;
  onDelete?: (transactionId: string) => void;
  onUpdate?: (transactionId: string, updates: Partial<Transaction>) => void;
  isLocked?: boolean;
}

export default function TransactionItem({ transaction, onDelete, onUpdate, isLocked = false }: TransactionItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [editedEmail, setEditedEmail] = useState(transaction.email || '');
  
  // For display purposes, use original currency if available, otherwise use transaction currency
  const displayCurrency = transaction.originalCurrency || transaction.currency;
  const currencyConfig = CURRENCIES[displayCurrency];
  
  // Use original totals if available (for converted transactions), otherwise use stored totals
  const displayTotal = transaction.originalTotal || transaction.total;
  
  const time = new Date(transaction.timestamp).toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
  
  const getPaymentIcon = () => {
    switch (transaction.paymentMethod) {
      case 'cash':
        return <Banknote size={20} color="#4CAF50" />;
      case 'card':
        return <CreditCard size={20} color="#2196F3" />;
      case 'qr':
        return <Smartphone size={20} color="#9C27B0" />;
    }
  };

  const itemCount = transaction.items.reduce((sum, item) => sum + item.quantity, 0);

  const handleDelete = () => {
    Alert.alert(
      'Delete Transaction',
      'Are you sure you want to delete this transaction? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => onDelete?.(transaction.id)
        }
      ]
    );
  };

  const handleCopyEmail = async () => {
    if (transaction.email) {
      await Clipboard.setStringAsync(transaction.email);
      Alert.alert('Copied', 'Email copied to clipboard');
    }
  };

  const handleEditEmail = () => {
    setIsEditingEmail(true);
  };

  const handleSaveEmail = () => {
    const trimmedEmail = editedEmail.trim();
    if (trimmedEmail !== transaction.email) {
      onUpdate?.(transaction.id, { email: trimmedEmail || undefined });
    }
    setIsEditingEmail(false);
  };

  const handleCancelEdit = () => {
    setEditedEmail(transaction.email || '');
    setIsEditingEmail(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <TouchableOpacity 
          style={styles.header} 
          onPress={() => setIsExpanded(!isExpanded)}
          activeOpacity={0.7}
        >
          <View style={styles.timeContainer}>
            <Text style={styles.time}>{time}</Text>
            {getPaymentIcon()}
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.total}>
              {currencyConfig.symbol}{displayTotal.toFixed(2)}
            </Text>
            {isExpanded ? (
              <ChevronDown size={20} color="#666" />
            ) : (
              <ChevronRight size={20} color="#666" />
            )}
          </View>
        </TouchableOpacity>
        {onDelete && (
          <TouchableOpacity 
            style={[styles.deleteButton, isLocked && styles.deleteButtonDisabled]}
            onPress={handleDelete}
            activeOpacity={0.7}
            disabled={isLocked}
          >
            <Trash2 size={20} color={isLocked ? "#CCC" : "#FF3B30"} />
          </TouchableOpacity>
        )}
      </View>
      
      <View style={styles.details}>
        <Text style={styles.items}>
          {itemCount} item{itemCount !== 1 ? 's' : ''}
        </Text>
        {transaction.discount > 0 && (
          <Text style={styles.discount}>
            Saved {currencyConfig.symbol}{(transaction.originalCurrency ? (transaction.discount * (displayTotal / transaction.total)) : transaction.discount).toFixed(2)}
          </Text>
        )}
      </View>
      
      {transaction.appliedPromotions.length > 0 && (
        <Text style={styles.promotions}>
          {transaction.appliedPromotions.join(', ')}
        </Text>
      )}
      
      {(transaction.email || isEditingEmail) && (
        <View style={styles.emailContainer}>
          <Mail size={14} color="#666" />
          {isEditingEmail ? (
            <View style={styles.emailEditContainer}>
              <TextInput
                style={styles.emailInput}
                value={editedEmail}
                onChangeText={setEditedEmail}
                placeholder="Enter email"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
              <TouchableOpacity onPress={handleSaveEmail} style={styles.emailSaveButton}>
                <Text style={styles.emailSaveText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCancelEdit} style={styles.emailCancelButton}>
                <Text style={styles.emailCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Pressable
              style={styles.emailPressable}
              onPress={handleEditEmail}
              onLongPress={handleCopyEmail}
              delayLongPress={500}
            >
              <Text style={styles.emailText}>{transaction.email}</Text>
            </Pressable>
          )}
        </View>
      )}
      
      {isExpanded && (
        <View style={styles.itemsList}>
          <View style={styles.divider} />
          {transaction.items.map((item, index) => {
            // The item.product.price already contains the proportionally adjusted price
            // from the completeTransaction function, so we just need to convert it if necessary
            let displayPrice = item.product.price;
            
            // If this transaction was converted to EUR, convert the item price back to original currency
            if (transaction.originalCurrency && transaction.originalCurrency !== transaction.currency) {
              // Convert from EUR to original currency using the currency rates
              const fromRate = CURRENCIES[transaction.currency].rate; // EUR rate
              const toRate = CURRENCIES[transaction.originalCurrency].rate; // Original currency rate
              displayPrice = item.product.price * (toRate / fromRate);
            }
            
            const itemTotal = displayPrice * item.quantity;
            
            return (
              <View key={`${item.product.id}-${index}`} style={styles.itemRow}>
                <View style={styles.itemInfo}>
                  <View style={[styles.productDot, { backgroundColor: item.product.color }]} />
                  <Text style={styles.itemName}>{item.product.name}</Text>
                  <Text style={styles.itemQuantity}>×{item.quantity}</Text>
                </View>
                <Text style={styles.itemPrice}>
                  {currencyConfig.symbol}{itemTotal.toFixed(2)}
                </Text>
              </View>
            );
          })}
          
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total:</Text>
            <Text style={styles.totalValue}>
              {currencyConfig.symbol}{displayTotal.toFixed(2)}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  header: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deleteButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FFF0F0',
  },
  deleteButtonDisabled: {
    backgroundColor: '#F5F5F5',
    opacity: 0.5,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  time: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  total: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  details: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  items: {
    fontSize: 14,
    color: '#666',
  },
  discount: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  promotions: {
    fontSize: 12,
    color: '#9C27B0',
    marginTop: 4,
    fontStyle: 'italic',
  },
  itemsList: {
    marginTop: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginBottom: 12,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  itemInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  productDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
  },
  itemName: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  itemQuantity: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
    minWidth: 30,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginLeft: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  summaryValue: {
    fontSize: 14,
    color: '#333',
  },
  discountLabel: {
    color: '#4CAF50',
  },
  discountValue: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 8,
    marginTop: 4,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  emailContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  emailPressable: {
    flex: 1,
  },
  emailText: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
  },
  emailEditContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emailInput: {
    flex: 1,
    fontSize: 12,
    color: '#333',
    borderWidth: 1,
    borderColor: '#4CAF50',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#fff',
  },
  emailSaveButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#4CAF50',
    borderRadius: 6,
  },
  emailSaveText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
  emailCancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  emailCancelText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
});