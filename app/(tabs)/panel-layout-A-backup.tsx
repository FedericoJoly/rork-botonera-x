import React, { useRef } from 'react';
import { StyleSheet, View, FlatList, Platform, Text, ScrollView, Dimensions } from 'react-native';
import { useSales } from '@/hooks/sales-store';
import ProductRow from '@/components/ProductButton';
import CartSummary from '@/components/CartSummary';
import CustomHeader from '@/components/CustomHeader';
import { Product } from '@/types/sales';

const { width: screenWidth } = Dimensions.get('window');

export default function SalesScreen() {
  const { addToCart, removeFromCart, getItemQuantity, getEnabledProducts, settings, displayCurrency, forceLoadBackupProducts, products, productTypes } = useSales();
  
  const enabledProducts = getEnabledProducts();
  const scrollViewRef = useRef<ScrollView>(null);
  
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

  return (
    <View style={styles.container}>
      <CustomHeader 
        eventName={settings.eventName || 'Event'}
        userName={settings.userName || 'User'}
        currency={settings.currency} 
      />
      
      <View style={styles.productsSection}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: Platform.select({ web: 'row', default: 'column' }),
    backgroundColor: '#f5f5f5',
  },

  productsSection: {
    height: 356,
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

});
