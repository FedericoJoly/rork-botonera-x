import React, { useRef, useEffect, useState } from 'react';
import { StyleSheet, View, FlatList, Platform, Text, ScrollView, Dimensions, ActivityIndicator, KeyboardAvoidingView, Keyboard } from 'react-native';
import { useSales } from '@/hooks/sales-store';
import { useAuth } from '@/hooks/auth-store';
import { databaseService } from '@/hooks/database';
import ProductRow from '@/components/ProductButton';
import CartSummary from '@/components/CartSummary';
import CustomHeader from '@/components/CustomHeader';
import { Product } from '@/types/sales';
import Colors from '@/constants/colors';
import { router } from 'expo-router';

const { width: screenWidth } = Dimensions.get('window');

export default function SalesScreen() {
  const { addToCart, removeFromCart, getItemQuantity, getEnabledProducts, settings, displayCurrency, forceLoadBackupProducts, products, productTypes, currentEventId, loadEventData } = useSales();
  const { currentEvent } = useAuth();
  
  const [isLocked, setIsLocked] = React.useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  
  React.useEffect(() => {
    const checkLockStatus = async () => {
      if (!currentEventId) {
        setIsLocked(false);
        return;
      }
      
      const eventData = await databaseService.loadEventData(currentEventId);
      const locked = !!eventData?.event.templatePin;
      setIsLocked(locked);
      
      console.log('🔐 Panel: Lock status check:', {
        hasCurrentEvent: !!currentEvent,
        eventId: currentEvent?.id,
        eventName: currentEvent?.eventName,
        templatePin: eventData?.event.templatePin,
        isLocked: locked
      });
    };
    
    checkLockStatus();
  }, [currentEvent, currentEventId]);
  const [isInitializing, setIsInitializing] = React.useState(true);
  
  const enabledProducts = getEnabledProducts();
  const scrollViewRef = useRef<ScrollView>(null);
  
  useEffect(() => {
    const initializeEvent = async () => {
      console.log('🔍 Panel: Checking event initialization...');
      console.log('🔍 Panel: currentEventId in sales store:', currentEventId);
      console.log('🔍 Panel: currentEvent in auth store:', currentEvent?.id, currentEvent?.eventName);
      
      if (!currentEventId && currentEvent) {
        console.log('⚠️ Panel: Event not loaded in sales store, loading now...');
        const success = await loadEventData(currentEvent.id);
        if (success) {
          console.log('✅ Panel: Event loaded successfully');
        } else {
          console.error('❌ Panel: Failed to load event');
        }
      } else if (!currentEventId && !currentEvent) {
        console.error('❌ Panel: No event selected, redirecting to event manager...');
        router.replace('/event-manager');
        return;
      } else {
        console.log('✅ Panel: Event already loaded');
      }
      
      setIsInitializing(false);
    };
    
    initializeEvent();
  }, [currentEventId, currentEvent, loadEventData]);
  
  useEffect(() => {
    const keyboardWillShow = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e) => {
        setKeyboardVisible(true);
        setKeyboardHeight(e.endCoordinates.height);
      }
    );

    const keyboardWillHide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        setKeyboardVisible(false);
        setKeyboardHeight(0);
      }
    );

    return () => {
      keyboardWillShow.remove();
      keyboardWillHide.remove();
    };
  }, []);

  React.useEffect(() => {
    const checkProducts = async () => {
      console.log('🔍 Registry: Checking products...', products.length);
      
      if (products.length === 0 && settings.isSetupComplete) {
        console.log('🆘 Registry: Setup is complete but no products found! Attempting restore...');
        const result = await forceLoadBackupProducts();
        if (result.success) {
          console.log(`✅ Registry: Restore successful! ${result.count} products restored.`);
        } else {
          console.log('⚠️ Registry: No products in database. Please add products in Setup tab.');
        }
      } else if (products.length === 0) {
        console.log('ℹ️ Registry: No products yet. Complete setup in the Setup tab.');
      } else {
        console.log(`✅ Registry: ${products.length} products available`);
        const magicStuffType = productTypes.find(t => t.name === 'Magic Stuff');
        const magicProType = productTypes.find(t => t.name === 'MagicPro Ideas');
        const magicStuffCount = magicStuffType ? products.filter(p => p.typeId === magicStuffType.id).length : 0;
        const magicProCount = magicProType ? products.filter(p => p.typeId === magicProType.id).length : 0;
        console.log(`🎯 Registry: Magic Stuff: ${magicStuffCount}, MagicPro Ideas: ${magicProCount}`);
      }
    };
    
    checkProducts();
  }, [products.length, settings.isSetupComplete, forceLoadBackupProducts, products, productTypes]);
  
  const sortedProductTypes = [...productTypes].filter(t => t.enabled).sort((a, b) => a.order - b.order);
  
  const groupedProducts = sortedProductTypes.map(type => ({
    name: type.name,
    products: enabledProducts.filter(p => p.typeId === type.id)
  }));

  const renderHeader = () => (
    <View style={styles.headerRow}>
      <View style={styles.nameColumn}>
        <Text style={styles.headerText}>Product</Text>
      </View>
      <View style={styles.priceColumn}>
        <Text style={styles.headerText}>Price</Text>
      </View>
      <View style={styles.quantityColumn}>
        <Text style={styles.headerText}>Qty</Text>
      </View>
      <View style={styles.totalColumn}>
        <Text style={styles.headerText}>Total</Text>
      </View>
      <View style={styles.buttonsColumn}>
        <Text style={styles.headerText}>Actions</Text>
      </View>
    </View>
  );

  if (isInitializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading event...</Text>
      </View>
    );
  }

  const renderProductList = (products: Product[], typeName: string) => (
    <View style={styles.productListContainer}>
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        stickyHeaderIndices={[0]}
        renderItem={({ item }) => (
          <ProductRow
            product={item}
            quantity={getItemQuantity(item.id)}
            displayCurrency={displayCurrency}
            mainCurrency={settings.currency}
            onAdd={() => addToCart(item.id)}
            onRemove={() => removeFromCart(item.id)}
          />
        )}
        showsVerticalScrollIndicator={true}
        getItemLayout={(data, index) => ({
          length: 52,
          offset: 52 * index + 44,
          index,
        })}
        initialNumToRender={5}
        maxToRenderPerBatch={5}
        windowSize={5}
      />
    </View>
  );

  const productsSectionHeight = keyboardVisible ? Math.max(150, 408 - keyboardHeight + 100) : 408;

  return (
    <View style={styles.container}>
      <CustomHeader 
        eventName={settings.eventName || 'Event'}
        userName={settings.userName || 'User'}
        currency={settings.currency} 
      />
      {isLocked && (
        <View style={styles.lockedBanner}>
          <Text style={styles.lockedBannerText}>🔒 READ-ONLY EVENT - Changes are blocked</Text>
        </View>
      )}
      
      <KeyboardAvoidingView 
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={[styles.productsSection, { height: productsSectionHeight }]}>
          <ScrollView
            ref={scrollViewRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
          >
            {groupedProducts.map((type, index) => (
              <View key={type.name} style={styles.productTypeContainer}>
                {renderProductList(type.products, type.name)}
              </View>
            ))}
          </ScrollView>
        </View>
        
        <View style={styles.cartSection}>
          <CartSummary />
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: Platform.select({ web: 'row', default: 'column' }),
    backgroundColor: '#f5f5f5',
  },

  keyboardContainer: {
    flex: 1,
  },
  productsSection: {
    backgroundColor: '#fff',
  },
  productTypeContainer: {
    width: screenWidth,
  },
  productListContainer: {
    flex: 1,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#f8f9fa',
    borderBottomWidth: 2,
    borderBottomColor: '#e9ecef',
  },
  nameColumn: {
    flex: 1.8,
    paddingRight: 8,
  },
  priceColumn: {
    flex: 1.5,
    alignItems: 'center',
  },
  quantityColumn: {
    flex: 0.8,
    alignItems: 'center',
  },
  totalColumn: {
    flex: 1.1,
    alignItems: 'center',
  },
  buttonsColumn: {
    flex: 1.2,
    alignItems: 'center',
  },
  headerText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#495057',
    textTransform: 'uppercase',
  },
  cartSection: {
    flex: 1,
    minWidth: Platform.select({ web: 320, default: undefined }),
    maxWidth: Platform.select({ web: 400, default: undefined }),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  lockedBanner: {
    backgroundColor: '#FFF3CD',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#FF9500',
  },
  lockedBannerText: {
    fontSize: 13,
    color: '#856404',
    fontWeight: '600',
    textAlign: 'center',
  },
});
