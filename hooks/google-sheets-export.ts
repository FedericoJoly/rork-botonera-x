import { Transaction, Product, AppSettings, ExchangeRates } from '@/types/sales';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import * as XLSX from 'xlsx';

interface ExportData {
  userName: string;
  eventName: string;
  transactions: Transaction[];
  products: Product[];
  settings: AppSettings;
  exchangeRates: ExchangeRates;
}

function getRate(exchangeRates: ExchangeRates, currency: string): number {
  if (currency === 'USD') return exchangeRates.USD;
  if (currency === 'EUR') return exchangeRates.EUR;
  if (currency === 'GBP') return exchangeRates.GBP;
  return 1;
}

interface GoogleSheetsExportOptions {
  folderId?: string;
  folderLink?: string;
}

function extractFolderIdFromLink(link: string): string | null {
  console.log('📁 Extracting folder ID from link:', link);
  
  const patterns = [
    /\/folders\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
    /^([a-zA-Z0-9_-]{20,})$/,
  ];
  
  for (const pattern of patterns) {
    const match = link.match(pattern);
    if (match && match[1]) {
      console.log('✅ Extracted folder ID:', match[1]);
      return match[1];
    }
  }
  
  console.log('❌ Could not extract folder ID from link');
  return null;
}

function generateRegistryData(data: ExportData): (string | number)[][] {
  const headers = ['Transaction ID', 'Date', 'Time', 'Items', 'Subtotal', 'Discount', 'Total', 'Currency', 'Payment Method', 'Email', 'Promotions'];
  const rows: (string | number)[][] = [headers];

  const sortedTransactions = [...data.transactions].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  sortedTransactions.forEach(transaction => {
    const date = new Date(transaction.timestamp);
    const itemsList = transaction.items
      .map(item => `${item.product.name} x${item.quantity}`)
      .join('; ');

    rows.push([
      transaction.id,
      date.toLocaleDateString(),
      date.toLocaleTimeString(),
      itemsList,
      transaction.subtotal,
      transaction.discount,
      transaction.total,
      transaction.currency,
      transaction.paymentMethod,
      transaction.email || '',
      transaction.appliedPromotions.join('; '),
    ]);
  });

  return rows;
}

function generateProductsData(data: ExportData): (string | number)[][] {
  const mainCurrency = data.settings.currency;
  const headers = ['Product', 'Subgroup', 'Quantity Sold', `Total Amount (${mainCurrency})`];
  const rows: (string | number)[][] = [headers];

  const productSales = new Map<string, { product: Product; quantity: number; amount: number }>();

  data.transactions.forEach(transaction => {
    const fromRate = getRate(data.exchangeRates, transaction.currency);
    const toRate = getRate(data.exchangeRates, mainCurrency);
    const conversionRate = toRate / fromRate;

    transaction.items.forEach(item => {
      const existing = productSales.get(item.product.id);
      const convertedAmount = item.product.price * item.quantity * conversionRate;

      if (existing) {
        existing.quantity += item.quantity;
        existing.amount += convertedAmount;
      } else {
        productSales.set(item.product.id, {
          product: item.product as Product,
          quantity: item.quantity,
          amount: convertedAmount,
        });
      }
    });
  });

  Array.from(productSales.values())
    .sort((a, b) => b.amount - a.amount)
    .forEach(({ product, quantity, amount }) => {
      rows.push([
        product.name,
        product.subgroup || '',
        quantity,
        Math.round(amount * 100) / 100,
      ]);
    });

  return rows;
}

function generateCurrenciesData(data: ExportData): (string | number)[][] {
  const headers = ['Currency', 'Payment Method', 'Transactions', 'Total Amount'];
  const rows: (string | number)[][] = [headers];

  const currencySummary = new Map<string, Map<string, { count: number; total: number }>>();

  data.transactions.forEach(transaction => {
    const currency = transaction.currency;
    const method = transaction.paymentMethod;

    if (!currencySummary.has(currency)) {
      currencySummary.set(currency, new Map());
    }

    const currencyMethods = currencySummary.get(currency)!;
    const existing = currencyMethods.get(method);

    if (existing) {
      existing.count += 1;
      existing.total += transaction.total;
    } else {
      currencyMethods.set(method, {
        count: 1,
        total: transaction.total,
      });
    }
  });

  currencySummary.forEach((methods, currency) => {
    methods.forEach((methodData, method) => {
      rows.push([
        currency,
        method,
        methodData.count,
        Math.round(methodData.total * 100) / 100,
      ]);
    });
  });

  return rows;
}

async function getAccessToken(serviceAccountJson: string): Promise<string> {
  console.log('🔑 Getting access token from service account...');
  
  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    
    const header = {
      alg: 'RS256',
      typ: 'JWT',
    };
    
    const now = Math.floor(Date.now() / 1000);
    const claim = {
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };
    
    const base64UrlEncode = (obj: object) => {
      const json = JSON.stringify(obj);
      const base64 = btoa(json);
      return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    
    const headerEncoded = base64UrlEncode(header);
    const claimEncoded = base64UrlEncode(claim);
    const signatureInput = `${headerEncoded}.${claimEncoded}`;
    
    const pemContents = serviceAccount.private_key
      .replace(/-----BEGIN PRIVATE KEY-----/g, '')
      .replace(/-----END PRIVATE KEY-----/g, '')
      .replace(/\n/g, '');
    
    const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
    
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8',
      binaryKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      new TextEncoder().encode(signatureInput)
    );
    
    const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    
    const jwt = `${signatureInput}.${signature}`;
    
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    
    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('❌ Token exchange failed:', errorText);
      throw new Error(`Token exchange failed: ${errorText}`);
    }
    
    const tokenData = await tokenResponse.json();
    console.log('✅ Got access token');
    return tokenData.access_token;
  } catch (error: any) {
    console.error('❌ Error getting access token:', error);
    throw new Error(`Failed to get access token: ${error.message}`);
  }
}

export async function exportToGoogleSheets(
  data: ExportData,
  options: GoogleSheetsExportOptions
): Promise<{ success: boolean; error?: string; spreadsheetUrl?: string; serviceAccountEmail?: string }> {
  console.log('📊 Starting Google Sheets export...');
  
  const serviceAccountJson = process.env.EXPO_PUBLIC_GOOGLE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) {
    return { 
      success: false, 
      error: 'Google service account not configured. Please add EXPO_PUBLIC_GOOGLE_SERVICE_ACCOUNT environment variable.' 
    };
  }
  
  let serviceAccountEmail = '';
  try {
    const sa = JSON.parse(serviceAccountJson);
    serviceAccountEmail = sa.client_email || '';
  } catch {
    console.error('Failed to parse service account JSON');
  }
  
  let folderId = options.folderId;
  if (!folderId && options.folderLink) {
    folderId = extractFolderIdFromLink(options.folderLink) || undefined;
  }
  
  if (!folderId) {
    return { 
      success: false, 
      error: 'Please provide a valid Google Drive folder link.',
      serviceAccountEmail 
    };
  }
  
  try {
    const accessToken = await getAccessToken(serviceAccountJson);
    
    const timestamp = new Date().toISOString().split('T')[0];
    const safeName = data.eventName.replace(/[^a-z0-9]/gi, '_');
    const spreadsheetTitle = `${safeName}_${timestamp}`;
    
    console.log('📄 Creating spreadsheet:', spreadsheetTitle);
    
    const registryData = generateRegistryData(data);
    const productsData = generateProductsData(data);
    const currenciesData = generateCurrenciesData(data);
    
    const createResponse = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: spreadsheetTitle,
        },
        sheets: [
          {
            properties: { title: 'Registry', index: 0 },
            data: [{
              startRow: 0,
              startColumn: 0,
              rowData: registryData.map(row => ({
                values: row.map(cell => ({
                  userEnteredValue: typeof cell === 'number' 
                    ? { numberValue: cell }
                    : { stringValue: String(cell) }
                }))
              }))
            }]
          },
          {
            properties: { title: 'Products Summary', index: 1 },
            data: [{
              startRow: 0,
              startColumn: 0,
              rowData: productsData.map(row => ({
                values: row.map(cell => ({
                  userEnteredValue: typeof cell === 'number' 
                    ? { numberValue: cell }
                    : { stringValue: String(cell) }
                }))
              }))
            }]
          },
          {
            properties: { title: 'Currencies Summary', index: 2 },
            data: [{
              startRow: 0,
              startColumn: 0,
              rowData: currenciesData.map(row => ({
                values: row.map(cell => ({
                  userEnteredValue: typeof cell === 'number' 
                    ? { numberValue: cell }
                    : { stringValue: String(cell) }
                }))
              }))
            }]
          }
        ]
      }),
    });
    
    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('❌ Failed to create spreadsheet:', errorText);
      throw new Error(`Failed to create spreadsheet: ${errorText}`);
    }
    
    const spreadsheet = await createResponse.json();
    const spreadsheetId = spreadsheet.spreadsheetId;
    const spreadsheetUrl = spreadsheet.spreadsheetUrl;
    
    console.log('✅ Spreadsheet created:', spreadsheetId);
    console.log('📁 Moving to folder:', folderId);
    
    const moveResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${spreadsheetId}?addParents=${folderId}&fields=id,parents`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    if (!moveResponse.ok) {
      const errorText = await moveResponse.text();
      console.error('❌ Failed to move spreadsheet to folder:', errorText);
      return {
        success: false,
        error: `Spreadsheet created but could not move to folder. Make sure you've shared the folder with: ${serviceAccountEmail}`,
        spreadsheetUrl,
        serviceAccountEmail,
      };
    }
    
    console.log('✅ Spreadsheet moved to folder successfully');
    
    return { 
      success: true, 
      spreadsheetUrl,
      serviceAccountEmail 
    };
  } catch (error: any) {
    console.error('❌ Error exporting to Google Sheets:', error);
    return { 
      success: false, 
      error: error.message || String(error),
      serviceAccountEmail 
    };
  }
}

export async function createAndExportSpreadsheet(
  data: ExportData
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('📊 Creating Excel spreadsheet...');
    console.log('📝 Export data:', {
      userName: data.userName,
      eventName: data.eventName,
      transactionsCount: data.transactions.length,
      productsCount: data.products.length,
    });

    const workbook = XLSX.utils.book_new();

    const registryData = generateRegistryData(data);
    const registrySheet = XLSX.utils.aoa_to_sheet(registryData);
    registrySheet['!cols'] = [
      { wch: 36 },
      { wch: 12 },
      { wch: 10 },
      { wch: 40 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 10 },
      { wch: 15 },
      { wch: 25 },
      { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(workbook, registrySheet, 'Registry');

    const productsData = generateProductsData(data);
    const productsSheet = XLSX.utils.aoa_to_sheet(productsData);
    productsSheet['!cols'] = [
      { wch: 30 },
      { wch: 20 },
      { wch: 15 },
      { wch: 20 },
    ];
    XLSX.utils.book_append_sheet(workbook, productsSheet, 'Products Summary');

    const currenciesData = generateCurrenciesData(data);
    const currenciesSheet = XLSX.utils.aoa_to_sheet(currenciesData);
    currenciesSheet['!cols'] = [
      { wch: 12 },
      { wch: 15 },
      { wch: 15 },
      { wch: 15 },
    ];
    XLSX.utils.book_append_sheet(workbook, currenciesSheet, 'Currencies Summary');

    const timestamp = new Date().toISOString().split('T')[0];
    const safeName = data.eventName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName = `${safeName}_${timestamp}.xlsx`;

    const xlsxData = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });

    if (Platform.OS === 'web') {
      const binaryString = atob(xlsxData);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      console.log('✅ Excel file downloaded on web');
      return { success: true };
    }

    const file = new File(Paths.cache, fileName);
    file.write(xlsxData, { encoding: 'base64' });
    console.log('📄 Excel file created at:', file.uri);

    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      return { success: false, error: 'Sharing is not available on this device' };
    }

    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: 'Save Spreadsheet',
      UTI: 'org.openxmlformats.spreadsheetml.sheet',
    });

    console.log('✅ Excel file shared successfully');
    return { success: true };
  } catch (error: any) {
    console.error('❌ Error creating spreadsheet:', error);
    return { success: false, error: error.message || String(error) };
  }
}

export function getServiceAccountEmail(): string | null {
  const serviceAccountJson = process.env.EXPO_PUBLIC_GOOGLE_SERVICE_ACCOUNT;
  if (!serviceAccountJson) return null;
  
  try {
    const sa = JSON.parse(serviceAccountJson);
    return sa.client_email || null;
  } catch {
    return null;
  }
}
