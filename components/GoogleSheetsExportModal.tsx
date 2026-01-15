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
import { X, FolderOpen, ExternalLink, Copy, Check, FileSpreadsheet, AlertCircle } from 'lucide-react-native';
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

export default function GoogleSheetsExportModal({ visible, onClose, exportData }: Props) {
  const [folderLink, setFolderLink] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    error?: string;
    spreadsheetUrl?: string;
  } | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);
  
  const serviceAccountEmail = getServiceAccountEmail();

  useEffect(() => {
    if (visible) {
      loadSavedFolderLink();
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

  const handleExport = async () => {
    if (!folderLink.trim()) {
      setResult({ success: false, error: 'Please enter a Google Drive folder link' });
      return;
    }

    setIsExporting(true);
    setResult(null);

    try {
      await saveFolderLink(folderLink.trim());
      
      const exportResult = await exportToGoogleSheets(exportData, {
        folderLink: folderLink.trim(),
      });

      setResult(exportResult);
    } catch (error: any) {
      setResult({ success: false, error: error.message || 'Export failed' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyEmail = async () => {
    if (serviceAccountEmail) {
      await Clipboard.setStringAsync(serviceAccountEmail);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
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
            {!serviceAccountEmail ? (
              <View style={styles.errorBox}>
                <AlertCircle size={20} color="#dc3545" />
                <Text style={styles.errorBoxText}>
                  Google service account not configured. Please add EXPO_PUBLIC_GOOGLE_SERVICE_ACCOUNT in environment variables.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.instructionBox}>
                  <Text style={styles.instructionTitle}>Setup Instructions:</Text>
                  <Text style={styles.instructionText}>
                    1. Create a folder in your Google Drive{'\n'}
                    2. Right-click the folder → Share{'\n'}
                    3. Add the service account email below as Editor{'\n'}
                    4. Copy the folder link and paste it below
                  </Text>
                </View>

                <View style={styles.emailSection}>
                  <Text style={styles.label}>Service Account Email:</Text>
                  <View style={styles.emailContainer}>
                    <Text style={styles.emailText} numberOfLines={1}>
                      {serviceAccountEmail}
                    </Text>
                    <TouchableOpacity 
                      style={styles.copyButton} 
                      onPress={handleCopyEmail}
                    >
                      {copiedEmail ? (
                        <Check size={18} color="#34A853" />
                      ) : (
                        <Copy size={18} color="#666" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.inputSection}>
                  <Text style={styles.label}>Google Drive Folder Link:</Text>
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
                    (!folderLink.trim() || isExporting) && styles.exportButtonDisabled
                  ]}
                  onPress={handleExport}
                  disabled={!folderLink.trim() || isExporting}
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
    fontSize: 14,
    fontWeight: '600',
    color: '#1a73e8',
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 20,
  },
  emailSection: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  emailContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  emailText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  copyButton: {
    padding: 4,
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
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fce8e6',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 20,
  },
  errorBoxText: {
    flex: 1,
    fontSize: 14,
    color: '#c5221f',
    lineHeight: 20,
  },
});
