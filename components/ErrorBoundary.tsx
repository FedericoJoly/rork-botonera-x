import React, { Component, ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import Colors from '@/constants/colors';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('🔴 Error Boundary caught an error:', error);
    console.error('🔴 Error Info:', errorInfo);
    
    this.setState({
      error,
      errorInfo: errorInfo.componentStack || String(errorInfo),
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.errorContainer}>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>
              The app encountered an error and needs to restart.
            </Text>
            
            <ScrollView style={styles.detailsContainer}>
              <Text style={styles.errorTitle}>Error Details:</Text>
              <Text style={styles.errorText}>
                {this.state.error?.message || 'Unknown error'}
              </Text>
              
              {this.state.errorInfo && (
                <>
                  <Text style={styles.errorTitle}>Stack Trace:</Text>
                  <Text style={styles.errorText}>{this.state.errorInfo}</Text>
                </>
              )}
            </ScrollView>

            <TouchableOpacity style={styles.button} onPress={this.handleReset}>
              <Text style={styles.buttonText}>Try Again</Text>
            </TouchableOpacity>

            <Text style={styles.helpText}>
              If this error persists:{'\n'}
              1. Close and reopen the app{'\n'}
              2. Clear app cache in settings{'\n'}
              3. Reinstall the app if needed
            </Text>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 24,
    maxWidth: 500,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#dc3545',
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 24,
  },
  detailsContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
    maxHeight: 200,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#495057',
    marginTop: 8,
    marginBottom: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#6c757d',
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  button: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  helpText: {
    fontSize: 12,
    color: '#6c757d',
    textAlign: 'center',
    lineHeight: 20,
  },
});
