import createContextHook from '@nkzw/create-context-hook';
import { useState, useCallback } from 'react';
import { Alert } from 'react-native';

export type NavigationBlockerAction = () => Promise<void> | void;

export const [NavigationBlockerProvider, useNavigationBlocker] = createContextHook(() => {
  const [isBlocking, setIsBlocking] = useState(false);
  const [onSave, setOnSave] = useState<NavigationBlockerAction | null>(null);

  const enableBlocking = useCallback((saveAction: NavigationBlockerAction) => {
    console.log('🚫 Navigation blocking enabled');
    setIsBlocking(true);
    setOnSave(() => saveAction);
  }, []);

  const disableBlocking = useCallback(() => {
    console.log('✅ Navigation blocking disabled');
    setIsBlocking(false);
    setOnSave(null);
  }, []);

  const checkNavigation = useCallback((navigateAction: () => void): boolean => {
    if (!isBlocking) {
      console.log('✅ No blocking, navigating');
      navigateAction();
      return true;
    }

    console.log('🚫 Navigation blocked, showing alert');
    
    Alert.alert(
      'Unsaved Changes',
      'You have unsaved changes. Do you want to save them before leaving?',
      [
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            console.log('❌ Changes discarded');
            disableBlocking();
            navigateAction();
          },
        },
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            console.log('⏸️ Navigation cancelled');
          },
        },
        {
          text: 'Save',
          onPress: async () => {
            console.log('💾 Saving changes before navigation');
            if (onSave) {
              await onSave();
            }
            disableBlocking();
            navigateAction();
          },
        },
      ],
      { cancelable: false }
    );

    return false;
  }, [isBlocking, onSave, disableBlocking]);

  return {
    isBlocking,
    enableBlocking,
    disableBlocking,
    checkNavigation,
  };
});
