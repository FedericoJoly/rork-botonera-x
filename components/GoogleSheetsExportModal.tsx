import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import { X, Check, FileSpreadsheet, AlertCircle, Download } from 'lucide-react-native';
import { createAndExportSpreadsheet } from '@/hooks/google-sheets-export';
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

function ExportModalContent({ visible, onClose, exportData }: Props) {
  const [isExporting, setIsExporting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setResult(null);

    try {
      const exportResult = await createAndExportSpreadsheet(exportData);
      setResult(exportResult);
    } catch (error: any) {
      setResult({ success: false, error: error.message || 'Export failed' });
    } finally {
      setIsExporting(false);
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
              <Text style={styles.title}>Export Spreadsheet</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <X size={24} color="#666" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.instructionBox}>
              <Text style={styles.instructionText}>
                Export your sales data as an Excel spreadsheet (.xlsx). You can open it in Excel, Google Sheets, or any other spreadsheet app.
              </Text>
            </View>

            {result && (
              <View style={[
                styles.resultBox,
                result.success ? styles.resultSuccess : styles.resultError
              ]}>
                {result.success ? (
                  <>
                    <Check size={20} color="#34A853" />
                    <Text style={styles.resultSuccessText}>
                      Spreadsheet exported successfully!
                    </Text>
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
                  <Download size={20} color="white" />
                  <Text style={styles.exportButtonText}>Export as Excel</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.tipText}>
              Tip: Save the file to Google Drive and open with Google Sheets for cloud access.
            </Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function GoogleSheetsExportModal(props: Props) {
  return <ExportModalContent {...props} />;
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
    fontWeight: '600' as const,
    color: '#333',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    padding: 16,
  },
  instructionBox: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  instructionText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  resultBox: {
    flexDirection: 'row',
    alignItems: 'center',
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
  resultSuccessText: {
    fontSize: 14,
    color: '#137333',
    fontWeight: '500' as const,
  },
  resultErrorText: {
    flex: 1,
    fontSize: 14,
    color: '#c5221f',
  },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34A853',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    marginBottom: 16,
  },
  exportButtonDisabled: {
    backgroundColor: '#ccc',
  },
  exportButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: 'white',
  },
  tipText: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    fontStyle: 'italic' as const,
  },
});
