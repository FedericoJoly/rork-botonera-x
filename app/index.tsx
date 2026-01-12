import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/hooks/auth-store';
import Colors from '@/constants/colors';

export default function IndexScreen() {
  const { isAuthenticated, isLoading, currentEvent } = useAuth();
  const [shouldRedirect, setShouldRedirect] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      console.log('🔀 Index redirect:', { isAuthenticated, hasEvent: !!currentEvent });
      setShouldRedirect(true);
    }
  }, [isLoading, isAuthenticated, currentEvent]);

  if (shouldRedirect && !isLoading) {
    if (!isAuthenticated) {
      console.log('🔀 Redirecting to login');
      return <Redirect href="/login" />;
    }
    if (!currentEvent) {
      console.log('🔀 Redirecting to event manager');
      return <Redirect href="/event-manager" />;
    }
    console.log('🔀 Redirecting to panel');
    return <Redirect href="/panel" />;
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
});
