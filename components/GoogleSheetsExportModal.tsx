import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import { X, FolderOpen, ExternalLink, Check, FileSpreadsheet, AlertCircle, LogIn } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { exportToGoogleSheets } from '@/hooks/google-sheets-export';
import { Transaction, Product, AppSettings, ExchangeRates } from '@/types/sales';

WebBrowser.maybeCompleteAuthSession();

const WEB_CLIENT_ID = '364250874736-YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';

const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

interface Props {
  visible: boolean;
  onClose: () => void;
  exportData: {
    userName: string;
    eventName: string;
    transactions: Transaction[];
    products: Product[];
    settings: AppSettings;
    exchangeRates: ExchangeRates;
  };
}

const FOLDER_LINK_STORAGE_KEY = 'google_drive_folder_link';
const ACCESS_TOKEN_STORAGE_KEY = 'google_access_token';
const USER_EMAIL_STORAGE_KEY = 'google_user_email';

function GoogleSheetsExportModalContent({ visible, onClose, exportData }: Props) {
  const [folderLink, setFolderLink] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [result, setResult] = useState<{
    success: boolean;
    error?: string;
    spreadsheetUrl?: string;
  } | null>(null);

  const redirectUri = AuthSession.makeRedirectUri({
    preferLocalhost: false,
  });

  console.log('📱 Redirect URI:', redirectUri);

  const fetchUserInfo = async (token: string) => {
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.email) {
        setUserEmail(data.email);
        await AsyncStorage.setItem(USER_EMAIL_STORAGE_KEY, data.email);
        console.log('📧 User email:', data.email);
      }
    } catch (error) {
      console.error('Failed to fetch user info:', error);
    }
  };

  const loadSavedAuth = async () => {
    try {
      const savedToken = await AsyncStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
      const savedEmail = await AsyncStorage.getItem(USER_EMAIL_STORAGE_KEY);
      if (savedToken) {
        // Verify token is still valid
        const res = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + savedToken);
        if (res.ok) {
          setAccessToken(savedToken);
          if (savedEmail) setUserEmail(savedEmail);
          console.log('✅ Loaded saved Google auth');
        } else {
          // Token expired, clear it
          await AsyncStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
          await AsyncStorage.removeItem(USER_EMAIL_STORAGE_KEY);
        }
      }
    } catch (error) {
      console.log('Failed to load saved auth:', error);
    }
  };

  useEffect(() => {
    if (visible) {
      loadSavedFolderLink();
      loadSavedAuth();
      setResult(null);
    }
  }, [visible]);

  

  const loadSavedFolderLink = async () => {
    try {
      const saved = await AsyncStorage.getItem(FOLDER_LINK_STORAGE_KEY);
      if (saved) {
        setFolderLink(saved);
      }
    } catch (error) {
      console.log('Failed to load saved folder link:', error);
    }
  };

  const saveFolderLink = async (link: string) => {
    try {
      await AsyncStorage.setItem(FOLDER_LINK_STORAGE_KEY, link);
    } catch (error) {
      console.log('Failed to save folder link:', error);
    }
  };

  const handleSignIn = async () => {
    setIsAuthenticating(true);
    setResult(null);
    try {
      console.log('📱 Starting Google Sign-In...');
      console.log('📱 Using redirect URI:', redirectUri);
      
      const authRequestOptions: AuthSession.AuthRequestConfig = {
        clientId: WEB_CLIENT_ID,
        redirectUri,
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive.file',
          'https://www.googleapis.com/auth/userinfo.email',
        ],
        responseType: AuthSession.ResponseType.Token,
        usePKCE: false,
      };
      
      const authRequest = new AuthSession.AuthRequest(authRequestOptions);
      
      const response = await authRequest.promptAsync(discovery);
      
      console.log('📱 Auth response type:', response.type);
      
      if (response.type === 'success' && response.params?.access_token) {
        const token = response.params.access_token;
        console.log('✅ Got access token from Google');
        setAccessToken(token);
        AsyncStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
        fetchUserInfo(token);
      } else if (response.type === 'error') {
        console.error('❌ Auth error:', response.params);
        setResult({ success: false, error: response.params?.error_description || response.params?.error || 'Authentication failed' });
      } else if (response.type === 'dismiss' || response.type === 'cancel') {
        console.log('📱 Auth cancelled/dismissed');
      }
    } catch (error: any) {
      console.error('Sign in error:', error);
      setResult({ success: false, error: 'Failed to authenticate: ' + error.message });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignOut = async () => {
    setAccessToken(null);
    setUserEmail(null);
    setResult(null);
    await AsyncStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    await AsyncStorage.removeItem(USER_EMAIL_STORAGE_KEY);
  };

  const handleExport = async () => {
    if (!accessToken) {
      setResult({ success: false, error: 'Please sign in with Google first' });
      return;
    }

    setIsExporting(true);
    setResult(null);

    try {
      if (folderLink.trim()) {
        await saveFolderLink(folderLink.trim());
      }
      
      const exportResult = await exportToGoogleSheets(exportData, {
        folderLink: folderLink.trim() || undefined,
        accessToken,
      });

      setResult(exportResult);
    } catch (error: any) {
      setResult({ success: false, error: error.message || 'Export failed' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenSpreadsheet = () => {
    if (result?.spreadsheetUrl) {
      Linking.openURL(result.spreadsheetUrl);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        setFolderLink(text);
      }
    } catch (error) {
      console.log('Failed to paste from clipboard:', error);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.headerTitle}>
              <FileSpreadsheet size={24} color="#34A853" />
              <Text style={styles.title}>Export to Google Sheets</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {!accessToken ? (
              <>
                <View style={styles.instructionBox}>
                  <Text style={styles.instructionTitle}>Sign in with Google</Text>
                  <Text style={styles.instructionText}>
                    Sign in with your Google account to export your sales data directly to Google Sheets in your own Drive.
                  </Text>
                  <Text style={styles.redirectUriLabel}>Required redirect URI:</Text>
                  <Text style={styles.redirectUriText} selectable>{redirectUri}</Text>
                </View>

                <TouchableOpacity
                  style={[styles.signInButton, isAuthenticating && styles.buttonDisabled]}
                  onPress={handleSignIn}
                  disabled={isAuthenticating}
                >
                  {isAuthenticating ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <>
                      <LogIn size={20} color="white" />
                      <Text style={styles.signInButtonText}>Sign in with Google</Text>
                    </>
                  )}
                </TouchableOpacity>

                {result?.error && (
                  <View style={[styles.resultBox, styles.resultError]}>
                    <AlertCircle size={20} color="#dc3545" />
                    <Text style={styles.resultErrorText}>{result.error}</Text>
                  </View>
                )}
              </>
            ) : (
              <>
                <View style={styles.signedInBox}>
                  <View style={styles.signedInInfo}>
                    <Check size={20} color="#34A853" />
                    <View style={styles.signedInTextContainer}>
                      <Text style={styles.signedInText}>Signed in as</Text>
                      <Text style={styles.signedInEmail}>{userEmail || 'Google User'}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={handleSignOut}>
                    <Text style={styles.signOutText}>Sign out</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.inputSection}>
                  <Text style={styles.label}>Google Drive Folder Link (optional):</Text>
                  <Text style={styles.helperText}>
                    Paste a folder link to save the spreadsheet in a specific folder, or leave empty to save in your Drive root.
                  </Text>
                  <View style={styles.inputContainer}>
                    <FolderOpen size={20} color="#666" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="https://drive.google.com/drive/folders/..."
                      placeholderTextColor="#999"
                      value={folderLink}
                      onChangeText={setFolderLink}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                  <TouchableOpacity 
                    style={styles.pasteButton}
                    onPress={handlePasteFromClipboard}
                  >
                    <Text style={styles.pasteButtonText}>Paste from clipboard</Text>
                  </TouchableOpacity>
                </View>

                {result && (
                  <View style={[
                    styles.resultBox,
                    result.success ? styles.resultSuccess : styles.resultError
                  ]}>
                    {result.success ? (
                      <>
                        <Check size={20} color="#34A853" />
                        <View style={styles.resultContent}>
                          <Text style={styles.resultSuccessText}>
                            Spreadsheet exported successfully!
                          </Text>
                          {result.spreadsheetUrl && (
                            <TouchableOpacity 
                              style={styles.openLink}
                              onPress={handleOpenSpreadsheet}
                            >
                              <Text style={styles.openLinkText}>Open Spreadsheet</Text>
                              <ExternalLink size={16} color="#1a73e8" />
                            </TouchableOpacity>
                          )}
                        </View>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={20} color="#dc3545" />
                        <Text style={styles.resultErrorText}>{result.error}</Text>
                      </>
                    )}
                  </View>
                )}

                <TouchableOpacity
                  style={[
                    styles.exportButton,
                    isExporting && styles.exportButtonDisabled
                  ]}
                  onPress={handleExport}
                  disabled={isExporting}
                >
                  {isExporting ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <>
                      <FileSpreadsheet size={20} color="white" />
                      <Text style={styles.exportButtonText}>Export to Google Sheets</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function GoogleSheetsExportModal(props: Props) {
  if (Platform.OS === 'web') {
    return (
      <Modal
        visible={props.visible}
        animationType="slide"
        transparent
        onRequestClose={props.onClose}
      >
        <Pressable style={styles.overlay} onPress={props.onClose}>
          <Pressable style={styles.container} onPress={(e) => e.stopPropagation()}>
            <View style={styles.header}>
              <View style={styles.headerTitle}>
                <FileSpreadsheet size={24} color="#34A853" />
                <Text style={styles.title}>Export to Google Sheets</Text>
              </View>
              <TouchableOpacity onPress={props.onClose} style={styles.closeButton}>
                <X size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <View style={styles.content}>
              <View style={styles.webNoticeBox}>
                <AlertCircle size={24} color="#f59e0b" />
                <Text style={styles.webNoticeTitle}>Mobile App Required</Text>
                <Text style={styles.webNoticeText}>
                  Google Sheets export is only available on the iOS app. Please use the mobile app to export your data directly to Google Sheets.
                </Text>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    );
  }

  return <GoogleSheetsExportModalContent {...props} />;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    ...Platform.select({
      web: {
        maxWidth: 500,
        alignSelf: 'center' as const,
        width: '100%',
        marginBottom: 0,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 16,
  },
  instructionBox: {
    backgroundColor: '#e8f4fd',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a73e8',
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  redirectUriLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 12,
    fontWeight: '500' as const,
  },
  redirectUriText: {
    fontSize: 11,
    color: '#1a73e8',
    backgroundColor: '#f0f4f8',
    padding: 8,
    borderRadius: 4,
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4285F4',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    marginBottom: 20,
  },
  signInButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  signedInBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#e6f4ea',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  signedInInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  signedInTextContainer: {
    flex: 1,
  },
  signedInText: {
    fontSize: 12,
    color: '#137333',
  },
  signedInEmail: {
    fontSize: 14,
    fontWeight: '600',
    color: '#137333',
  },
  signOutText: {
    fontSize: 14,
    color: '#1a73e8',
    fontWeight: '500',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    lineHeight: 18,
  },
  inputSection: {
    marginBottom: 20,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  inputIcon: {
    marginLeft: 12,
  },
  input: {
    flex: 1,
    padding: 12,
    fontSize: 14,
    color: '#333',
  },
  pasteButton: {
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  pasteButtonText: {
    fontSize: 13,
    color: '#1a73e8',
  },
  resultBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    gap: 12,
  },
  resultSuccess: {
    backgroundColor: '#e6f4ea',
  },
  resultError: {
    backgroundColor: '#fce8e6',
  },
  resultContent: {
    flex: 1,
  },
  resultSuccessText: {
    fontSize: 14,
    color: '#137333',
    fontWeight: '500',
  },
  resultErrorText: {
    flex: 1,
    fontSize: 14,
    color: '#c5221f',
  },
  openLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  openLinkText: {
    fontSize: 14,
    color: '#1a73e8',
    fontWeight: '500',
  },

  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34A853',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    marginBottom: 20,
  },
  exportButtonDisabled: {
    backgroundColor: '#ccc',
  },
  exportButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  webNoticeBox: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 12,
  },
  webNoticeTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#92400e',
  },
  webNoticeText: {
    fontSize: 14,
    color: '#78350f',
    textAlign: 'center',
    lineHeight: 20,
  },
});
