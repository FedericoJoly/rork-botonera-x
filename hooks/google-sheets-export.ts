import { Transaction, Product, AppSettings } from '@/types/sales';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

interface ExportData {
  userName: string;
  eventName: string;
  transactions: Transaction[];
  products: Product[];
  settings: AppSettings;
  exchangeRates: { [key: string]: number };
}

function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateRegistryCSV(data: ExportData): string {
  const headers = ['Transaction ID', 'Date', 'Time', 'Items', 'Subtotal', 'Discount', 'Total', 'Currency', 'Payment Method', 'Email', 'Promotions'];
  const rows: string[][] = [headers];

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
      transaction.subtotal.toFixed(2),
      transaction.discount.toFixed(2),
      transaction.total.toFixed(2),
      transaction.currency,
      transaction.paymentMethod,
      transaction.email || '',
      transaction.appliedPromotions.join('; '),
    ]);
  });

  return rows.map(row => row.map(escapeCSV).join(',')).join('\n');
}

function generateProductsCSV(data: ExportData): string {
  const mainCurrency = data.settings.currency;
  const headers = ['Product', 'Subgroup', 'Quantity Sold', `Total Amount (${mainCurrency})`];
  const rows: string[][] = [headers];

  const productSales = new Map<string, { product: Product; quantity: number; amount: number }>();

  data.transactions.forEach(transaction => {
    const fromRate = data.exchangeRates[transaction.currency] || 1;
    const toRate = data.exchangeRates[mainCurrency] || 1;
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
        quantity.toString(),
        amount.toFixed(2),
      ]);
    });

  return rows.map(row => row.map(escapeCSV).join(',')).join('\n');
}

function generateCurrenciesCSV(data: ExportData): string {
  const headers = ['Currency', 'Payment Method', 'Transactions', 'Total Amount'];
  const rows: string[][] = [headers];

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
        methodData.count.toString(),
        methodData.total.toFixed(2),
      ]);
    });
  });

  return rows.map(row => row.map(escapeCSV).join(',')).join('\n');
}

function generateFullCSV(data: ExportData): string {
  const sections: string[] = [];

  sections.push('=== REGISTRY DATA ===');
  sections.push(generateRegistryCSV(data));
  sections.push('');
  sections.push('=== PRODUCTS SUMMARY ===');
  sections.push(generateProductsCSV(data));
  sections.push('');
  sections.push('=== CURRENCIES SUMMARY ===');
  sections.push(generateCurrenciesCSV(data));

  return sections.join('\n');
}

export async function createAndExportSpreadsheet(
  data: ExportData
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('📊 Creating local spreadsheet...');
    console.log('📝 Export data:', {
      userName: data.userName,
      eventName: data.eventName,
      transactionsCount: data.transactions.length,
      productsCount: data.products.length,
    });

    const csvContent = generateFullCSV(data);
    const timestamp = new Date().toISOString().split('T')[0];
    const safeName = data.eventName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const fileName = `${safeName}_${timestamp}.csv`;

    if (Platform.OS === 'web') {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
      console.log('✅ File downloaded on web');
      return { success: true };
    }

    const file = new File(Paths.cache, fileName);
    file.write(csvContent);
    console.log('📄 File created at:', file.uri);

    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      return { success: false, error: 'Sharing is not available on this device' };
    }

    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      dialogTitle: 'Save Spreadsheet',
      UTI: 'public.comma-separated-values-text',
    });

    console.log('✅ File shared successfully');
    return { success: true };
  } catch (error: any) {
    console.error('❌ Error creating spreadsheet:', error);
    return { success: false, error: error.message || String(error) };
  }
}
