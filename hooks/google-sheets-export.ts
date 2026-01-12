import { Transaction, Product, AppSettings } from '@/types/sales';
import { trpcClient } from '@/lib/trpc';

interface ExportData {
  userName: string;
  eventName: string;
  transactions: Transaction[];
  products: Product[];
  settings: AppSettings;
  exchangeRates: { [key: string]: number };
}

export async function createAndPopulateSpreadsheet(
  data: ExportData
): Promise<{ success: boolean; spreadsheetUrl?: string; error?: string }> {
  try {
    console.log('📊 Creating Google Sheet via backend...');
    
    const result = await trpcClient.googleSheets.createSpreadsheet.mutate({
      userName: data.userName,
      eventName: data.eventName,
      transactions: data.transactions.map(t => ({
        ...t,
        timestamp: typeof t.timestamp === 'string' ? t.timestamp : t.timestamp.toISOString(),
      })),
      products: data.products,
      settings: data.settings,
      exchangeRates: data.exchangeRates,
    });
    
    console.log('📦 API Response:', result);
    return result;
  } catch (error: any) {
    console.error('❌ Error creating spreadsheet:', error);
    const errorMessage = error?.message || String(error);
    return { success: false, error: errorMessage.length > 200 ? errorMessage.substring(0, 200) + '...' : errorMessage };
  }
}

