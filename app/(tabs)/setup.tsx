import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Switch,
  Platform,
  Modal,
  Dimensions,
  Pressable,
  KeyboardAvoidingView,
} from 'react-native';

import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Plus, Trash2, Save, ChevronUp, ChevronDown, RotateCcw, FileSpreadsheet, ChevronLeft, ChevronRight, Files, RefreshCw, Check, X, Palette, Download } from 'lucide-react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import { useSales } from '@/hooks/sales-store';
import { Product, Currency, AppSettings, Transaction, Promo, PromoMode } from '@/types/sales';
import { CURRENCIES } from '@/constants/products';
import Colors from '@/constants/colors';
import { useNavigationBlocker } from '@/hooks/navigation-blocker';
import { useAuth } from '@/hooks/auth-store';
import { createAndExportSpreadsheet } from '@/hooks/google-sheets-export';
import { databaseService } from '@/hooks/database';


const { width: screenWidth } = Dimensions.get('window');



export default function SetupScreen() {
  const {
    settings,
    products,
    transactions,
    updateSettings,
    addProduct,
    updateProduct,
    deleteProduct,
    saveAllData,
    clearPanelData,
    reorderProducts,
    debugStoredData,
    exchangeRates,
    fetchExchangeRates,
    isLoadingRates,
    updateCustomRate,
    clearCustomRates,
    getEffectiveRate,
    isLoading,
    productTypes,
    addProductType,
    updateProductType,
    deleteProductType,
    reorderProductTypes,
    currentEventId,
    promos,
    addPromo,
    updatePromo,
    deletePromo,
    reorderPromos,
  } = useSales();

  const sortedProducts = [...products].sort((a, b) => a.order - b.order);

  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const newProductNameRef = useRef<TextInput>(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promo | null>(null);
  const [showAddPromo, setShowAddPromo] = useState(false);
  const [newPromo, setNewPromo] = useState<{
    name: string;
    mode: PromoMode;
    typeId: string;
    maxQuantity: string;
    prices: { [quantity: number]: number };
    incrementalPrice: string;
    incrementalPrice10Plus: string;
    comboProductIds: string[];
    comboPrice: string;
    comboTypeFilter: string;
  }>({
    name: '',
    mode: 'type_list',
    typeId: productTypes.length > 0 ? productTypes[0].id : '',
    maxQuantity: '7',
    prices: {},
    incrementalPrice: '',
    incrementalPrice10Plus: '',
    comboProductIds: [],
    comboPrice: '',
    comboTypeFilter: 'all',
  });
  const [currentSection, setCurrentSection] = useState(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const [editingRate, setEditingRate] = useState<Currency | null>(null);
  const [editingRateValue, setEditingRateValue] = useState<string>('');
  const [lastTapTime, setLastTapTime] = useState<{ [key: string]: number }>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const { enableBlocking, disableBlocking } = useNavigationBlocker();
  const { clearCurrentEvent, currentEvent, currentUser } = useAuth();

  const [isLocked, setIsLocked] = useState(false);
  
  const checkLockStatus = useCallback(async () => {
    console.log('🔐 Setup: Starting lock status check...');
    console.log('🔐 currentEventId:', currentEventId);
    
    if (!currentEventId) {
      console.log('🔐 No currentEventId, setting isLocked = false');
      setIsLocked(false);
      return;
    }
    
    try {
      console.log(`🔐 Loading FRESH event data DIRECTLY from database for event ${currentEventId}...`);
      const eventData = await databaseService.loadEventData(currentEventId);
      console.log('🔐 Event data loaded:', eventData?.event);
      console.log('🔐 Event templatePin:', eventData?.event.templatePin);
      console.log('🔐 Event isTemplate:', eventData?.event.isTemplate);
      
      const locked = !!eventData?.event.templatePin;
      console.log('🔐 Computed locked status:', locked);
      
      setIsLocked(locked);
      console.log('🔐 isLocked state set to:', locked);
      
      console.log('🔐 Setup: Lock status check complete:', {
        currentEventId,
        templatePin: eventData?.event.templatePin,
        isTemplate: eventData?.event.isTemplate,
        isLocked: locked
      });
    } catch (error) {
      console.error('🔐 Error checking lock status:', error);
      setIsLocked(false);
    }
  }, [currentEventId]);
  
  useEffect(() => {
    checkLockStatus();
  }, [checkLockStatus]);
  
  useFocusEffect(
    useCallback(() => {
      console.log('🔄 Setup screen focused - rechecking lock status');
      checkLockStatus();
    }, [checkLockStatus])
  );
  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFileName, setExportFileName] = useState('');

  const [newProduct, setNewProduct] = useState({
    name: '',
    price: '',
    color: '#007AFF',
    enabled: true,
    initialQuantity: 0,
    promoEligible: true,
    typeId: productTypes.length > 0 ? productTypes[0].id : 'type_1',
    subgroup: '',
  });

  // Track initial state for comparison
  const [initialSettings, setInitialSettings] = useState<AppSettings>(settings);
  const [initialProducts, setInitialProducts] = useState<Product[]>(products);
  const [initialProductTypes, setInitialProductTypes] = useState<import('@/types/sales').ProductType[]>(productTypes);
  const [initialTransactions, setInitialTransactions] = useState<Transaction[]>(transactions);
  const lastSnapshotEventId = useRef<string | null>(null);

  // Update initial state when event is loaded
  // Use ref to ensure we only snapshot once per event, even if data updates trigger re-renders
  useEffect(() => {
    if (!isLoading && currentEventId && lastSnapshotEventId.current !== currentEventId) {
      console.log('📸 Setup: Taking snapshot of initial state for event:', currentEventId);
      console.log('📊 Snapshot data:', { 
        products: products.length, 
        types: productTypes.length, 
        transactions: transactions.length 
      });
      setInitialSettings(settings);
      setInitialProducts(products);
      setInitialProductTypes(productTypes);
      setInitialTransactions(transactions);
      setHasUnsavedChanges(false);
      lastSnapshotEventId.current = currentEventId;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, currentEventId]);

  // Detect changes in settings, products, product types, or transactions
  useEffect(() => {
    if (isLoading) return;

    const settingsChanged = JSON.stringify(settings) !== JSON.stringify(initialSettings);
    const productsChanged = JSON.stringify(products) !== JSON.stringify(initialProducts);
    const productTypesChanged = JSON.stringify(productTypes) !== JSON.stringify(initialProductTypes);
    const transactionsChanged = JSON.stringify(transactions) !== JSON.stringify(initialTransactions);

    setHasUnsavedChanges(settingsChanged || productsChanged || productTypesChanged || transactionsChanged);
  }, [settings, products, productTypes, transactions, initialSettings, initialProducts, initialProductTypes, initialTransactions, isLoading]);

  // Enable/disable navigation blocking based on unsaved changes
  useEffect(() => {
    if (hasUnsavedChanges) {
      console.log('🔒 Setup: Enabling navigation blocking');
      enableBlocking(async () => {
        console.log('💾 Setup: Saving from navigation blocker');
        const success = await saveAllData();
        if (success) {
          await debugStoredData();
          setInitialSettings(settings);
          setInitialProducts(products);
          setInitialProductTypes(productTypes);
          setInitialTransactions(transactions);
          setHasUnsavedChanges(false);
        }
      });
    } else {
      console.log('🔓 Setup: Disabling navigation blocking');
      disableBlocking();
    }

    return () => {
      disableBlocking();
    };
  }, [hasUnsavedChanges, enableBlocking, disableBlocking, saveAllData, debugStoredData, settings, products, productTypes, transactions]);

  const handleAddProduct = () => {
    if (isLocked) {
      Alert.alert('Read-Only Event', 'This is a read-only event. Changes cannot be made.');
      return;
    }
    if (!newProduct.name.trim() || !newProduct.price) {
      Alert.alert('Error', 'Please fill in product name and price');
      return;
    }

    // If this is a duplicate, insert after the source order
    if (duplicateSourceOrder !== null) {
      addProduct({
        name: newProduct.name.trim(),
        price: parseFloat(newProduct.price),
        color: newProduct.color,
        enabled: newProduct.enabled,
        initialQuantity: newProduct.initialQuantity,
        promoEligible: newProduct.promoEligible,
        typeId: newProduct.typeId,
        subgroup: newProduct.subgroup.trim() || undefined,
        order: 0, // This will be overridden by the addProduct function
      }, duplicateSourceOrder); // Insert after the source product
      setDuplicateSourceOrder(null); // Reset
    } else {
      addProduct({
        name: newProduct.name.trim(),
        price: parseFloat(newProduct.price),
        color: newProduct.color,
        enabled: newProduct.enabled,
        initialQuantity: newProduct.initialQuantity,
        promoEligible: newProduct.promoEligible,
        typeId: newProduct.typeId,
        subgroup: newProduct.subgroup.trim() || undefined,
        order: 0, // This will be overridden by the addProduct function
      });
    }

    setNewProduct({
      name: '',
      price: '',
      color: '#007AFF',
      enabled: true,
      initialQuantity: 0,
      promoEligible: true,
      typeId: productTypes.length > 0 ? productTypes[0].id : 'type_1',
      subgroup: '',
    });
    setShowAddProduct(false);
    
    // Focus on the new product name field when adding another product
    setTimeout(() => {
      if (newProductNameRef.current) {
        newProductNameRef.current.focus();
      }
    }, 100);
  };

  const handleShowAddProduct = () => {
    setShowAddProduct(true);
    // Focus on the product name field when showing the form
    setTimeout(() => {
      if (newProductNameRef.current) {
        newProductNameRef.current.focus();
      }
    }, 100);
  };

  const handleUpdateProduct = (product: Product, updates: Partial<Product>) => {
    if (isLocked) {
      Alert.alert('Read-Only Event', 'This is a read-only event.');
      return;
    }
    updateProduct(product.id, updates);
  };

  const handleEditProduct = (product: Product) => {
    if (isLocked) {
      Alert.alert('Read-Only Event', 'This is a read-only event.');
      return;
    }
    setEditingProduct(product);
    setNewProduct({
      name: product.name,
      price: product.price.toString(),
      color: product.color,
      enabled: product.enabled,
      initialQuantity: product.initialQuantity,
      promoEligible: product.promoEligible,
      typeId: product.typeId,
      subgroup: product.subgroup || '',
    });
    setShowAddProduct(true);
  };

  const [duplicateSourceOrder, setDuplicateSourceOrder] = useState<number | null>(null);

  const handleDuplicateProduct = (product: Product) => {
    if (isLocked) {
      Alert.alert('Read-Only Event', 'This is a read-only event.');
      return;
    }
    setEditingProduct(null); // Not editing, creating new
    setDuplicateSourceOrder(product.order); // Remember where to insert
    setNewProduct({
      name: `${product.name} (Copy)`,
      price: product.price.toString(),
      color: product.color,
      enabled: product.enabled,
      initialQuantity: product.initialQuantity,
      promoEligible: product.promoEligible,
      typeId: product.typeId,
      subgroup: product.subgroup || '',
    });
    setShowAddProduct(true);
    // Focus on the product name field when showing the form
    setTimeout(() => {
      if (newProductNameRef.current) {
        newProductNameRef.current.focus();
      }
    }, 100);
  };

  const handleSaveEditedProduct = () => {
    if (!editingProduct || !newProduct.name.trim() || !newProduct.price) {
      Alert.alert('Error', 'Please fill in product name and price');
      return;
    }

    updateProduct(editingProduct.id, {
      name: newProduct.name.trim(),
      price: parseFloat(newProduct.price),
      color: newProduct.color,
      enabled: newProduct.enabled,
      initialQuantity: newProduct.initialQuantity,
      promoEligible: newProduct.promoEligible,
      typeId: newProduct.typeId,
      subgroup: newProduct.subgroup.trim() || undefined,
    });

    setNewProduct({
      name: '',
      price: '',
      color: '#007AFF',
      enabled: true,
      initialQuantity: 0,
      promoEligible: true,
      typeId: productTypes.length > 0 ? productTypes[0].id : 'type_1',
      subgroup: '',
    });
    setShowAddProduct(false);
    setEditingProduct(null);
  };

  const handleCancelEdit = () => {
    setNewProduct({
      name: '',
      price: '',
      color: '#007AFF',
      enabled: true,
      initialQuantity: 0,
      promoEligible: true,
      typeId: productTypes.length > 0 ? productTypes[0].id : 'type_1',
      subgroup: '',
    });
    setShowAddProduct(false);
    setEditingProduct(null);
    setDuplicateSourceOrder(null); // Reset duplicate source
  };

  const handleDeleteProduct = (productId: string) => {
    if (isLocked) {
      Alert.alert('Read-Only Event', 'This is a read-only event.');
      return;
    }
    Alert.alert(
      'Delete Product',
      'Are you sure you want to delete this product?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteProduct(productId) },
      ]
    );
  };

  const handleSave = async () => {
    if (!currentEventId) {
      Alert.alert('Error', 'No event loaded. Please create or load an event first.');
      return false;
    }
    
    const eventData = await databaseService.loadEventData(currentEventId);
    if (eventData?.event.templatePin) {
      Alert.alert('Read-Only Event', 'This is a read-only event. Changes cannot be saved.');
      return false;
    }
    
    if (!currentEvent) {
      Alert.alert('Error', 'No event loaded. Please create or load an event first.');
      return false;
    }
    
    console.log('💾 SAVE BUTTON CLICKED');
    console.log(`📦 Saving to event: ${currentEvent.eventName} (ID: ${currentEvent.id})`);
    console.log(`📦 Current products in memory: ${products.length}`);
    console.log(`📦 Current transactions in memory: ${transactions.length}`);
    
    const success = await saveAllData();
    if (success) {
      await debugStoredData();
      
      setInitialSettings(settings);
      setInitialProducts(products);
      setInitialProductTypes(productTypes);
      setInitialTransactions(transactions);
      setHasUnsavedChanges(false);
      
      Alert.alert('Success', `Event saved successfully!\n\n${products.length} products\n${transactions.length} transactions`);
    } else {
      Alert.alert('Error', 'Failed to save event. Please try again.');
    }
    
    return success;
  };

  const handleResetPanelData = () => {
    if (isLocked) {
      Alert.alert('Read-Only Event', 'This is a read-only event.');
      return;
    }
    Alert.alert(
      'Reset Panel & History',
      'This will clear all transactions and reset the panel tab, but keep your products and settings. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            const success = await clearPanelData();
            if (success) {
              Alert.alert('Success', 'Panel and history data has been reset.');
            } else {
              Alert.alert('Error', 'Failed to reset data. Please try again.');
            }
          }
        }
      ]
    );
  };




  
  const handleQuitEvent = async () => {
    if (hasUnsavedChanges) {
      Alert.alert(
        'Unsaved Changes',
        'You have unsaved changes. Do you want to save the event before quitting?',
        [
          {
            text: 'Discard',
            style: 'destructive',
            onPress: async () => {
              console.log('🗑️ Discarding unsaved changes and quitting event');
              clearCurrentEvent();
              router.replace('/event-manager');
            }
          },
          {
            text: 'Cancel',
            style: 'cancel'
          },
          {
            text: 'Save & Quit',
            onPress: async () => {
              console.log('💾 Saving event before quitting');
              const success = await saveAllData();
              if (success) {
                await debugStoredData();
                clearCurrentEvent();
                router.replace('/event-manager');
              } else {
                Alert.alert('Error', 'Failed to save event. Please try again.');
              }
            }
          }
        ]
      );
    } else {
      clearCurrentEvent();
      router.replace('/event-manager');
    }
  };

  const handleExportToSpreadsheet = async () => {
    if (!currentUser || !currentEvent) {
      Alert.alert('Error', 'No event loaded');
      return;
    }

    if (transactions.length === 0) {
      Alert.alert('No Data', 'No transactions to export. Complete some sales first.');
      return;
    }

    try {
      setIsExporting(true);
      console.log('📊 Starting spreadsheet export...');
      
      const result = await createAndExportSpreadsheet({
        userName: currentUser.username,
        eventName: settings.eventName,
        transactions,
        products,
        settings,
        exchangeRates: {
          USD: exchangeRates?.USD || 1,
          EUR: exchangeRates?.EUR || 0.92,
          GBP: exchangeRates?.GBP || 0.79,
          lastUpdated: exchangeRates?.lastUpdated || new Date(),
        },
      });

      if (result.success) {
        console.log('✅ Export complete');
      } else {
        Alert.alert('Error', result.error || 'Failed to export data');
      }
    } catch (error) {
      console.error('❌ Export error:', error);
      Alert.alert('Error', 'An unexpected error occurred during export');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportEvent = () => {
    if (isLocked) {
      Alert.alert('Read-Only Event', 'This is a read-only event. Export is not available.');
      return;
    }
    const defaultName = `${settings.eventName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.json`;
    setExportFileName(defaultName);
    setShowExportModal(true);
  };

  const handleConfirmExport = async () => {
    if (!exportFileName.trim()) {
      Alert.alert('Error', 'Please enter a file name');
      return;
    }

    try {
      console.log('📤 Starting event export...');
      
      const exportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        settings,
        products,
        productTypes,
        promos,
        transactions: transactions.map(t => ({
          ...t,
          timestamp: t.timestamp.toISOString()
        }))
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const fileName = exportFileName.endsWith('.json') ? exportFileName : `${exportFileName}.json`;
      
      if (Platform.OS === 'web') {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.click();
        URL.revokeObjectURL(url);
        console.log('✅ File downloaded on web');
      } else {
        const file = new File(Paths.cache, fileName);
        file.write(jsonString);
        console.log('📄 File created at:', file.uri);
        
        const isAvailable = await Sharing.isAvailableAsync();
        if (!isAvailable) {
          Alert.alert('Error', 'Sharing is not available on this device');
          return;
        }
        
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: 'Export Event Data'
        });
        console.log('✅ File shared successfully');
      }
      
      setShowExportModal(false);
      Alert.alert('Success', 'Event exported successfully!');
    } catch (error) {
      console.error('❌ Export error:', error);
      Alert.alert('Error', `Failed to export event: ${error}`);
    }
  };







  const sections = [
    { name: 'Event Settings', index: 0 },
    { name: 'Types', index: 1 },
    { name: 'Products', index: 2 },
    { name: 'Promos', index: 3 },
  ];

  const scrollToSection = (index: number) => {
    scrollViewRef.current?.scrollTo({ x: index * screenWidth, animated: true });
    setCurrentSection(index);
  };

  const handleScroll = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const newSection = Math.round(offsetX / screenWidth);
    if (newSection !== currentSection && newSection >= 0 && newSection < sections.length) {
      setCurrentSection(newSection);
    }
  };


  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.sectionNav}>
        <TouchableOpacity 
          style={styles.navArrow}
          onPress={() => scrollToSection(Math.max(0, currentSection - 1))}
          disabled={currentSection === 0}
        >
          <ChevronLeft size={20} color={currentSection === 0 ? '#ccc' : '#333'} />
          {currentSection > 0 && (
            <Text style={styles.navText}>{sections[currentSection - 1].name}</Text>
          )}
        </TouchableOpacity>
        
        <Text style={styles.currentSectionText}>{sections[currentSection].name}</Text>
        
        <TouchableOpacity 
          style={styles.navArrow}
          onPress={() => scrollToSection(Math.min(sections.length - 1, currentSection + 1))}
          disabled={currentSection === sections.length - 1}
        >
          {currentSection < sections.length - 1 && (
            <Text style={styles.navText}>{sections[currentSection + 1].name}</Text>
          )}
          <ChevronRight size={20} color={currentSection === sections.length - 1 ? '#ccc' : '#333'} />
        </TouchableOpacity>
      </View>
      
      <View style={styles.indicators}>
        {sections.map((_, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.indicator,
              index === currentSection && styles.indicatorActive
            ]}
            onPress={() => scrollToSection(index)}
          />
        ))}
      </View>

      {/* Horizontal Scrolling Sections */}
      <ScrollView
        ref={scrollViewRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        style={styles.sectionsContainer}
      >
        {/* Event Settings Section */}
        <View style={styles.sectionContent}>
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
          >
            <ScrollView showsVerticalScrollIndicator={false} style={styles.sectionScroll}>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Event Settings</Text>
              
              <View style={styles.spacer} />
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Event Name</Text>
                <TextInput
                  style={[styles.input, isLocked && styles.inputDisabled]}
                  value={settings.eventName}
                  onChangeText={(text) => {
                    if (isLocked) {
                      Alert.alert('Read-Only Event', 'This is a read-only event. Changes cannot be made.');
                      return;
                    }
                    updateSettings({ eventName: text });
                  }}
                  placeholder="Enter event name"
                  testID="event-name-input"
                  editable={!isLocked}
                  onFocus={() => {
                    if (isLocked) {
                      Alert.alert('Read-Only Event', 'This is a read-only event. Changes cannot be made.');
                    }
                  }}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Main Currency</Text>
                <View style={styles.currencyContainer}>
                  {Object.entries(CURRENCIES).map(([code, config]) => (
                    <TouchableOpacity
                      key={code}
                      style={[
                        styles.currencyButton,
                        settings.currency === code && styles.currencyButtonActive,
                        isLocked && styles.buttonDisabledOpacity,
                      ]}
                      onPress={() => {
                        if (isLocked) {
                          Alert.alert('Read-Only Event', 'This is a read-only event. Changes cannot be made.');
                          return;
                        }
                        updateSettings({ currency: code as Currency });
                      }}
                      disabled={isLocked}
                      testID={`currency-${code}`}
                    >
                      <Text
                        style={[
                          styles.currencyText,
                          settings.currency === code && styles.currencyTextActive,
                        ]}
                      >
                        {config.symbol} {code}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <View style={styles.switchRow}>
                  <Text style={styles.label}>Currency Round-up</Text>
                  <Switch
                    value={settings.currencyRoundUp}
                    onValueChange={(value) => {
                      if (isLocked) {
                        Alert.alert('Read-Only Event', 'This is a read-only event. Changes cannot be made.');
                        return;
                      }
                      updateSettings({ currencyRoundUp: value });
                    }}
                    testID="currency-round-up-switch"
                    disabled={isLocked}
                  />
                </View>
              </View>

              {/* Exchange Rates Section */}
              <View style={styles.exchangeRatesSection}>
                <View style={styles.exchangeRatesHeader}>
                  <Text style={styles.label}>Live Exchange Rates</Text>
                  <TouchableOpacity
                    style={styles.refreshButton}
                    onPress={() => {
                      if (exchangeRates.customRates) {
                        Alert.alert(
                          'Custom Rates Active',
                          'You have custom rates set. Refreshing will replace them with live rates. Continue?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Refresh',
                              style: 'destructive',
                              onPress: () => {
                                clearCustomRates();
                                fetchExchangeRates();
                              }
                            }
                          ]
                        );
                      } else {
                        fetchExchangeRates();
                      }
                    }}
                    disabled={isLoadingRates || isLocked}
                    testID="refresh-rates-button"
                  >
                    <RefreshCw 
                      size={18} 
                      color={isLoadingRates ? '#ccc' : Colors.light.tint} 
                      style={isLoadingRates ? styles.spinning : undefined}
                    />
                    <Text style={[styles.refreshButtonText, isLoadingRates && styles.refreshButtonTextDisabled]}>
                      {isLoadingRates ? 'Updating...' : 'Refresh'}
                    </Text>
                  </TouchableOpacity>
                </View>
                
                <View style={styles.ratesContainer}>
                  {(['USD', 'EUR', 'GBP'] as Currency[]).map(currency => {
                    const mainCurrencyRate = getEffectiveRate(settings.currency);
                    const targetCurrencyRate = getEffectiveRate(currency);
                    const relativeRate = currency === settings.currency ? 1 : targetCurrencyRate / mainCurrencyRate;
                    const isCustom = exchangeRates.customRates && exchangeRates.customRates[currency] !== undefined;
                    const isEditing = editingRate === currency;
                    
                    const handleDoubleTap = () => {
                      const now = Date.now();
                      const lastTap = lastTapTime[currency] || 0;
                      
                      if (now - lastTap < 300) {
                        setEditingRate(currency);
                        setEditingRateValue(relativeRate.toFixed(4));
                      }
                      
                      setLastTapTime(prev => ({ ...prev, [currency]: now }));
                    };
                    
                    const handleSave = async () => {
                      if (isLocked) return;
                      const newRate = parseFloat(editingRateValue);
                      if (!isNaN(newRate) && newRate > 0) {
                        const absoluteRate = newRate * mainCurrencyRate;
                        await updateCustomRate(currency, absoluteRate);
                        setEditingRate(null);
                        setEditingRateValue('');
                      } else {
                        Alert.alert('Invalid Rate', 'Please enter a valid positive number');
                      }
                    };
                    
                    return (
                      <View key={currency} style={styles.rateRow}>
                        <Text style={styles.rateLabel}>{currency}:</Text>
                        {isEditing ? (
                          <View style={styles.rateEditContainer}>
                            <TextInput
                              style={styles.rateInput}
                              value={editingRateValue}
                              onChangeText={(text) => {
                                const cleaned = text.replace(/,/g, '.');
                                setEditingRateValue(cleaned);
                              }}
                              keyboardType="numeric"
                              autoFocus
                              selectTextOnFocus
                              returnKeyType="done"
                            />
                            <TouchableOpacity
                              style={styles.rateSaveButton}
                              onPress={handleSave}
                            >
                              <Check size={16} color="white" />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <Pressable onPress={isLocked ? undefined : handleDoubleTap} style={styles.rateValueContainer}>
                            <Text style={[styles.rateValue, isCustom && styles.rateValueCustom]}>
                              {relativeRate.toFixed(4)}
                              {isCustom && ' *'}
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>
                
                {exchangeRates.customRates && (
                  <Text style={styles.customRateNote}>
                    * Custom rate (double tap to edit)
                  </Text>
                )}
                
                <Text style={styles.lastUpdated}>
                  Last updated: {exchangeRates.lastUpdated.toLocaleString()}
                </Text>
              </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>

        {/* Types Section */}
        <View style={styles.sectionContent}>
          <ScrollView showsVerticalScrollIndicator={false} style={styles.sectionScroll}>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Types</Text>
                <TouchableOpacity
                  style={[styles.addButton, isLocked && styles.addButtonDisabled]}
                  onPress={() => {
                    if (isLocked) {
                      Alert.alert('Read-Only Event', 'This is a read-only event.');
                      return;
                    }
                    const newName = `Type ${productTypes.length + 1}`;
                    const colors = ['#E3F2FD', '#FFF3E0', '#E8F5E9', '#FCE4EC', '#F3E5F5'];
                    const color = colors[productTypes.length % colors.length];
                    addProductType({ name: newName, color, order: productTypes.length, enabled: true });
                  }}
                  testID="add-type-button"
                  disabled={isLocked}
                >
                  <Plus size={20} color="white" />
                  <Text style={styles.addButtonText}>Add</Text>
                </TouchableOpacity>
              </View>

              {/* Types List */}
              <TypesList
                types={[...productTypes].sort((a, b) => a.order - b.order)}
                onReorder={reorderProductTypes}
                onUpdateType={(id: string, updates: Partial<import('@/types/sales').ProductType>) => {
                  if (isLocked) {
                    Alert.alert('Read-Only Event', 'This is a read-only event.');
                    return;
                  }
                  updateProductType(id, updates);
                }}
                onDeleteType={(typeId: string) => {
                  if (isLocked) {
                    Alert.alert('Read-Only Event', 'This is a read-only event.');
                    return;
                  }
                  Alert.alert(
                    'Delete Type',
                    'Are you sure? Products using this type will need to be reassigned.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => deleteProductType(typeId) },
                    ]
                  );
                }}
                isLocked={isLocked}
              />
            </View>
          </ScrollView>
        </View>

        {/* Products Section */}
        <View style={styles.sectionContent}>
          <ScrollView showsVerticalScrollIndicator={false} style={styles.sectionScroll}>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Products</Text>
                <TouchableOpacity
                  style={[styles.addButton, isLocked && styles.addButtonDisabled]}
                  onPress={handleShowAddProduct}
                  testID="add-product-button"
                  disabled={isLocked}
                >
                  <Plus size={20} color="white" />
                  <Text style={styles.addButtonText}>Add</Text>
                </TouchableOpacity>
              </View>

              {/* Products List */}
              <SimpleProductList
                products={sortedProducts}
                onReorder={reorderProducts}
                onEditProduct={handleEditProduct}
                onUpdateProduct={handleUpdateProduct}
                onDeleteProduct={handleDeleteProduct}
                onDuplicateProduct={handleDuplicateProduct}
                currency={settings.currency}
                isLocked={isLocked}
              />
            </View>
          </ScrollView>
        </View>

        {/* Promos Section */}
        <View style={styles.sectionContent}>
          <ScrollView showsVerticalScrollIndicator={false} style={styles.sectionScroll}>
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Promos</Text>
                <TouchableOpacity
                  style={[styles.addButton, isLocked && styles.addButtonDisabled]}
                  onPress={() => {
                    if (isLocked) {
                      Alert.alert('Read-Only Event', 'This is a read-only event.');
                      return;
                    }
                    setShowAddPromo(true);
                  }}
                  testID="add-promo-button"
                  disabled={isLocked}
                >
                  <Plus size={20} color="white" />
                  <Text style={styles.addButtonText}>Add</Text>
                </TouchableOpacity>
              </View>

              <PromosList
                promos={[...promos].sort((a, b) => a.order - b.order)}
                onReorder={reorderPromos}
                onEditPromo={(promo: Promo) => {
                  if (isLocked) {
                    Alert.alert('Read-Only Event', 'This is a read-only event.');
                    return;
                  }
                  setEditingPromo(promo);
                  setNewPromo({
                    name: promo.name,
                    mode: promo.mode,
                    typeId: promo.typeId || '',
                    maxQuantity: promo.maxQuantity.toString(),
                    prices: promo.prices,
                    incrementalPrice: promo.incrementalPrice?.toString() || '',
                    incrementalPrice10Plus: promo.incrementalPrice10Plus?.toString() || '',
                    comboProductIds: promo.comboProductIds || [],
                    comboPrice: promo.comboPrice?.toString() || '',
                    comboTypeFilter: 'all',
                  });
                  setShowAddPromo(true);
                }}
                onDeletePromo={(promoId: string) => {
                  if (isLocked) {
                    Alert.alert('Read-Only Event', 'This is a read-only event.');
                    return;
                  }
                  Alert.alert(
                    'Delete Promo',
                    'Are you sure you want to delete this promo?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => deletePromo(promoId) },
                    ]
                  );
                }}
                isLocked={isLocked}
              />
            </View>
          </ScrollView>
        </View>
      </ScrollView>

      {/* Fixed Bottom Action Buttons */}
      <View style={styles.bottomActions}>
        {isLocked && (
          <View style={styles.lockedWarning}>
            <Text style={styles.lockedWarningText}>🔒 This event is locked. Changes cannot be saved.</Text>
          </View>
        )}
        <Text style={styles.bottomActionsHint}>Event Actions</Text>
        
        {/* Row 1: GSheet, Export, Save */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.exportButton}
            onPress={handleExportToSpreadsheet}
            disabled={isExporting}
            testID="export-spreadsheet-button"
          >
            <FileSpreadsheet size={20} color="white" />
            <Text style={styles.exportButtonText}>{isExporting ? 'Exporting...' : 'CSV'}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.exportEventButton, isLocked && styles.exportEventButtonDisabled]}
            onPress={handleExportEvent}
            testID="export-event-button"
            disabled={isLocked}
          >
            <Download size={20} color={isLocked ? '#999' : 'white'} />
            <Text style={[styles.exportEventButtonText, isLocked && styles.disabledButtonText]}>Export</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.saveDataButton, isLocked && styles.saveDataButtonDisabled]}
            onPress={() => {
              if (isLocked) {
                Alert.alert('Read-Only Event', 'This is a read-only event. Changes cannot be saved.');
                return;
              }
              handleSave();
            }}
            testID="save-data-button"
            disabled={isLocked}
          >
            <Save size={20} color={isLocked ? "#999" : "white"} />
            <Text style={[styles.saveDataButtonText, isLocked && styles.disabledButtonText]}>Save</Text>
          </TouchableOpacity>
        </View>
        
        {/* Row 2: Reset, Quit */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.resetPanelButton, isLocked && styles.resetPanelButtonDisabled]}
            onPress={handleResetPanelData}
            testID="reset-panel-data-button"
            disabled={isLocked}
          >
            <RotateCcw size={20} color="#FF9500" />
            <Text style={styles.resetPanelButtonText}>Reset</Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.quitEventButton}
            onPress={handleQuitEvent}
            testID="quit-event-button"
          >
            <X size={20} color="#FF3B30" />
            <Text style={styles.quitEventButtonText}>Quit</Text>
          </TouchableOpacity>
        </View>
      </View>
      
      {/* Modal for Add/Edit Promo Form */}
      <Modal
        visible={showAddPromo}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {
          setShowAddPromo(false);
          setEditingPromo(null);
          setNewPromo({
            name: '',
            mode: 'type_list',
            typeId: productTypes.length > 0 ? productTypes[0].id : '',
            maxQuantity: '7',
            prices: {},
            incrementalPrice: '',
            incrementalPrice10Plus: '',
            comboProductIds: [],
            comboPrice: '',
            comboTypeFilter: 'all',
          });
        }}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => {
              setShowAddPromo(false);
              setEditingPromo(null);
              setNewPromo({
                name: '',
                mode: 'type_list',
                typeId: productTypes.length > 0 ? productTypes[0].id : '',
                maxQuantity: '7',
                prices: {},
                incrementalPrice: '',
                incrementalPrice10Plus: '',
                comboProductIds: [],
                comboPrice: '',
                comboTypeFilter: 'all',
              });
            }}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {editingPromo ? 'Edit Promo' : 'Add New Promo'}
            </Text>
            <TouchableOpacity 
              onPress={() => {
                if (!newPromo.name.trim()) {
                  Alert.alert('Error', 'Please enter a promo name');
                  return;
                }
                if (newPromo.mode === 'type_list') {
                  if (!newPromo.maxQuantity || parseInt(newPromo.maxQuantity) < 2) {
                    Alert.alert('Error', 'Max quantity must be at least 2');
                    return;
                  }
                  if (!newPromo.typeId) {
                    Alert.alert('Error', 'Please select a type');
                    return;
                  }
                } else if (newPromo.mode === 'combo') {
                  if (newPromo.comboProductIds.length === 0) {
                    Alert.alert('Error', 'Please select at least one product for the combo');
                    return;
                  }
                  if (!newPromo.comboPrice || parseFloat(newPromo.comboPrice) <= 0) {
                    Alert.alert('Error', 'Please enter a valid combo price');
                    return;
                  }
                }
                
                const maxQty = parseInt(newPromo.maxQuantity) || 0;
                const incrementalPrice = newPromo.incrementalPrice ? parseFloat(newPromo.incrementalPrice) : undefined;
                const incrementalPrice10Plus = newPromo.incrementalPrice10Plus ? parseFloat(newPromo.incrementalPrice10Plus) : undefined;
                
                const promoData = {
                  name: newPromo.name.trim(),
                  mode: newPromo.mode,
                  typeId: newPromo.mode === 'type_list' ? newPromo.typeId : undefined,
                  maxQuantity: maxQty,
                  prices: newPromo.mode === 'type_list' ? newPromo.prices : {},
                  incrementalPrice: newPromo.mode === 'type_list' ? incrementalPrice : undefined,
                  incrementalPrice10Plus: newPromo.mode === 'type_list' ? incrementalPrice10Plus : undefined,
                  comboProductIds: newPromo.mode === 'combo' ? newPromo.comboProductIds : undefined,
                  comboPrice: newPromo.mode === 'combo' ? parseFloat(newPromo.comboPrice) : undefined,
                  order: 0,
                };
                
                if (editingPromo) {
                  updatePromo(editingPromo.id, promoData);
                } else {
                  addPromo(promoData);
                }
                
                setShowAddPromo(false);
                setEditingPromo(null);
                setNewPromo({
                  name: '',
                  mode: 'type_list',
                  typeId: productTypes.length > 0 ? productTypes[0].id : '',
                  maxQuantity: '7',
                  prices: {},
                  incrementalPrice: '',
                  incrementalPrice10Plus: '',
                  comboProductIds: [],
                  comboPrice: '',
                  comboTypeFilter: 'all',
                });
              }}
              style={styles.modalSaveButton}
            >
              <Text style={styles.modalSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
          
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
            keyboardVerticalOffset={100}
          >
            <ScrollView 
              style={styles.modalContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 100 }}
            >
              <View style={styles.modalForm}>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Promo Name</Text>
                  <TextInput
                    style={styles.input}
                    value={newPromo.name}
                    onChangeText={(text) => setNewPromo(prev => ({ ...prev, name: text }))}
                    placeholder="e.g. Black Friday, Spring Sale"
                    testID="promo-name-input"
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Mode</Text>
                <View style={styles.typeContainer}>
                  <TouchableOpacity
                    style={[
                      styles.typeButton,
                      newPromo.mode === 'type_list' && styles.typeButtonActive,
                    ]}
                    onPress={() => setNewPromo(prev => ({ ...prev, mode: 'type_list', comboProductIds: [], comboPrice: '' }))}
                  >
                    <Text
                      style={[
                        styles.typeText,
                        newPromo.mode === 'type_list' && styles.typeTextActive,
                      ]}
                    >
                      Type List
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.typeButton,
                      newPromo.mode === 'combo' && styles.typeButtonActive,
                    ]}
                    onPress={() => setNewPromo(prev => ({ ...prev, mode: 'combo', prices: {} }))}
                  >
                    <Text
                      style={[
                        styles.typeText,
                        newPromo.mode === 'combo' && styles.typeTextActive,
                      ]}
                    >
                      Combo
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {newPromo.mode === 'type_list' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Select Type</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={styles.typeContainer}>
                      {productTypes.sort((a, b) => a.order - b.order).map((type) => (
                        <TouchableOpacity
                          key={type.id}
                          style={[
                            styles.typeButton,
                            newPromo.typeId === type.id && styles.typeButtonActive,
                          ]}
                          onPress={() => setNewPromo(prev => ({ ...prev, typeId: type.id }))}
                        >
                          <Text
                            style={[
                              styles.typeText,
                              newPromo.typeId === type.id && styles.typeTextActive,
                            ]}
                          >
                            {type.name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              )}

              {newPromo.mode === 'type_list' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Max Quantity</Text>
                  <TextInput
                    style={styles.input}
                    value={newPromo.maxQuantity}
                    onChangeText={(text) => {
                      setNewPromo(prev => ({ ...prev, maxQuantity: text, prices: {} }));
                    }}
                    placeholder="7"
                    keyboardType="numeric"
                    testID="max-quantity-input"
                  />
                </View>
              )}

              {newPromo.mode === 'combo' && (
                <>
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Filter by Type</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <View style={styles.typeContainer}>
                        <TouchableOpacity
                          style={[
                            styles.typeButton,
                            newPromo.comboTypeFilter === 'all' && styles.typeButtonActive,
                          ]}
                          onPress={() => setNewPromo(prev => ({ ...prev, comboTypeFilter: 'all' }))}
                        >
                          <Text
                            style={[
                              styles.typeText,
                              newPromo.comboTypeFilter === 'all' && styles.typeTextActive,
                            ]}
                          >
                            All
                          </Text>
                        </TouchableOpacity>
                        {productTypes.sort((a, b) => a.order - b.order).map((type) => (
                          <TouchableOpacity
                            key={type.id}
                            style={[
                              styles.typeButton,
                              newPromo.comboTypeFilter === type.id && styles.typeButtonActive,
                            ]}
                            onPress={() => setNewPromo(prev => ({ ...prev, comboTypeFilter: type.id }))}
                          >
                            <Text
                              style={[
                                styles.typeText,
                                newPromo.comboTypeFilter === type.id && styles.typeTextActive,
                              ]}
                            >
                              {type.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Select Products for Combo</Text>
                    {sortedProducts
                      .filter(p => p.enabled && p.promoEligible)
                      .filter(p => newPromo.comboTypeFilter === 'all' || p.typeId === newPromo.comboTypeFilter)
                      .map((product) => {
                      const type = productTypes.find(t => t.id === product.typeId);
                      const isSelected = newPromo.comboProductIds.includes(product.id);
                      
                      return (
                        <TouchableOpacity
                          key={product.id}
                          style={[styles.comboProductItem, { backgroundColor: type?.color || '#f9f9f9' }]}
                          onPress={() => {
                            setNewPromo(prev => ({
                              ...prev,
                              comboProductIds: isSelected
                                ? prev.comboProductIds.filter(id => id !== product.id)
                                : [...prev.comboProductIds, product.id]
                            }));
                          }}
                          testID={`combo-product-${product.id}`}
                        >
                          <View style={styles.comboProductInfo}>
                            <Text style={styles.productName}>{product.name}</Text>
                            <Text style={styles.productPrice}>
                              {CURRENCIES[settings.currency].symbol}{product.price.toFixed(2)} • {type?.name || 'Unknown'}
                            </Text>
                          </View>
                          <View style={[styles.comboCheckbox, isSelected && styles.comboCheckboxSelected]}>
                            {isSelected && <Check size={16} color="white" />}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Combo Special Price</Text>
                    <View style={styles.promoPriceRow}>
                      <TextInput
                        style={styles.promoPriceInput}
                        value={newPromo.comboPrice}
                        onChangeText={(text) => setNewPromo(prev => ({ ...prev, comboPrice: text }))}
                        placeholder="Enter combo price"
                        keyboardType="numeric"
                        testID="combo-price-input"
                      />
                      <Text style={styles.currencySymbol}>{CURRENCIES[settings.currency].symbol}</Text>
                    </View>
                  </View>
                </>
              )}

              {newPromo.mode === 'type_list' && parseInt(newPromo.maxQuantity) >= 2 && (
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Promo Prices by Quantity</Text>
                  {Array.from({ length: parseInt(newPromo.maxQuantity) - 1 }, (_, i) => i + 2).map(quantity => {
                    const typeName = productTypes.find(t => t.id === newPromo.typeId)?.name || 'Items';
                    
                    return (
                      <View key={quantity} style={styles.promoPriceRow}>
                        <Text style={styles.promoPriceLabel}>{quantity} {typeName}:</Text>
                        <TextInput
                          style={styles.promoPriceInput}
                          value={newPromo.prices[quantity]?.toString() || ''}
                          onChangeText={(text) => {
                            const value = parseFloat(text) || 0;
                            setNewPromo(prev => ({
                              ...prev,
                              prices: {
                                ...prev.prices,
                                [quantity]: value
                              }
                            }));
                          }}
                          placeholder="0"
                          keyboardType="numeric"
                          testID={`promo-price-${quantity}`}
                        />
                        <Text style={styles.currencySymbol}>{CURRENCIES[settings.currency].symbol}</Text>
                      </View>
                    );
                  })}
                  
                  {/* Incremental pricing fields */}
                  <View style={styles.incrementalPricingSection}>
                    <Text style={styles.incrementalPricingTitle}>Incremental Pricing</Text>
                    
                    <View style={styles.promoPriceRow}>
                      <Text style={styles.promoPriceLabel}>+{parseInt(newPromo.maxQuantity)} {productTypes.find(t => t.id === newPromo.typeId)?.name || 'Items'}:</Text>
                      <TextInput
                        style={styles.promoPriceInput}
                        value={newPromo.incrementalPrice}
                        onChangeText={(text) => {
                          setNewPromo(prev => ({ ...prev, incrementalPrice: text }));
                        }}
                        placeholder="0"
                        keyboardType="numeric"
                        testID="incremental-price-input"
                      />
                      <Text style={styles.currencySymbol}>{CURRENCIES[settings.currency].symbol}</Text>
                    </View>
                    <Text style={styles.incrementalPricingHint}>
                      Price per item from {parseInt(newPromo.maxQuantity) + 1} to 9 items
                    </Text>
                    
                    <View style={styles.promoPriceRow}>
                      <Text style={styles.promoPriceLabel}>+10 {productTypes.find(t => t.id === newPromo.typeId)?.name || 'Items'}:</Text>
                      <TextInput
                        style={styles.promoPriceInput}
                        value={newPromo.incrementalPrice10Plus}
                        onChangeText={(text) => {
                          setNewPromo(prev => ({ ...prev, incrementalPrice10Plus: text }));
                        }}
                        placeholder="0"
                        keyboardType="numeric"
                        testID="incremental-price-10plus-input"
                      />
                      <Text style={styles.currencySymbol}>{CURRENCIES[settings.currency].symbol}</Text>
                    </View>
                    <Text style={styles.incrementalPricingHint}>
                      Price per item from 10 items onwards
                    </Text>
                  </View>
                </View>
              )}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* Export Modal */}
      <Modal
        visible={showExportModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowExportModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowExportModal(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Export Event</Text>
            <TouchableOpacity onPress={handleConfirmExport} style={styles.modalSaveButton}>
              <Text style={styles.modalSaveText}>Export</Text>
            </TouchableOpacity>
          </View>
          
          <View style={styles.modalContent}>
            <View style={styles.modalForm}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>File Name</Text>
                <TextInput
                  style={styles.input}
                  value={exportFileName}
                  onChangeText={setExportFileName}
                  placeholder="event_export.json"
                  autoFocus
                  testID="export-file-name-input"
                />
              </View>
              
              <View style={styles.exportInfoBox}>
                <Text style={styles.exportInfoTitle}>What will be exported:</Text>
                <Text style={styles.exportInfoText}>• Event settings</Text>
                <Text style={styles.exportInfoText}>• {products.length} products</Text>
                <Text style={styles.exportInfoText}>• {productTypes.length} product types</Text>
                <Text style={styles.exportInfoText}>• {promos.length} promos</Text>
                <Text style={styles.exportInfoText}>• {transactions.length} transactions</Text>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Modal for Add/Edit Product Form */}
      <Modal
        visible={showAddProduct}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCancelEdit}
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={handleCancelEdit}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {editingProduct ? 'Edit Product' : (duplicateSourceOrder !== null ? 'Duplicate Product' : 'Add New Product')}
            </Text>
            <TouchableOpacity 
              onPress={editingProduct ? handleSaveEditedProduct : handleAddProduct}
              style={styles.modalSaveButton}
            >
              <Text style={styles.modalSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalContent}>
            <View style={styles.modalForm}>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Product Name</Text>
                <TextInput
                  ref={newProductNameRef}
                  style={styles.input}
                  value={newProduct.name}
                  onChangeText={(text) => setNewProduct(prev => ({ ...prev, name: text }))}
                  placeholder="Product name"
                  testID="new-product-name"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Price</Text>
                <TextInput
                  style={styles.input}
                  value={newProduct.price}
                  onChangeText={(text) => setNewProduct(prev => ({ ...prev, price: text }))}
                  placeholder="Price"
                  keyboardType="numeric"
                  testID="new-product-price"
                />
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.typeContainer}>
                    {productTypes.sort((a, b) => a.order - b.order).map((type) => (
                      <TouchableOpacity
                        key={type.id}
                        style={[
                          styles.typeButton,
                          newProduct.typeId === type.id && styles.typeButtonActive,
                        ]}
                        onPress={() => setNewProduct(prev => ({ ...prev, typeId: type.id }))}
                      >
                        <Text
                          style={[
                            styles.typeText,
                            newProduct.typeId === type.id && styles.typeTextActive,
                          ]}
                        >
                          {type.name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </View>
              
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Subgroup (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={newProduct.subgroup}
                  onChangeText={(text) => setNewProduct(prev => ({ ...prev, subgroup: text }))}
                  placeholder="Enter subgroup name"
                  testID="new-product-subgroup"
                />
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
      


    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  sectionNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  navArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 100,
  },
  navText: {
    fontSize: 12,
    color: '#666',
  },
  currentSectionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  indicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 8,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ddd',
  },
  indicatorActive: {
    backgroundColor: Colors.light.tint,
    width: 24,
  },
  sectionsContainer: {
    flex: 1,
  },
  sectionContent: {
    width: screenWidth,
    paddingHorizontal: 16,
  },
  sectionScroll: {
    flex: 1,
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  currencyContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  currencyButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
  },
  currencyButtonActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  currencyText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  currencyTextActive: {
    color: 'white',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 4,
  },
  addButtonText: {
    color: 'white',
    fontWeight: '500',
  },
  addButtonDisabled: {
    backgroundColor: '#ccc',
    opacity: 0.5,
  },
  inputDisabled: {
    backgroundColor: '#f0f0f0',
    color: '#999',
  },
  saveDataButtonDisabled: {
    backgroundColor: '#e0e0e0',
    borderWidth: 1,
    borderColor: '#ccc',
  },
  disabledButtonText: {
    color: '#999',
  },
  buttonDisabledOpacity: {
    opacity: 0.5,
  },
  resetPanelButtonDisabled: {
    backgroundColor: '#f0f0f0',
    borderColor: '#ccc',
    opacity: 0.5,
  },
  bottomActions: {
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: 28,
    gap: 8,
  },
  bottomActionsHint: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  lockedWarning: {
    backgroundColor: '#FFF3CD',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9500',
  },
  lockedWarningText: {
    fontSize: 14,
    color: '#856404',
    fontWeight: '600',
    textAlign: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  quitEventButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#FF3B30',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 4,
  },
  quitEventButtonText: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '600',
  },
  saveDataButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.tint,
    paddingVertical: 12,
    borderRadius: 8,
    gap: 4,
  },
  saveDataButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  exportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34C759',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 4,
  },
  exportButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  exportEventButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5856D6',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 4,
  },
  exportEventButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  exportEventButtonDisabled: {
    backgroundColor: '#e0e0e0',
    borderWidth: 1,
    borderColor: '#ccc',
  },

  exportInfoBox: {
    backgroundColor: '#F0F0F0',
    padding: 16,
    borderRadius: 8,
    marginTop: 16,
  },
  exportInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  exportInfoText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  fileNameText: {
    fontSize: 16,
    color: '#666',
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  resetPanelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#FF9500',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 4,
  },
  resetPanelButtonText: {
    color: '#FF9500',
    fontSize: 14,
    fontWeight: '600',
  },


  productItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
    marginBottom: 8,
  },
  actionIcons: {
    flexDirection: 'row',
    marginLeft: 8,
    gap: 8,
  },
  actionButton: {
    padding: 6,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 32,
    minHeight: 32,
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1a1a1a',
  },
  productPrice: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  productControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchesContainer: {
    flexDirection: 'column',
    gap: 4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  switchLabel: {
    fontSize: 10,
    color: '#666',
    minWidth: 40,
  },
  thinSwitch: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
  },
  reorderControls: {
    flexDirection: 'column',
    marginRight: 8,
    gap: 2,
  },
  reorderButton: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: '#f0f0f0',
  },
  reorderButtonDisabled: {
    backgroundColor: '#f8f8f8',
  },
  typeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  typeButton: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  typeText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  typeTextActive: {
    color: 'white',
  },

  modalContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  modalCancelText: {
    fontSize: 16,
    color: '#666',
  },
  modalSaveButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: Colors.light.tint,
    borderRadius: 6,
  },
  modalSaveText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  modalContent: {
    flex: 1,
  },
  modalForm: {
    padding: 16,
  },
  promoPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  promoPriceLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    minWidth: 80,
  },
  promoPriceInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  currencySymbol: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
    minWidth: 20,
  },
  productTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dividerSection: {
    marginVertical: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
  },
  exchangeRatesSection: {
    marginTop: 0,
  },
  exchangeRatesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
  },
  refreshButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.light.tint,
  },
  refreshButtonTextDisabled: {
    color: '#ccc',
  },
  spinning: {
    transform: [{ rotate: '180deg' }],
  },
  ratesContainer: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  rateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rateLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
  },
  rateValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  lastUpdated: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  rateValueContainer: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  rateValueCustom: {
    color: Colors.light.tint,
    fontWeight: '700',
  },
  rateEditContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rateInput: {
    borderWidth: 1,
    borderColor: Colors.light.tint,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 15,
    fontWeight: '600',
    minWidth: 80,
    backgroundColor: 'white',
  },
  rateSaveButton: {
    backgroundColor: Colors.light.tint,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  customRateNote: {
    fontSize: 11,
    color: Colors.light.tint,
    marginTop: 8,
    fontStyle: 'italic',
  },
  spacer: {
    height: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveModalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 400,
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
    color: '#666',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#f5f5f5',
  },
  modalButtonSave: {
    backgroundColor: Colors.primary,
  },
  saveModalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  modalButtonTextSave: {
    color: '#fff',
  },
  comboProductItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    gap: 12,
  },
  comboProductInfo: {
    flex: 1,
  },
  comboCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ddd',
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  comboCheckboxSelected: {
    backgroundColor: Colors.light.tint,
    borderColor: Colors.light.tint,
  },
  incrementalPricingSection: {
    marginTop: 0,
    paddingTop: 0,
  },
  incrementalPricingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  incrementalPricingHint: {
    fontSize: 12,
    color: '#999',
    marginTop: -8,
    marginBottom: 8,
    marginLeft: 88,
  },
});

const colorPickerStyles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  colorPickerContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
    width: '72%',
    maxWidth: 290,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 20,
    textAlign: 'center',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 16,
  },
  colorOption: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ddd',
  },
  closeButton: {
    backgroundColor: Colors.light.tint,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});

interface TypesListProps {
  types: import('@/types/sales').ProductType[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  onUpdateType: (id: string, updates: Partial<import('@/types/sales').ProductType>) => void;
  onDeleteType: (id: string) => void;
  isLocked: boolean;
}

function TypesList({ types, onReorder, onUpdateType, onDeleteType, isLocked }: TypesListProps) {
  const [editingType, setEditingType] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [colorPickerType, setColorPickerType] = useState<string | null>(null);

  const colorPalette = [
    '#E3F2FD', '#BBDEFB', '#90CAF9', '#64B5F6', '#42A5F5',
    '#FFF3E0', '#FFE0B2', '#FFCC80', '#FFB74D', '#FFA726',
    '#E8F5E9', '#C8E6C9', '#A5D6A7', '#81C784', '#66BB6A',
    '#FCE4EC', '#F8BBD0', '#F48FB1', '#F06292', '#EC407A',
    '#F3E5F5', '#E1BEE7', '#CE93D8', '#BA68C8', '#AB47BC',
    '#E0F2F1', '#B2DFDB', '#80CBC4', '#4DB6AC', '#26A69A',
    '#FFF9C4', '#FFF59D', '#FFF176', '#FFEE58', '#FFEB3B',
    '#FFEBEE', '#FFCDD2', '#EF9A9A', '#E57373', '#EF5350',
    '#E8EAF6', '#C5CAE9', '#9FA8DA', '#7986CB', '#5C6BC0',
    '#EFEBE9', '#D7CCC8', '#BCAAA4', '#A1887F', '#8D6E63',
  ];

  const handleMoveUp = (index: number) => {
    if (index > 0) {
      onReorder(index, index - 1);
    }
  };

  const handleMoveDown = (index: number) => {
    if (index < types.length - 1) {
      onReorder(index, index + 1);
    }
  };

  const handleSaveName = (typeId: string) => {
    if (editingName.trim()) {
      onUpdateType(typeId, { name: editingName.trim() });
    }
    setEditingType(null);
    setEditingName('');
  };

  return (
    <>
      {types.map((type, index) => (
        <View key={type.id} style={[styles.productItem, { backgroundColor: type.color }]}>
          <View style={styles.reorderControls}>
            <TouchableOpacity
              style={[styles.reorderButton, (index === 0 || isLocked) && styles.reorderButtonDisabled]}
              onPress={() => handleMoveUp(index)}
              disabled={index === 0 || isLocked}
            >
              <ChevronUp size={16} color={(index === 0 || isLocked) ? '#ccc' : '#666'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.reorderButton, (index === types.length - 1 || isLocked) && styles.reorderButtonDisabled]}
              onPress={() => handleMoveDown(index)}
              disabled={index === types.length - 1 || isLocked}
            >
              <ChevronDown size={16} color={(index === types.length - 1 || isLocked) ? '#ccc' : '#666'} />
            </TouchableOpacity>
          </View>

          {editingType === type.id ? (
            <View style={styles.productTouchable}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                value={editingName}
                onChangeText={setEditingName}
                onBlur={() => handleSaveName(type.id)}
                onSubmitEditing={() => handleSaveName(type.id)}
                autoFocus
                selectTextOnFocus
              />
            </View>
          ) : (
            <TouchableOpacity
              style={styles.productTouchable}
              onPress={() => {
                if (isLocked) {
                  Alert.alert('Read-Only Event', 'This is a read-only event.');
                  return;
                }
                setEditingType(type.id);
                setEditingName(type.name);
              }}
              disabled={isLocked}
            >
              <View style={styles.productInfo}>
                <Text style={styles.productName}>{type.name}</Text>
              </View>
            </TouchableOpacity>
          )}

          <Switch
            value={type.enabled}
            onValueChange={(value) => {
              if (isLocked) {
                Alert.alert('Read-Only Event', 'This is a read-only event.');
                return;
              }
              onUpdateType(type.id, { enabled: value });
            }}
            testID={`type-${type.id}-enabled`}
            style={styles.thinSwitch}
            disabled={isLocked}
          />

          <View style={styles.actionIcons}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => {
                if (isLocked) {
                  Alert.alert('Read-Only Event', 'This is a read-only event.');
                  return;
                }
                setColorPickerType(type.id);
              }}
              testID={`color-picker-${type.id}`}
              disabled={isLocked}
            >
              <Palette size={18} color={isLocked ? '#ccc' : '#666'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => onDeleteType(type.id)}
              testID={`delete-type-${type.id}`}
              disabled={isLocked}
            >
              <Trash2 size={18} color={isLocked ? '#ccc' : '#FF3B30'} />
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {/* Color Picker Modal */}
      <Modal
        visible={colorPickerType !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setColorPickerType(null)}
      >
        <Pressable style={colorPickerStyles.modalOverlay} onPress={() => setColorPickerType(null)}>
          <Pressable style={colorPickerStyles.colorPickerContainer} onPress={(e) => e.stopPropagation()}>
            <Text style={colorPickerStyles.title}>Select Color</Text>
            <View style={colorPickerStyles.colorGrid}>
              {colorPalette.map((color) => (
                <TouchableOpacity
                  key={color}
                  style={[colorPickerStyles.colorOption, { backgroundColor: color }]}
                  onPress={() => {
                    if (colorPickerType) {
                      onUpdateType(colorPickerType, { color });
                      setColorPickerType(null);
                    }
                  }}
                  testID={`color-option-${color}`}
                >
                  {types.find(t => t.id === colorPickerType)?.color === color && (
                    <Check size={24} color="#333" strokeWidth={3} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={colorPickerStyles.closeButton}
              onPress={() => setColorPickerType(null)}
            >
              <Text style={colorPickerStyles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

interface PromosListProps {
  promos: Promo[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  onEditPromo: (promo: Promo) => void;
  onDeletePromo: (promoId: string) => void;
  isLocked: boolean;
}

function PromosList({ promos, onReorder, onEditPromo, onDeletePromo, isLocked }: PromosListProps) {
  const { productTypes, settings } = useSales();

  const handleMoveUp = (index: number) => {
    if (index > 0) {
      onReorder(index, index - 1);
    }
  };

  const handleMoveDown = (index: number) => {
    if (index < promos.length - 1) {
      onReorder(index, index + 1);
    }
  };

  const getPromoLabel = (promo: Promo) => {
    return promo.name;
  };

  const getPromoDescription = (promo: Promo) => {
    if (promo.mode === 'type_list' && promo.typeId) {
      const type = productTypes.find(t => t.id === promo.typeId);
      return `${type?.name || 'Type'} - up to ${promo.maxQuantity} items`;
    }
    if (promo.mode === 'combo' && promo.comboProductIds) {
      return `Combo - ${promo.comboProductIds.length} products • ${CURRENCIES[settings.currency].symbol}${promo.comboPrice?.toFixed(2) || '0.00'}`;
    }
    return `Combo`;
  };

  return (
    <>
      {promos.map((promo, index) => (
        <View key={promo.id} style={styles.productItem}>
          <View style={styles.reorderControls}>
            <TouchableOpacity
              style={[styles.reorderButton, (index === 0 || isLocked) && styles.reorderButtonDisabled]}
              onPress={() => handleMoveUp(index)}
              disabled={index === 0 || isLocked}
            >
              <ChevronUp size={16} color={(index === 0 || isLocked) ? '#ccc' : '#666'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.reorderButton, (index === promos.length - 1 || isLocked) && styles.reorderButtonDisabled]}
              onPress={() => handleMoveDown(index)}
              disabled={index === promos.length - 1 || isLocked}
            >
              <ChevronDown size={16} color={(index === promos.length - 1 || isLocked) ? '#ccc' : '#666'} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.productTouchable}
            onPress={() => onEditPromo(promo)}
            disabled={isLocked}
          >
            <View style={styles.productInfo}>
              <Text style={styles.productName}>{getPromoLabel(promo)}</Text>
              <Text style={styles.productPrice}>
                {getPromoDescription(promo)} • {Object.keys(promo.prices).length} tiers
              </Text>
            </View>
          </TouchableOpacity>

          <View style={styles.actionIcons}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => onDeletePromo(promo.id)}
              testID={`delete-promo-${promo.id}`}
              disabled={isLocked}
            >
              <Trash2 size={18} color={isLocked ? '#ccc' : '#FF3B30'} />
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </>
  );
}

interface SimpleProductItemProps {
  product: Product;
  index: number;
  totalProducts: number;
  onEditProduct: (product: Product) => void;
  onUpdateProduct: (product: Product, updates: Partial<Product>) => void;
  onDeleteProduct: (productId: string) => void;
  onDuplicateProduct: (product: Product) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
  currency: Currency;
  isLocked: boolean;
}

function SimpleProductItem({
  product,
  index,
  totalProducts,
  onEditProduct,
  onUpdateProduct,
  onDeleteProduct,
  onDuplicateProduct,
  onMoveUp,
  onMoveDown,
  currency,
  isLocked,
}: SimpleProductItemProps) {
  const { productTypes } = useSales();
  
  // Get background color based on product type
  const getBackgroundColor = () => {
    const type = productTypes.find((t) => t.id === product.typeId);
    return type?.color || '#f9f9f9';
  };

  const handleDelete = () => {
    onDeleteProduct(product.id);
  };

  const handleDuplicate = () => {
    onDuplicateProduct(product);
  };

  return (
    <View style={[styles.productItem, { backgroundColor: getBackgroundColor() }]}>
      {/* Reorder Controls */}
      <View style={styles.reorderControls}>
        <TouchableOpacity 
          style={[styles.reorderButton, (index === 0 || isLocked) && styles.reorderButtonDisabled]}
          onPress={() => onMoveUp(index)}
          disabled={index === 0 || isLocked}
        >
          <ChevronUp size={16} color={(index === 0 || isLocked) ? '#ccc' : '#666'} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.reorderButton, (index === totalProducts - 1 || isLocked) && styles.reorderButtonDisabled]}
          onPress={() => onMoveDown(index)}
          disabled={index === totalProducts - 1 || isLocked}
        >
          <ChevronDown size={16} color={(index === totalProducts - 1 || isLocked) ? '#ccc' : '#666'} />
        </TouchableOpacity>
      </View>
      
      <TouchableOpacity 
        style={styles.productTouchable}
        onPress={() => onEditProduct(product)}
        testID={`product-item-${product.id}`}
        disabled={isLocked}
      >
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
          <Text style={styles.productPrice}>
            {CURRENCIES[currency].symbol}{product.price.toFixed(2)}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={styles.productControls}>
        <View style={styles.switchesContainer}>
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Enabled</Text>
            <Switch
              value={product.enabled}
              onValueChange={(value) => {
                onUpdateProduct(product, { enabled: value });
              }}
              testID={`product-${product.id}-enabled`}
              style={styles.thinSwitch}
              disabled={isLocked}
            />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Promo</Text>
            <Switch
              value={product.promoEligible}
              onValueChange={(value) => {
                onUpdateProduct(product, { promoEligible: value });
              }}
              testID={`product-${product.id}-promo`}
              style={styles.thinSwitch}
              disabled={isLocked}
            />
          </View>
        </View>
      </View>
      
      {/* Action Icons - moved to the right */}
      <View style={styles.actionIcons}>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={handleDuplicate}
          testID={`duplicate-${product.id}`}
          disabled={isLocked}
        >
          <Files size={18} color={isLocked ? '#ccc' : '#007AFF'} />
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={handleDelete}
          testID={`delete-${product.id}`}
          disabled={isLocked}
        >
          <Trash2 size={18} color={isLocked ? '#ccc' : '#FF3B30'} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

interface SimpleProductListProps {
  products: Product[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  onEditProduct: (product: Product) => void;
  onUpdateProduct: (product: Product, updates: Partial<Product>) => void;
  onDeleteProduct: (productId: string) => void;
  onDuplicateProduct: (product: Product) => void;
  currency: Currency;
  isLocked: boolean;
}

function SimpleProductList({
  products,
  onReorder,
  onEditProduct,
  onUpdateProduct,
  onDeleteProduct,
  onDuplicateProduct,
  currency,
  isLocked,
}: SimpleProductListProps) {
  const handleMoveUp = (index: number) => {
    if (index > 0) {
      onReorder(index, index - 1);
    }
  };

  const handleMoveDown = (index: number) => {
    if (index < products.length - 1) {
      onReorder(index, index + 1);
    }
  };

  return (
    <>
      {products.map((product, index) => (
        <SimpleProductItem
          key={product.id}
          product={product}
          index={index}
          totalProducts={products.length}
          onEditProduct={onEditProduct}
          onUpdateProduct={onUpdateProduct}
          onDeleteProduct={onDeleteProduct}
          onMoveUp={handleMoveUp}
          onMoveDown={handleMoveDown}
          onDuplicateProduct={onDuplicateProduct}
          currency={currency}
          isLocked={isLocked}
        />
      ))}
    </>
  );
}