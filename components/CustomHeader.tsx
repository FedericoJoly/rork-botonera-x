import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Currency } from '@/types/sales';
import { CURRENCIES } from '@/constants/products';
import { useSales } from '@/hooks/sales-store';
import { useAuth } from '@/hooks/auth-store';
import Colors from '@/constants/colors';

interface CustomHeaderProps {
  eventName?: string;
  userName?: string;
  currency?: Currency;
}

export default function CustomHeader({ 
  eventName = 'Default Event', 
  userName = 'User', 
  currency = 'EUR' 
}: CustomHeaderProps) {
  const { settings } = useSales();
  const { currentEvent, currentUser } = useAuth();
  const insets = useSafeAreaInsets();
  
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.column}>
        <Text style={styles.value}>{currentEvent?.eventName || eventName}</Text>
      </View>
      
      <View style={styles.column}>
        <Text style={styles.value}>{currentUser?.fullName || settings.userName || userName}</Text>
      </View>
      
      <View style={styles.column}>
        <Text style={styles.value}>
          {CURRENCIES[settings.currency].symbol} {settings.currency}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.light.headerBackground,
    paddingHorizontal: 16,
    paddingVertical: 2,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
  },
});