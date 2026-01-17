import createContextHook from '@nkzw/create-context-hook';
import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { databaseService } from './database';
import { User, Event } from '@/types/auth';

WebBrowser.maybeCompleteAuthSession();

export const [AuthProvider, useAuth] = createContextHook(() => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentEvent, setCurrentEvent] = useState<Event | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [googleAuthSuccess, setGoogleAuthSuccess] = useState(false);

  const [, response, promptAsync] = Google.useAuthRequest({
    iosClientId: '364250874736-qimqj4g3e9hg0h5av73eccjvop0r40ov.apps.googleusercontent.com',
    androidClientId: '364250874736-qimqj4g3e9hg0h5av73eccjvop0r40ov.apps.googleusercontent.com',
    webClientId: '364250874736-qimqj4g3e9hg0h5av73eccjvop0r40ov.apps.googleusercontent.com',
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

  useEffect(() => {
    if (response?.type === 'success') {
      const { authentication } = response;
      if (authentication?.accessToken) {
        processGoogleAuth(authentication.accessToken);
      }
    }
  }, [response, processGoogleAuth]);

  const loginWithGoogleWeb = useCallback(async (): Promise<boolean> => {
    return new Promise((resolve) => {
      const GOOGLE_CLIENT_ID = '364250874736-qimqj4g3e9hg0h5av73eccjvop0r40ov.apps.googleusercontent.com';
      
      // Check if GSI script is loaded
      const loadGSIScript = (): Promise<void> => {
        return new Promise((resolveScript, rejectScript) => {
          if ((window as any).google?.accounts) {
            resolveScript();
            return;
          }
          
          const script = document.createElement('script');
          script.src = 'https://accounts.google.com/gsi/client';
          script.async = true;
          script.defer = true;
          script.onload = () => resolveScript();
          script.onerror = () => rejectScript(new Error('Failed to load Google Sign-In'));
          document.head.appendChild(script);
        });
      };
      
      loadGSIScript()
        .then(() => {
          console.log('🔐 Initializing Google Sign-In...');
          
          const google = (window as any).google;
          
          const tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: 'openid email profile',
            callback: async (response: any) => {
              if (response.error) {
                console.error('❌ Google auth error:', response.error);
                setIsGoogleLoading(false);
                resolve(false);
                return;
              }
              
              if (response.access_token) {
                console.log('✅ Got access token from Google');
                const success = await processGoogleAuth(response.access_token);
                if (success) {
                  setGoogleAuthSuccess(true);
                }
                setIsGoogleLoading(false);
                resolve(success);
              } else {
                console.log('❌ No access token in response');
                setIsGoogleLoading(false);
                resolve(false);
              }
            },
          });
          
          console.log('🔐 Requesting access token...');
          tokenClient.requestAccessToken({ prompt: 'select_account' });
        })
        .catch((error) => {
          console.error('❌ Failed to load Google Sign-In:', error);
          setIsGoogleLoading(false);
          resolve(false);
        });
    });
  }, [processGoogleAuth]);

  const loginWithGoogle = useCallback(async (): Promise<boolean> => {
    try {
      console.log('🔐 Starting Google Sign-In...');
      setIsGoogleLoading(true);
      setGoogleAuthSuccess(false);
      
      if (Platform.OS === 'web') {
        return await loginWithGoogleWeb();
      } else {
        console.log('📱 Starting native Google Sign-In...');
        const result = await promptAsync();
        
        if (result?.type === 'success') {
          console.log('✅ Native sign-in successful, processing token...');
          const success = await processGoogleAuth(result.authentication!.accessToken);
          setIsGoogleLoading(false);
          return success;
        } else {
          console.log('❌ Native sign-in failed or cancelled:', result?.type);
          setIsGoogleLoading(false);
          return false;
        }
      }
    } catch (error) {
      console.error('❌ Google Sign-In error:', error);
      setIsGoogleLoading(false);
      return false;
    }
  }, [loginWithGoogleWeb, promptAsync, processGoogleAuth]);

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
    googleAuthRequest: Platform.OS === 'web' ? {} : null,
  };
});
