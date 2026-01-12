import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback } from 'react';
import { databaseService } from './database';
import { User, Event } from '@/types/auth';

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const loadAuthState = async () => {
      try {
        console.log('🔐 Loading authentication state...');
        
        const timeoutPromise = new Promise<void>((resolve) => {
          setTimeout(() => {
            console.warn('⚠️ Auth loading timeout after 5s, proceeding as unauthenticated');
            resolve();
          }, 5000);
        });

        const authPromise = (async () => {
          console.log('🔄 Starting auth initialization...');
          const userId = await databaseService.getCurrentUser();
          console.log('🔍 Current user ID:', userId || 'none');
          
          if (userId) {
            console.log('🔍 Fetching user data...');
            const user = await databaseService.getUserByUsername(userId);
            if (user) {
              setCurrentUser(user);
              setIsAuthenticated(true);
              console.log('✅ User authenticated:', user.username);
              
              console.log('🔍 Fetching current event...');
              const eventId = await databaseService.getCurrentEvent();
              if (eventId) {
                console.log('🔍 Loading event data:', eventId);
                const eventData = await databaseService.loadEventData(eventId);
                if (eventData) {
                  setCurrentEvent(eventData.event);
                  console.log('✅ Event loaded:', eventData.event.eventName);
                } else {
                  console.log('⚠️ Event data not found');
                }
              } else {
                console.log('ℹ️ No current event set');
              }
            } else {
              console.log('⚠️ User data not found for ID:', userId);
            }
          } else {
            console.log('ℹ️ No current user found');
          }
        })();

        await Promise.race([authPromise, timeoutPromise]);
      } catch (error) {
        console.error('❌ Error loading auth state:', error);
      } finally {
        setIsLoading(false);
        console.log('✅ Auth loading complete');
      }
    };

    loadAuthState();
  }, []);

  const hashPassword = useCallback((password: string): string => {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
      const char = password.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString();
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<boolean> => {
    try {
      console.log('🔐 Attempting login for:', username);
      
      const user = await databaseService.getUserByUsername(username);
      if (!user) {
        console.log('❌ User not found');
        return false;
      }

      const passwordHash = hashPassword(password);
      if (user.passwordHash !== passwordHash) {
        console.log('❌ Invalid password');
        return false;
      }

      setCurrentUser(user);
      setIsAuthenticated(true);
      await databaseService.saveCurrentUser(user.id);
      console.log('✅ Login successful');
      return true;
    } catch (error) {
      console.error('❌ Login error:', error);
      return false;
    }
  }, [hashPassword]);

  const register = useCallback(async (username: string, password: string, email: string = '', fullName: string = ''): Promise<boolean> => {
    try {
      console.log('📝 Attempting registration for:', username);
      
      const existingUser = await databaseService.getUserByUsername(username);
      if (existingUser) {
        console.log('❌ Username already exists');
        return false;
      }

      const passwordHash = hashPassword(password);
      const user = await databaseService.createUser(username, passwordHash, email, fullName);
      
      setCurrentUser(user);
      setIsAuthenticated(true);
      await databaseService.saveCurrentUser(user.id);
      console.log('✅ Registration successful');
      return true;
    } catch (error) {
      console.error('❌ Registration error:', error);
      return false;
    }
  }, [hashPassword]);

  const logout = useCallback(async () => {
    try {
      console.log('🚪 Logging out...');
      await databaseService.clearCurrentUser();
      await databaseService.clearCurrentEvent();
      setCurrentUser(null);
      setCurrentEvent(null);
      setIsAuthenticated(false);
      console.log('✅ Logout successful');
    } catch (error) {
      console.error('❌ Logout error:', error);
    }
  }, []);

  const selectEvent = useCallback(async (eventId: string, loadIntoStore?: (eventId: string) => Promise<boolean>) => {
    try {
      console.log('📅 Selecting event:', eventId);
      const eventData = await databaseService.loadEventData(eventId);
      if (eventData) {
        setCurrentEvent(eventData.event);
        await databaseService.saveCurrentEvent(eventId);
        const isLocked = !!eventData.event.templatePin;
        console.log('✅ Event selected:', eventData.event.eventName, isLocked ? '(LOCKED)' : '');
        
        if (loadIntoStore) {
          await loadIntoStore(eventId);
        }
        
        return eventData;
      }
      return null;
    } catch (error) {
      console.error('❌ Error selecting event:', error);
      return null;
    }
  }, []);

  const clearCurrentEvent = useCallback(async () => {
    try {
      await databaseService.clearCurrentEvent();
      setCurrentEvent(null);
      console.log('✅ Current event cleared');
    } catch (error) {
      console.error('❌ Error clearing current event:', error);
    }
  }, []);

  return {
    currentUser,
    currentEvent,
    isLoading,
    isAuthenticated,
    login,
    register,
    logout,
    selectEvent,
    clearCurrentEvent,
  };
});
