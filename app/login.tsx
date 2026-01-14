import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LogIn, UserPlus, KeyRound, Users, Chrome } from 'lucide-react-native';
import { useAuth } from '@/hooks/auth-store';
import Colors from '@/constants/colors';

export default function LoginScreen() {
  const { login, loginWithGoogle, isGoogleLoading, googleAuthSuccess, isAuthenticated } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter both username and password');
      return;
    }

    setIsLoading(true);
    console.log('🔐 Login attempt starting...');
    
    try {
      const loginPromise = login(username.trim(), password);
      const timeoutPromise = new Promise<boolean>((resolve) => {
        setTimeout(() => {
          console.log('⚠️ Login timeout after 10 seconds');
          resolve(false);
        }, 10000);
      });
      
      const success = await Promise.race([loginPromise, timeoutPromise]);
      
      setIsLoading(false);

      if (success) {
        console.log('✅ Login successful, navigating to event-manager');
        router.replace('/event-manager');
      } else {
        console.log('❌ Login failed');
        Alert.alert('Login Failed', 'Invalid username or password, or the request timed out. Please try again.');
      }
    } catch (error) {
      console.error('❌ Login error:', error);
      setIsLoading(false);
      Alert.alert('Error', 'An error occurred during login. Please try again.');
    }
  };

  const handleRegister = () => {
    router.push('/register');
  };

  const handleForgotPassword = () => {
    router.push('/forgot-password');
  };

  useEffect(() => {
    if (googleAuthSuccess && isAuthenticated) {
      console.log('✅ Google auth success detected, navigating to event-manager');
      router.replace('/event-manager');
    }
  }, [googleAuthSuccess, isAuthenticated]);

  const handleGoogleLogin = async () => {
    console.log('🔐 Google login button pressed');
    const success = await loginWithGoogle();
    if (success) {
      console.log('✅ Google login successful, navigating to event-manager');
      router.replace('/event-manager');
    }
  };

  const handleManageUsers = () => {
    router.push('/manage-users');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
          <View style={styles.header}>
            <Image
              source={{ uri: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/tgp5v3aq476tspxz96p49' }}
              style={styles.logo}
              resizeMode="contain"
            />
            <Text style={styles.subtitle}>Sign in to continue</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your username"
                placeholderTextColor="#999"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
              />
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                editable={!isLoading}
              />
            </View>

            <TouchableOpacity
              style={[styles.button, styles.loginButton, isLoading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={isLoading}
            >
              <LogIn size={20} color="#fff" />
              <Text style={styles.buttonText}>
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.registerButton]}
              onPress={handleRegister}
              disabled={isLoading}
            >
              <UserPlus size={20} color={Colors.primary} />
              <Text style={styles.registerButtonText}>Create Account</Text>
            </TouchableOpacity>

            <View style={styles.dividerContainer}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity
              style={[styles.button, styles.googleButton, isGoogleLoading && styles.buttonDisabled]}
              onPress={handleGoogleLogin}
              disabled={isLoading || isGoogleLoading}
            >
              <Chrome size={20} color="#fff" />
              <Text style={styles.buttonText}>
                {isGoogleLoading ? 'Signing in...' : 'Continue with Google'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.forgotPasswordButton}
              onPress={handleForgotPassword}
              disabled={isLoading}
            >
              <KeyRound size={16} color="#666" />
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.manageUsersButton}
              onPress={handleManageUsers}
              disabled={isLoading}
            >
              <Users size={16} color="#666" />
              <Text style={styles.manageUsersText}>Manage Users</Text>
            </TouchableOpacity>
          </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 48,
    alignItems: 'center',
  },
  logo: {
    width: 250,
    height: 60,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
  form: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    gap: 8,
  },
  loginButton: {
    backgroundColor: Colors.primary,
    marginTop: 8,
  },
  registerButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  googleButton: {
    backgroundColor: '#4285F4',
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#e0e0e0',
  },
  dividerText: {
    marginHorizontal: 12,
    color: '#999',
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  registerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
  },
  forgotPasswordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    gap: 6,
    marginTop: 8,
  },
  forgotPasswordText: {
    fontSize: 14,
    color: '#666',
  },
  manageUsersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    gap: 6,
  },
  manageUsersText: {
    fontSize: 14,
    color: '#666',
  },
});
