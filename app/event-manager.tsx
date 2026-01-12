import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Modal,
  FlatList,
  TextInput,
  Image,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Plus, Copy, FolderOpen, LogOut, Edit2, Trash2, Lock, Unlock, Upload } from 'lucide-react-native';
import { useAuth } from '@/hooks/auth-store';
import { useSales } from '@/hooks/sales-store';
import { databaseService } from '@/hooks/database';
import { Event } from '@/types/auth';
import Colors from '@/constants/colors';

export default function EventManagerScreen() {
  const { currentUser, logout, selectEvent } = useAuth();
  const { loadEventData, clearEventData } = useSales();

  const [events, setEvents] = useState<Event[]>([]);
  const [showEventList, setShowEventList] = useState(false);
  const [listMode, setListMode] = useState<'load' | 'duplicate'>('load');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newEventName, setNewEventName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importEventName, setImportEventName] = useState('');
  const [importData, setImportData] = useState<any>(null);

  const loadUserEvents = useCallback(async () => {
    if (!currentUser) return;
    
    try {
      console.log('📅 Loading events for user:', currentUser.id);
      console.log('📅 User info:', currentUser);
      
      // Debug: Check all events in database
      await databaseService.debugAllEvents();
      
      const userEvents = await databaseService.getUserEvents(currentUser.id);
      console.log(`📅 Found ${userEvents.length} events for user ${currentUser.id}:`, userEvents.map(e => ({ id: e.id, name: e.eventName, userId: e.userId, isTemplate: e.isTemplate })));
      setEvents(userEvents);
      
      // If no events found, show helpful message
      if (userEvents.length === 0) {
        console.log('⚠️ No events found for user. Checking if there are ANY events in database...');
        const allEvents = await databaseService.getAllEvents();
        console.log(`⚠️ Total events in database: ${allEvents.length}`);
        if (allEvents.length > 0) {
          console.log('⚠️ Events exist but not for this user. Event owners:', allEvents.map(e => ({ id: e.id, name: e.eventName, userId: e.userId })));
        }
      }
    } catch (error) {
      console.error('Error loading events:', error);
    }
  }, [currentUser]);





  useEffect(() => {
    const initialize = async () => {
      console.log('🔍 === INITIALIZING EVENT MANAGER ===');
      
      // DEBUGGING: Check what events exist BEFORE cleanup
      console.log('\n🔍 === PRE-CLEANUP STATE ===');
      const preCleanupEvents = await databaseService.getAllEvents();
      console.log(`📦 Total events BEFORE cleanup: ${preCleanupEvents.length}`);
      preCleanupEvents.forEach(e => {
        console.log(`   - "${e.eventName}" (ID: ${e.id}, User: ${e.userId}, Template: ${e.isTemplate})`);
      });
      const unnamedCount = preCleanupEvents.filter(e => !e.eventName || e.eventName.trim() === '' || e.eventName === 'Unnamed Event').length;
      console.log(`🗑️ Found ${unnamedCount} unnamed events to clean`);
      console.log('🔍 === END PRE-CLEANUP STATE ===\n');
      
      // Delete all unnamed events
      console.log('\n🧹 === CLEANING UP UNNAMED EVENTS ===');
      const cleanupResult = await databaseService.deleteAllUnnamedEvents();
      console.log(`🧹 Cleanup result: ${cleanupResult.message}`);
      console.log('🧹 === CLEANUP COMPLETE ===\n');
      
      // DEBUGGING: Verify cleanup worked
      console.log('\n🔍 === POST-CLEANUP VERIFICATION ===');
      const postCleanupEvents = await databaseService.getAllEvents();
      console.log(`📦 Total events AFTER cleanup: ${postCleanupEvents.length}`);
      postCleanupEvents.forEach(e => {
        console.log(`   - "${e.eventName}" (ID: ${e.id}, User: ${e.userId}, Template: ${e.isTemplate})`);
      });
      const stillUnnamedCount = postCleanupEvents.filter(e => !e.eventName || e.eventName.trim() === '' || e.eventName === 'Unnamed Event').length;
      if (stillUnnamedCount > 0) {
        console.error(`❌ CLEANUP FAILED! Still ${stillUnnamedCount} unnamed events remaining`);
      } else {
        console.log('✅ All unnamed events successfully removed');
      }
      console.log('🔍 === END POST-CLEANUP VERIFICATION ===\n');
      
      // Load user events
      await loadUserEvents();
      
      console.log('✅ === EVENT MANAGER INITIALIZED ===');
    };
    
    initialize();
  }, [loadUserEvents, currentUser]);

  const handleCreateNewEvent = async () => {
    setNewEventName('New Event');
    setShowCreateModal(true);
  };
  
  const handleConfirmCreate = async () => {
    if (!currentUser || !newEventName.trim()) {
      Alert.alert('Error', 'Please enter an event name');
      return;
    }
    
    try {
      console.log('🆕 Creating completely empty event...');
      
      clearEventData();
      
      const emptySettings = {
        userName: currentUser.username,
        eventName: newEventName.trim(),
        currency: 'EUR' as const,
        currencyRoundUp: true,
        isSetupComplete: false,
        appPromoPricing: {
          maxAppsForPromo: 7,
          prices: { 2: 50, 3: 75, 4: 90, 5: 110, 6: 130, 7: 150 }
        }
      };
      
      const event = await databaseService.createEvent(
        currentUser.id,
        newEventName.trim(),
        currentUser.username,
        emptySettings
      );

      await databaseService.saveEventData(event.id, [], [], [], [], emptySettings);
      await databaseService.saveCurrentEvent(event.id);
      
      console.log('✅ Empty event created, now loading it into memory...');
      const eventLoaded = await selectEvent(event.id, loadEventData);
      
      if (!eventLoaded) {
        Alert.alert('Error', 'Event created but failed to load. Please try loading it from the event list.');
        return;
      }
      
      console.log('✅ Event created and loaded successfully');
      setShowCreateModal(false);
      setNewEventName('');
      router.replace('/setup');
    } catch (error: any) {
      console.error('❌ Error creating event:', error);
      Alert.alert('Error', error?.message || 'Failed to create new event');
    }
  };

  const handleDuplicateEventDirect = async (event: Event) => {
    Alert.prompt(
      'Duplicate Event',
      'Enter name for the duplicated event:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Duplicate',
          onPress: async (newName?: string) => {
            if (!newName || !newName.trim()) {
              Alert.alert('Error', 'Event name cannot be empty');
              return;
            }

            try {
              if (!currentUser) return;

              const eventData = await databaseService.loadEventData(event.id);
              if (!eventData) {
                Alert.alert('Error', 'Failed to load event data');
                return;
              }

              const newEvent = await databaseService.createEvent(
                currentUser.id,
                newName.trim(),
                event.userName,
                eventData.settings
              );

              const updatedSettings = {
                ...eventData.settings,
                eventName: newName.trim()
              };

              await databaseService.saveEventData(
                newEvent.id,
                eventData.products,
                eventData.transactions,
                eventData.productTypes,
                eventData.settings.promos,
                updatedSettings
              );

              Alert.alert('Success', 'Event duplicated successfully');
              await loadUserEvents();
            } catch (error: any) {
              console.error('Error duplicating event:', error);
              Alert.alert('Error', error?.message || 'Failed to duplicate event');
            }
          }
        }
      ],
      'plain-text',
      `${event.eventName} (Copy)`
    );
  };

  const handleLoadEvent = () => {
    setListMode('load');
    setShowEventList(true);
  };

  const handleEventSelect = async (event: Event) => {
    // For template events without lock (pure templates)
    if (event.isTemplate && !event.templatePin && listMode === 'load') {
      Alert.alert(
        'Template Event',
        'This is a read-only template event. You can view it but cannot make changes. Would you like to duplicate it instead?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'View Only', onPress: async () => {
            setShowEventList(false);
            setListMode('load');
            const eventData = await selectEvent(event.id, loadEventData);
            if (eventData) {
              router.replace('/panel');
            } else {
              Alert.alert('Error', 'Failed to load event');
            }
          }},
          { text: 'Duplicate', onPress: () => handleDuplicateEventDirect(event) }
        ]
      );
      return;
    }
    
    if (listMode === 'duplicate') {
      Alert.prompt(
        'Duplicate Event',
        'Enter name for the duplicated event:',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Duplicate',
            onPress: async (newName?: string) => {
              if (!newName || !newName.trim()) {
                Alert.alert('Error', 'Event name cannot be empty');
                return;
              }

              try {
                if (!currentUser) return;

                const eventData = await databaseService.loadEventData(event.id);
                if (!eventData) {
                  Alert.alert('Error', 'Failed to load event data');
                  return;
                }

                const newEvent = await databaseService.createEvent(
                  currentUser.id,
                  newName.trim(),
                  event.userName,
                  eventData.settings
                );

                const updatedSettings = {
                  ...eventData.settings,
                  eventName: newName.trim()
                };

                await databaseService.saveEventData(
                  newEvent.id,
                  eventData.products,
                  eventData.transactions,
                  eventData.productTypes,
                  eventData.settings.promos,
                  updatedSettings
                );

                Alert.alert('Success', 'Event duplicated successfully');
                await loadUserEvents();
                setShowEventList(false);
                setListMode('load');
              } catch (error) {
                console.error('Error duplicating event:', error);
                Alert.alert('Error', 'Failed to duplicate event');
              }
            }
          }
        ],
        'plain-text',
        `${event.eventName} (Copy)`
      );
    } else {
      setShowEventList(false);
      setListMode('load');
      const eventData = await selectEvent(event.id, loadEventData);
      if (eventData) {
        router.replace('/panel');
      } else {
        Alert.alert('Error', 'Failed to load event');
      }
    }
  };



  const handleImportEvent = async () => {
    try {
      console.log('📥 Starting document picker...');
      
      if (Platform.OS === 'web') {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e: any) => {
          const file = e.target.files[0];
          if (!file) return;
          
          const reader = new FileReader();
          reader.onload = (event: any) => {
            try {
              const data = JSON.parse(event.target.result);
              setImportFileName(file.name);
              setImportEventName(data.settings?.eventName || 'Imported Event');
              setImportData(data);
              setShowImportModal(true);
            } catch {
              Alert.alert('Error', 'Invalid file format');
            }
          };
          reader.readAsText(file);
        };
        input.click();
      } else {
        const result = await DocumentPicker.getDocumentAsync({
          type: 'application/json',
          copyToCacheDirectory: true
        });
        
        console.log('📥 Document picker result:', result);
        
        if (result.canceled) {
          console.log('User cancelled document picker');
          return;
        }
        
        const asset = result.assets[0];
        const file = new File(asset.uri);
        const content = file.textSync();
        const data = JSON.parse(content);
        
        setImportFileName(asset.name);
        setImportEventName(data.settings?.eventName || 'Imported Event');
        setImportData(data);
        setShowImportModal(true);
      }
    } catch (error) {
      console.error('❌ Import error:', error);
      Alert.alert('Error', `Failed to import file: ${error}`);
    }
  };

  const handleConfirmImport = async () => {
    if (!importEventName.trim()) {
      Alert.alert('Error', 'Please enter an event name');
      return;
    }
    
    if (!importData) {
      Alert.alert('Error', 'No data to import');
      return;
    }

    try {
      console.log('📥 Importing event data...');
      
      if (!currentUser) {
        Alert.alert('Error', 'No user logged in');
        return;
      }

      const importedSettings = {
        ...importData.settings,
        eventName: importEventName.trim(),
        promos: importData.promos || []
      };
      
      const newEvent = await databaseService.createEvent(
        currentUser.id,
        importEventName.trim(),
        currentUser.username,
        importedSettings
      );
      
      const importedTransactions = (importData.transactions || []).map((t: any) => ({
        ...t,
        timestamp: new Date(t.timestamp)
      }));
      
      await databaseService.saveEventData(
        newEvent.id,
        importData.products || [],
        importedTransactions,
        importData.productTypes || [],
        importData.promos || [],
        importedSettings
      );
      
      console.log('✅ Event imported successfully');
      setShowImportModal(false);
      setImportData(null);
      setImportFileName('');
      setImportEventName('');
      
      Alert.alert(
        'Success',
        `Event "${importEventName}" imported successfully with ${importData.products?.length || 0} products and ${importData.transactions?.length || 0} transactions.`,
        [
          {
            text: 'OK',
            onPress: async () => {
              await loadUserEvents();
            }
          }
        ]
      );
    } catch (error) {
      console.error('❌ Import error:', error);
      Alert.alert('Error', `Failed to import event: ${error}`);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            console.log('🚪 Logout button pressed');
            await logout();
            console.log('✅ Logout completed, navigating to login');
            router.replace('/login');
          }
        }
      ]
    );
  };

  const handleEditEvent = async (event: Event) => {
    if (event.isTemplate) {
      Alert.alert('Template Event', 'Template events cannot be edited. Please duplicate this event to make changes.');
      return;
    }
    
    Alert.prompt(
      'Edit Event Name',
      'Enter new event name:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async (text?: string) => {
            if (!text || !text.trim()) {
              Alert.alert('Error', 'Event name cannot be empty');
              return;
            }
            
            try {
              await databaseService.updateEventName(event.id, text.trim());
              Alert.alert('Success', 'Event name updated successfully');
              await loadUserEvents();
            } catch (error: any) {
              console.error('Error editing event:', error);
              Alert.alert('Error', error?.message || 'Failed to update event name');
            }
          }
        }
      ],
      'plain-text',
      event.eventName
    );
  };

  const handleMakeTemplate = (event: Event) => {
    if (event.isTemplate) {
      Alert.alert('Already Template', 'This event is already a template.');
      return;
    }

    Alert.prompt(
      'Set Template PIN',
      'Enter a PIN to protect this template event:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Set PIN',
          onPress: async (pin?: string) => {
            if (!pin || pin.trim() === '') {
              Alert.alert('Error', 'PIN cannot be empty');
              return;
            }

            try {
              await databaseService.markEventAsTemplate(event.id);
              await databaseService.setEventTemplatePin(event.id, pin);
              Alert.alert('Success', 'Event marked as template with PIN protection');
              await loadUserEvents();
            } catch (error: any) {
              console.error('Error making template:', error);
              Alert.alert('Error', error?.message || 'Failed to make template');
            }
          }
        }
      ],
      'plain-text'
    );
  };
  
  const handleUnlockEvent = (event: Event) => {
    if (!event.templatePin) {
      Alert.alert('Not Locked', 'This event is not locked.');
      return;
    }

    Alert.prompt(
      'Unlock Event',
      'Enter PIN to unlock this event:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlock',
          onPress: async (pin?: string) => {
            if (!pin) {
              Alert.alert('Error', 'PIN is required');
              return;
            }

            try {
              const isValid = await databaseService.verifyEventTemplatePin(event.id, pin);
              if (!isValid) {
                Alert.alert('Error', 'Incorrect PIN');
                return;
              }

              await databaseService.unlockEvent(event.id);
              Alert.alert('Success', 'Event unlocked successfully');
              await loadUserEvents();
            } catch (error: any) {
              console.error('Error unlocking event:', error);
              Alert.alert('Error', error?.message || 'Failed to unlock event');
            }
          }
        }
      ],
      'plain-text'
    );
  };
  
  const handleDeleteEvent = (event: Event) => {
    if (event.templatePin) {
      Alert.prompt(
        'Template Event',
        'This event is protected. Enter PIN to delete:',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async (pin?: string) => {
              if (!pin) {
                Alert.alert('Error', 'PIN is required');
                return;
              }
              
              try {
                const isValid = await databaseService.verifyEventTemplatePin(event.id, pin);
                if (!isValid) {
                  Alert.alert('Error', 'Incorrect PIN');
                  return;
                }
                
                console.log('🗑️ Deleting protected event:', event.id);
                await databaseService.deleteEvent(event.id);
                console.log('✅ Event deleted successfully');
                Alert.alert('Success', 'Event deleted successfully');
                await loadUserEvents();
              } catch (error) {
                console.error('❌ Error deleting event:', error);
                Alert.alert('Error', 'Failed to delete event');
              }
            }
          }
        ],
        'plain-text'
      );
    } else {
      Alert.alert(
        'Delete Event',
        `Are you sure you want to delete "${event.eventName}"? This action cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                console.log('🗑️ Deleting event:', event.id);
                await databaseService.deleteEvent(event.id);
                console.log('✅ Event deleted successfully');
                Alert.alert('Success', 'Event deleted successfully');
                await loadUserEvents();
              } catch (error) {
                console.error('❌ Error deleting event:', error);
                Alert.alert('Error', 'Failed to delete event');
              }
            }
          }
        ]
      );
    }
  };
  
  const renderEventItem = ({ item }: { item: Event }) => (
    <View
      style={[
        styles.eventItem,
        item.isFinalized && styles.eventItemFinalized
      ]}
    >
      <TouchableOpacity
        style={styles.eventItemContent}
        onPress={() => handleEventSelect(item)}
      >
        <View style={styles.eventInfo}>
          <Text style={styles.eventName}>
            {item.eventName || 'Unnamed Event'}
          </Text>
          <Text style={styles.eventDetails}>
            {item.userName} • {new Date(item.updatedAt).toLocaleDateString()}
          </Text>
          {item.isFinalized && (
            <View style={styles.finalizedBadge}>
              <Text style={styles.finalizedText}>Finalized</Text>
            </View>
          )}
          {item.templatePin && (
            <View style={styles.lockedBadge}>
              <Text style={styles.lockedText}>PIN: {item.templatePin}</Text>
            </View>
          )}
        </View>
        <View style={styles.eventIdContainer}>
          <Text style={styles.eventIdLabel}>ID</Text>
          <Text style={styles.eventIdText}>{item.id}</Text>
        </View>
      </TouchableOpacity>
      
      <View style={styles.eventItemActions}>
        <TouchableOpacity
          style={styles.eventActionButton}
          onPress={() => handleEditEvent(item)}
        >
          <Edit2 size={18} color={Colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.eventActionButton}
          onPress={() => handleDuplicateEventDirect(item)}
        >
          <Copy size={18} color={Colors.primary} />
        </TouchableOpacity>
        {!item.isTemplate && !item.templatePin && (
          <TouchableOpacity
            style={styles.eventActionButton}
            onPress={() => handleMakeTemplate(item)}
          >
            <Lock size={18} color="#FF9800" />
          </TouchableOpacity>
        )}
        {item.templatePin && (
          <TouchableOpacity
            style={styles.eventActionButton}
            onPress={() => handleUnlockEvent(item)}
          >
            <Unlock size={18} color="#4CAF50" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.eventActionButton}
          onPress={() => handleDeleteEvent(item)}
        >
          <Trash2 size={18} color="#FF3B30" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image
            source={{ uri: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/tgp5v3aq476tspxz96p49' }}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.subtitle}>Welcome {currentUser?.fullName || currentUser?.username}!</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <LogOut size={24} color="#666" />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Event Actions</Text>
          </View>

          <TouchableOpacity
            style={[styles.actionButton, styles.createButton]}
            onPress={handleCreateNewEvent}
          >
            <Plus size={24} color="#fff" />
            <View style={styles.actionButtonContent}>
              <Text style={styles.actionButtonTitle}>Create New Event</Text>
              <Text style={styles.actionButtonDescription}>
                Start with a blank event
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.loadButton]}
            onPress={handleLoadEvent}
          >
            <FolderOpen size={24} color={Colors.primary} />
            <View style={styles.actionButtonContent}>
              <Text style={[styles.actionButtonTitle, styles.actionButtonTitleDark]}>
                Load Event
              </Text>
              <Text style={[styles.actionButtonDescription, styles.actionButtonDescriptionDark]}>
                Open an existing event
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.importButton]}
            onPress={handleImportEvent}
          >
            <Upload size={24} color="#fff" />
            <View style={styles.actionButtonContent}>
              <Text style={styles.actionButtonTitle}>
                Import Event
              </Text>
              <Text style={styles.actionButtonDescription}>
                Import from file
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Events</Text>
            <Text style={styles.eventCount}>({events.length} total)</Text>
          </View>
          {events.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No events yet</Text>
            </View>
          ) : (
            events.slice(0, 5).map((event) => (
              <View key={event.id}>
                {renderEventItem({ item: event })}
              </View>
            ))
          )}
          {events.length > 5 && (
            <TouchableOpacity
              style={styles.viewAllButton}
              onPress={handleLoadEvent}
            >
              <Text style={styles.viewAllButtonText}>View All {events.length} Events</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={showCreateModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.createModalTitle}>Create New Event</Text>
            <Text style={styles.modalLabel}>Event Name:</Text>
            <TextInput
              style={styles.modalInput}
              value={newEventName}
              onChangeText={setNewEventName}
              placeholder="Enter event name"
              autoFocus
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => setShowCreateModal(false)}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCreate]}
                onPress={handleConfirmCreate}
              >
                <Text style={[styles.modalButtonText, styles.modalButtonTextCreate]}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={showEventList}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEventList(false)}
      >
        <SafeAreaView style={styles.modalContainer} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {listMode === 'duplicate' ? 'Select Event to Duplicate' : 'Select Event to Load'}
            </Text>
            <TouchableOpacity onPress={() => {
              setShowEventList(false);
              setListMode('load');
              setSearchQuery('');
            }}>
              <Text style={styles.modalClose}>Close</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search events..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <FlatList
            data={events.filter(e => 
              e.eventName.toLowerCase().includes(searchQuery.toLowerCase()) ||
              e.userName.toLowerCase().includes(searchQuery.toLowerCase())
            )}
            keyExtractor={(item) => item.id}
            renderItem={renderEventItem}
            contentContainerStyle={styles.eventList}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>
                  {searchQuery ? `No events matching "${searchQuery}"` : 'No events found'}
                </Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>

      <Modal
        visible={showImportModal}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setShowImportModal(false);
          setImportData(null);
          setImportFileName('');
          setImportEventName('');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.createModalTitle}>Import Event</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.modalLabel}>File:</Text>
              <Text style={styles.fileNameText}>{importFileName}</Text>
            </View>
            
            <View style={styles.inputGroup}>
              <Text style={styles.modalLabel}>New Event Name:</Text>
              <TextInput
                style={styles.modalInput}
                value={importEventName}
                onChangeText={setImportEventName}
                placeholder="Enter event name"
                autoFocus
              />
            </View>
            
            {importData && (
              <View style={styles.importInfoBox}>
                <Text style={styles.importInfoTitle}>File contains:</Text>
                <Text style={styles.importInfoText}>• {importData.products?.length || 0} products</Text>
                <Text style={styles.importInfoText}>• {importData.productTypes?.length || 0} product types</Text>
                <Text style={styles.importInfoText}>• {importData.promos?.length || 0} promos</Text>
                <Text style={styles.importInfoText}>• {importData.transactions?.length || 0} transactions</Text>
                <Text style={styles.importInfoText}>• Currency: {importData.settings?.currency || 'N/A'}</Text>
              </View>
            )}
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  setShowImportModal(false);
                  setImportData(null);
                  setImportFileName('');
                  setImportEventName('');
                }}
              >
                <Text style={styles.modalButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonCreate]}
                onPress={handleConfirmImport}
              >
                <Text style={[styles.modalButtonText, styles.modalButtonTextCreate]}>Import</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerLeft: {
    flex: 1,
  },
  logo: {
    width: 200,
    height: 40,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  logoutButton: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  eventCount: {
    fontSize: 14,
    color: '#666',
  },
  viewAllButton: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  viewAllButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  searchContainer: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  searchInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    marginBottom: 12,
    gap: 16,
  },
  createButton: {
    backgroundColor: Colors.primary,
  },
  duplicateButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  loadButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  importButton: {
    backgroundColor: '#FF9500',
  },
  actionButtonContent: {
    flex: 1,
  },
  actionButtonTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  actionButtonTitleDark: {
    color: '#1a1a1a',
  },
  actionButtonDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  actionButtonDescriptionDark: {
    color: '#666',
  },
  eventItem: {
    flexDirection: 'column',
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  eventItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eventItemActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    justifyContent: 'flex-end',
  },
  eventActionButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  eventItemFinalized: {
    backgroundColor: '#f9f9f9',
  },
  eventInfo: {
    flex: 1,
  },
  eventName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  eventDetails: {
    fontSize: 14,
    color: '#666',
  },
  finalizedBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  finalizedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  templateBadge: {
    backgroundColor: '#FF9800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  templateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  lockedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#9C27B0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  lockedText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#999',
    marginTop: 12,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  modalClose: {
    fontSize: 16,
    color: Colors.primary,
    fontWeight: '600',
  },
  eventList: {
    padding: 24,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    maxWidth: 400,
  },
  createModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
    color: '#1a1a1a',
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
  modalButtonCreate: {
    backgroundColor: Colors.primary,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  modalButtonTextCreate: {
    color: '#fff',
  },
  eventIdContainer: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    minWidth: 60,
  },
  eventIdLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#999',
    marginBottom: 2,
  },
  eventIdText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#666',
  },
  inputGroup: {
    marginBottom: 16,
  },
  fileNameText: {
    fontSize: 14,
    color: '#666',
    padding: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  importInfoBox: {
    backgroundColor: '#F0F0F0',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  importInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  importInfoText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
});
