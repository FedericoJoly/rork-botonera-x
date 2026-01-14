import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback } from 'react';
import { databaseService } from './database';
import { User, Event } from '@/types/auth';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';


WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = '364250874736-727uosq13mcv0jjomvc8rh85jekb8b82.apps.googleusercontent.com';
const GOOGLE_IOS_CLIENT_ID = '364250874736-727uosq13mcv0jjomvc8rh85jekb8b82.apps.googleusercontent.com';
const GOOGLE_ANDROID_CLIENT_ID = '364250874736-727uosq13mcv0jjomvc8rh85jekb8b82.apps.googleusercontent.com';

console.log('🔗 Google Cloud Console configuration:');
console.log('   JavaScript Origins: https://auth.expo.io');
console.log('   Redirect URIs: https://auth.expo.io/@anonymous/botoneraX');

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
    redirectUri: 'https://auth.expo.io/@anonymous/botoneraX',
  });

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

  const processGoogleAuth = useCallback(async (accessToken: string): Promise<boolean> => {
    try {
      console.log('🔍 Fetching Google user info...');
      const userInfoResponse = await fetch(
        'https://www.googleapis.com/userinfo/v2/me',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      
      const googleUser = await userInfoResponse.json();
      console.log('📧 Google user:', googleUser.email);
      
      let user = await databaseService.getUserByEmail(googleUser.email);
      
      if (!user) {
        console.log('📝 Creating new user from Google account...');
        user = await databaseService.createUserFromGoogle(
          googleUser.id,
          googleUser.email,
          googleUser.name || googleUser.email.split('@')[0],
          googleUser.picture
        );
      } else {
        console.log('✅ Found existing user:', user.username);
      }
      
      setCurrentUser(user);
      setIsAuthenticated(true);
      await databaseService.saveCurrentUser(user.id);
      console.log('✅ Google Sign-In successful');
      return true;
    } catch (error) {
      console.error('❌ Error processing Google auth:', error);
      return false;
    }
  }, []);

  const [googleAuthSuccess, setGoogleAuthSuccess] = useState(false);

  useEffect(() => {
    const handleResponse = async () => {
      if (response?.type === 'success') {
        const { authentication } = response;
        if (authentication?.accessToken) {
          setIsGoogleLoading(true);
          const success = await processGoogleAuth(authentication.accessToken);
          setIsGoogleLoading(false);
          if (success) {
            setGoogleAuthSuccess(true);
          }
        }
      } else if (response?.type === 'error' || response?.type === 'dismiss') {
        console.log('❌ Google Sign-In cancelled or failed:', response.type);
        setIsGoogleLoading(false);
      }
    };
    
    handleResponse();
  }, [response, processGoogleAuth]);

  const loginWithGoogle = useCallback(async (): Promise<boolean> => {
    try {
      console.log('🔐 Starting Google Sign-In...');
      setIsGoogleLoading(true);
      setGoogleAuthSuccess(false);
      
      const result = await promptAsync();
      
      if (result?.type === 'success') {
        const { authentication } = result;
        
        if (authentication?.accessToken) {
          const success = await processGoogleAuth(authentication.accessToken);
          setIsGoogleLoading(false);
          return success;
        }
      }
      
      console.log('❌ Google Sign-In cancelled or failed');
      setIsGoogleLoading(false);
      return false;
    } catch (error) {
      console.error('❌ Google Sign-In error:', error);
      setIsGoogleLoading(false);
      return false;
    }
  }, [promptAsync, processGoogleAuth]);

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
    isGoogleLoading,
    googleAuthSuccess,
    login,
    loginWithGoogle,
    register,
    logout,
    selectEvent,
    clearCurrentEvent,
    googleAuthRequest: request,
  };
});
