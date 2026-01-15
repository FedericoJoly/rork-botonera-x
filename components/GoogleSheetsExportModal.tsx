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
import { X, FolderOpen, ExternalLink, Check, FileSpreadsheet, AlertCircle, Mail, Info } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { exportToGoogleSheets, getServiceAccountEmail } from '@/hooks/google-sheets-export';
import { Transaction, Product, AppSettings, ExchangeRates } from '@/types/sales';

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
const USER_EMAIL_STORAGE_KEY = 'google_share_email';

function GoogleSheetsExportModalContent({ visible, onClose, exportData }: Props) {
  const [folderLink, setFolderLink] = useState('');
  const [shareEmail, setShareEmail] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    error?: string;
    spreadsheetUrl?: string;
  } | null>(null);

  const serviceAccountEmail = getServiceAccountEmail();

  const loadSavedData = async () => {
    try {
      const savedEmail = await AsyncStorage.getItem(USER_EMAIL_STORAGE_KEY);
      if (savedEmail) setShareEmail(savedEmail);
    } catch (error) {
      console.log('Failed to load saved data:', error);
    }
  };

  useEffect(() => {
    if (visible) {
      loadSavedFolderLink();
      loadSavedData();
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

  const saveShareEmail = async (email: string) => {
    try {
      await AsyncStorage.setItem(USER_EMAIL_STORAGE_KEY, email);
    } catch (error) {
      console.log('Failed to save share email:', error);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    setResult(null);

    try {
      if (folderLink.trim()) {
        await saveFolderLink(folderLink.trim());
      }
      if (shareEmail.trim()) {
        await saveShareEmail(shareEmail.trim());
      }
      
      const exportResult = await exportToGoogleSheets(exportData, {
        folderLink: folderLink.trim() || undefined,
        shareWithEmail: shareEmail.trim() || undefined,
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
            <View style={styles.instructionBox}>
              <View style={styles.instructionHeader}>
                <Info size={20} color="#1a73e8" />
                <Text style={styles.instructionTitle}>How it works</Text>
              </View>
              <Text style={styles.instructionText}>
                Your data will be exported to Google Sheets using our service account. Enter your email below to receive edit access to the spreadsheet.
              </Text>
              {serviceAccountEmail && (
                <View style={styles.serviceAccountInfo}>
                  <Text style={styles.serviceAccountLabel}>Service account:</Text>
                  <Text style={styles.serviceAccountEmail} selectable>{serviceAccountEmail}</Text>
                  <Text style={styles.folderShareHint}>
                    To save in a specific folder, share that folder with this email first.
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.inputSection}>
              <Text style={styles.label}>Your Email (optional):</Text>
              <Text style={styles.helperText}>
                Enter your email to receive edit access to the spreadsheet.
              </Text>
              <View style={styles.inputContainer}>
                <Mail size={20} color="#666" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="your@email.com"
                  placeholderTextColor="#999"
                  value={shareEmail}
                  onChangeText={setShareEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                />
              </View>
            </View>

            <View style={styles.inputSection}>
              <Text style={styles.label}>Google Drive Folder Link (optional):</Text>
              <Text style={styles.helperText}>
                Paste a folder link to save in a specific folder. Make sure the folder is shared with the service account email above.
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
  instructionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1a73e8',
  },
  instructionText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  serviceAccountInfo: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#c8dff8',
  },
  serviceAccountLabel: {
    fontSize: 12,
    color: '#666',
  },
  serviceAccountEmail: {
    fontSize: 12,
    color: '#1a73e8',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  folderShareHint: {
    fontSize: 11,
    color: '#666',
    fontStyle: 'italic' as const,
    marginTop: 6,
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
