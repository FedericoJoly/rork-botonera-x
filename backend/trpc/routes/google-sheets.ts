import * as z from "zod";
import jwt from 'jsonwebtoken';
import { createTRPCRouter, publicProcedure } from "../create-context";

const TransactionSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  items: z.array(z.object({
    product: z.object({
      id: z.string(),
      name: z.string(),
      price: z.number(),
      subgroup: z.string().nullable().optional(),
    }),
    quantity: z.number(),
  })),
  subtotal: z.number(),
  discount: z.number(),
  total: z.number(),
  currency: z.string(),
  paymentMethod: z.string(),
  email: z.string().nullable().optional(),
  appliedPromotions: z.array(z.string()),
});

const ProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.number(),
  subgroup: z.string().nullable().optional(),
});

const SettingsSchema = z.object({
  currency: z.string(),
});

const ExportDataSchema = z.object({
  userName: z.string(),
  eventName: z.string(),
  transactions: z.array(TransactionSchema),
  products: z.array(ProductSchema),
  settings: SettingsSchema,
  exchangeRates: z.record(z.string(), z.number()),
});

async function getAccessToken(serviceAccount: any): Promise<{ token: string; tokenInfo: any }> {
  const now = Math.floor(Date.now() / 1000);
  const scopes = 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.file';
  
  console.log('🔐 JWT Claim Details:');
  console.log('   - Issuer (iss):', serviceAccount.client_email);
  console.log('   - Scopes:', scopes);
  console.log('   - Audience:', 'https://oauth2.googleapis.com/token');
  console.log('   - Issued at:', new Date(now * 1000).toISOString());
  console.log('   - Expires at:', new Date((now + 3600) * 1000).toISOString());
  
  const claim = {
    iss: serviceAccount.client_email,
    scope: scopes,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const token = jwt.sign(claim, serviceAccount.private_key, { algorithm: 'RS256' } as jwt.SignOptions);

  console.log('📤 Requesting OAuth token from Google...');
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: token,
    }),
  });

  const data = await response.json();
  
  console.log('📥 OAuth Response Status:', response.status);
  console.log('📥 OAuth Response:', JSON.stringify(data, null, 2));
  
  if (!response.ok || !data.access_token) {
    console.error('❌ OAuth token request failed:', data);
    throw new Error(`Failed to get access token: ${data.error || data.error_description || 'Unknown error'}`);
  }
  
  console.log('✅ OAuth token obtained successfully');
  console.log('   - Token type:', data.token_type);
  console.log('   - Expires in:', data.expires_in, 'seconds');
  console.log('   - Scope:', data.scope || 'Not returned (using requested scopes)');
  
  return { token: data.access_token, tokenInfo: data };
}

export const googleSheetsRouter = createTRPCRouter({
  createSpreadsheet: publicProcedure
    .input(ExportDataSchema)
    .mutation(async ({ input }) => {
      try {
        console.log('📊 Creating Google Sheet via service account...');
        console.log('📝 Input data:', {
          userName: input.userName,
          eventName: input.eventName,
          transactionsCount: input.transactions.length,
          productsCount: input.products.length,
        });

        const serviceAccountJson = process.env.EXPO_PUBLIC_GOOGLE_SERVICE_ACCOUNT;
        if (!serviceAccountJson) {
          throw new Error('Service account credentials not configured');
        }
        console.log('🔑 Service account JSON found, length:', serviceAccountJson.length);

        let serviceAccount;
        try {
          serviceAccount = JSON.parse(serviceAccountJson);
          console.log('✅ Service account JSON parsed successfully');
          console.log('📧 Client email:', serviceAccount.client_email?.substring(0, 20) + '...');
        } catch (parseError: any) {
          console.error('❌ Failed to parse service account JSON:', parseError.message);
          console.error('JSON string length:', serviceAccountJson.length);
          console.error('First 100 chars:', serviceAccountJson.substring(0, 100));
          throw new Error(`Invalid service account JSON format: ${parseError.message}`);
        }

        if (!serviceAccount.client_email || !serviceAccount.private_key) {
          console.error('❌ Missing fields. Has client_email:', !!serviceAccount.client_email, 'Has private_key:', !!serviceAccount.private_key);
          throw new Error('Service account JSON missing required fields (client_email or private_key)');
        }
        
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
        console.log('✅ Private key newlines normalized');
        
        console.log('🔐 Getting access token...');
        const { token: accessToken } = await getAccessToken(serviceAccount);
        console.log('✅ Access token obtained');
        
        console.log('\n🔍 VERIFYING TOKEN - Testing with tokeninfo endpoint...');
        const tokenInfoResponse = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`
        );
        const tokenInfoData = await tokenInfoResponse.json();
        console.log('📋 Token Info Response:', JSON.stringify(tokenInfoData, null, 2));
        
        if (tokenInfoData.error) {
          console.error('❌ Token verification FAILED:', tokenInfoData.error_description);
        } else {
          console.log('✅ Token is VALID');
          console.log('   - Issued to:', tokenInfoData.email);
          console.log('   - Scopes:', tokenInfoData.scope);
          console.log('   - Expires in:', tokenInfoData.expires_in, 'seconds');
        }
        console.log('📋 Service Account Details:');
        console.log('   - Email:', serviceAccount.client_email);
        console.log('   - Project ID:', serviceAccount.project_id);
        console.log('   - Private Key ID:', serviceAccount.private_key_id?.substring(0, 20) + '...');

        const spreadsheetTitle = `${input.userName} - ${input.eventName}`;

        console.log('\n🧪 TESTING API ACCESS - Simple Drive API test...');
        const driveTestResponse = await fetch(
          'https://www.googleapis.com/drive/v3/about?fields=user',
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );
        const driveTestData = await driveTestResponse.json();
        console.log('📋 Drive API Test Response:', driveTestResponse.status);
        console.log('   Response:', JSON.stringify(driveTestData, null, 2));
        
        if (!driveTestResponse.ok) {
          console.error('❌ Drive API test FAILED - This confirms the service account cannot access Drive');
          console.error('   The service account needs Google Drive API enabled in its project');
        } else {
          console.log('✅ Drive API test PASSED - Service account can access Drive');
        }

        console.log('\n🧪 TESTING API ACCESS - Simple Sheets API test...');
        const sheetsTestResponse = await fetch(
          'https://sheets.googleapis.com/v4/spreadsheets/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );
        console.log('📋 Sheets API Test Response:', sheetsTestResponse.status);
        if (sheetsTestResponse.ok) {
          console.log('✅ Sheets API test PASSED - Can read public spreadsheets');
        } else {
          const sheetsError = await sheetsTestResponse.text();
          console.log('⚠️  Sheets API test response:', sheetsError);
        }

        const targetFolderId = '1cMVXicwYNKbDZcLNl-Z7CWVEUVPxH2mB';
        
        console.log('\n📝 Creating spreadsheet DIRECTLY in shared folder:', targetFolderId);
        console.log('   Title:', spreadsheetTitle);
        console.log('🔑 Using access token (first 50 chars):', accessToken.substring(0, 50) + '...');
        
        console.log('\n🧪 First, testing if service account can access the shared folder...');
        const folderTestResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${targetFolderId}?fields=id,name,mimeType,owners,permissions,capabilities,shared,ownedByMe`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );
        const folderTestData = await folderTestResponse.json();
        console.log('📁 Folder access test:', folderTestResponse.status);
        console.log('   Full Response:', JSON.stringify(folderTestData, null, 2));
        console.log('   Is shared:', folderTestData.shared);
        console.log('   Owned by service account:', folderTestData.ownedByMe);
        if (folderTestData.owners) {
          console.log('   Owners:', folderTestData.owners.map((o: any) => o.emailAddress).join(', '));
        }
        if (folderTestData.permissions) {
          console.log('   Permissions count:', folderTestData.permissions.length);
          folderTestData.permissions.forEach((p: any, i: number) => {
            console.log(`   Permission ${i + 1}: role=${p.role}, type=${p.type}, email=${p.emailAddress || 'N/A'}`);
          });
        }
        
        if (!folderTestResponse.ok) {
          console.error('❌ Cannot access the shared folder!');
          console.error('   Make sure you shared the folder with:', serviceAccount.client_email);
          console.error('   The service account needs "Editor" access to the folder.');
          throw new Error(`Cannot access shared folder. Share it with: ${serviceAccount.client_email}`);
        }
        
        console.log('✅ Can access folder:', folderTestData.name);
        console.log('   All capabilities:', JSON.stringify(folderTestData.capabilities, null, 2));
        
        // Check if we have write permission
        const caps = folderTestData.capabilities || {};
        console.log('\n🔍 Critical Capabilities Check:');
        console.log('   canAddChildren:', caps.canAddChildren);
        console.log('   canEdit:', caps.canEdit);
        console.log('   canShare:', caps.canShare);
        console.log('   canCopy:', caps.canCopy);
        console.log('   canListChildren:', caps.canListChildren);
        
        if (!caps.canAddChildren) {
          console.error('❌ Service account can VIEW the folder but CANNOT CREATE files!');
          console.error('');
          console.error('⚠️  FIX: Share the folder with EDITOR permission (not Viewer)');
          console.error('   1. Open: https://drive.google.com/drive/folders/' + targetFolderId);
          console.error('   2. Click Share button');
          console.error('   3. Add this email:', serviceAccount.client_email);
          console.error('   4. Set role to "Editor" (not Viewer or Commenter)');
          console.error('   5. Click Send/Share');
          throw new Error(`Service account has Viewer access but needs EDITOR access. Share folder with Editor role to: ${serviceAccount.client_email}`);
        }
        
        console.log('✅ Service account has write permission (canAddChildren: true)');
        
        // Try listing files in folder to double-check access
        console.log('\n🧪 Testing: Can we list files in the folder?');
        const listResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files?q='${targetFolderId}'+in+parents&fields=files(id,name)`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );
        const listData = await listResponse.json();
        console.log('   List files status:', listResponse.status);
        console.log('   Files in folder:', listData.files?.length || 0);

        // Create the spreadsheet directly in the target folder using Drive API
        // This avoids the service account's own storage quota
        console.log('\n📝 Creating spreadsheet directly in target folder using Drive API...');
        console.log('   Target folder ID:', targetFolderId);
        console.log('   Spreadsheet title:', spreadsheetTitle);
        
        const createPayload = {
          name: spreadsheetTitle,
          mimeType: 'application/vnd.google-apps.spreadsheet',
          parents: [targetFolderId],
        };
        console.log('\n📤 Create file request payload:', JSON.stringify(createPayload, null, 2));
        
        const createViaDriveResponse = await fetch(
          'https://www.googleapis.com/drive/v3/files?supportsAllDrives=true',
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(createPayload),
          }
        );

        console.log('📊 Drive API create response status:', createViaDriveResponse.status, createViaDriveResponse.statusText);
        
        if (!createViaDriveResponse.ok) {
          const errorText = await createViaDriveResponse.text();
          console.error('❌ Drive API creation failed:', errorText);
          
          // Try to parse for more details
          try {
            const errorJson = JSON.parse(errorText);
            console.error('   Error code:', errorJson.error?.code);
            console.error('   Error message:', errorJson.error?.message);
            console.error('   Error status:', errorJson.error?.status);
            if (errorJson.error?.errors) {
              errorJson.error.errors.forEach((e: any, i: number) => {
                console.error(`   Error detail ${i + 1}:`, e.message, '| reason:', e.reason, '| domain:', e.domain);
              });
            }
          } catch {
            // Not JSON, already logged the raw text
          }
          
          throw new Error(`Failed to create spreadsheet: ${errorText}`);
        }

        const driveFile = await createViaDriveResponse.json();
        const spreadsheetId = driveFile.id;
        console.log('✅ Spreadsheet created via Drive API!');  
        console.log('   File ID:', spreadsheetId);
        console.log('   File name:', driveFile.name);
        const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

        console.log('✅ Spreadsheet created via Drive API!');
        console.log('   ID:', spreadsheetId);
        console.log('   URL:', spreadsheetUrl);

        console.log('\n📝 Adding sheets to the spreadsheet...');
        const addSheetsResponse = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              requests: [
                { updateSheetProperties: { properties: { sheetId: 0, title: 'Registry Data' }, fields: 'title' } },
                { addSheet: { properties: { title: 'Products' } } },
                { addSheet: { properties: { title: 'Currencies' } } },
                { addSheet: { properties: { title: 'Groups' } } },
              ],
            }),
          }
        );

        if (!addSheetsResponse.ok) {
          const errorText = await addSheetsResponse.text();
          console.error('⚠️ Failed to add sheets:', errorText);
        } else {
          console.log('✅ Sheets added successfully');
        }

        const registryData = prepareRegistryData(input);
        const productsData = prepareProductsData(input);
        const currenciesData = prepareCurrenciesData(input);
        const groupsData = prepareGroupsData(input);

        const updates = [
          { range: 'Registry Data!A1', values: registryData },
          { range: 'Products!A1', values: productsData },
          { range: 'Currencies!A1', values: currenciesData },
          { range: 'Groups!A1', values: groupsData },
        ];

        console.log('📝 Populating sheets with data...');
        const updateResponse = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              valueInputOption: 'USER_ENTERED',
              data: updates,
            }),
          }
        );

        if (!updateResponse.ok) {
          const errorText = await updateResponse.text();
          throw new Error(`Failed to populate spreadsheet: ${errorText}`);
        }

        console.log('✅ Data populated successfully');

        await formatSpreadsheet(accessToken, spreadsheetId);

        return { success: true, spreadsheetUrl };
      } catch (error: any) {
        console.error('❌ Error creating spreadsheet:', error);
        return { success: false, error: error.message || String(error) };
      }
    }),
});

function prepareRegistryData(data: z.infer<typeof ExportDataSchema>): string[][] {
  const rows: string[][] = [
    ['Transaction ID', 'Date', 'Time', 'Items', 'Subtotal', 'Discount', 'Total', 'Currency', 'Payment Method', 'Email', 'Promotions']
  ];

  data.transactions
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .forEach(transaction => {
      const date = new Date(transaction.timestamp);
      const itemsList = transaction.items
        .map(item => `${item.product.name} x${item.quantity}`)
        .join(', ');
      
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
        transaction.appliedPromotions.join(', '),
      ]);
    });

  return rows;
}

function prepareProductsData(data: z.infer<typeof ExportDataSchema>): string[][] {
  const mainCurrency = data.settings.currency;
  const rows: string[][] = [
    ['Product', 'Type', 'Subgroup', 'Quantity Sold', 'Total Amount (' + mainCurrency + ')']
  ];

  const productSales = new Map<string, { product: any; quantity: number; amount: number }>();

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
          product: item.product,
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
        '',
        product.subgroup || '',
        quantity.toString(),
        amount.toFixed(2),
      ]);
    });

  return rows;
}

function prepareCurrenciesData(data: z.infer<typeof ExportDataSchema>): string[][] {
  const rows: string[][] = [
    ['Currency', 'Payment Method', 'Transactions', 'Total Amount']
  ];

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
    methods.forEach((data, method) => {
      rows.push([
        currency,
        method,
        data.count.toString(),
        data.total.toFixed(2),
      ]);
    });
  });

  return rows;
}

function prepareGroupsData(data: z.infer<typeof ExportDataSchema>): string[][] {
  const mainCurrency = data.settings.currency;
  const rows: string[][] = [
    ['Group Type', 'Group Name', 'Product', 'Quantity', 'Amount (' + mainCurrency + ')']
  ];

  const typeGroups = new Map<string, { items: Map<string, { quantity: number; amount: number }> }>();
  const subgroups = new Map<string, { type: string; items: Map<string, { quantity: number; amount: number }> }>();

  data.transactions.forEach(transaction => {
    const fromRate = data.exchangeRates[transaction.currency] || 1;
    const toRate = data.exchangeRates[mainCurrency] || 1;
    const conversionRate = toRate / fromRate;

    transaction.items.forEach(item => {
      const convertedAmount = item.product.price * item.quantity * conversionRate;
      const type = 'Product';

      if (!typeGroups.has(type)) {
        typeGroups.set(type, { items: new Map() });
      }

      const typeGroup = typeGroups.get(type)!;
      const existingTypeItem = typeGroup.items.get(item.product.name);

      if (existingTypeItem) {
        existingTypeItem.quantity += item.quantity;
        existingTypeItem.amount += convertedAmount;
      } else {
        typeGroup.items.set(item.product.name, {
          quantity: item.quantity,
          amount: convertedAmount,
        });
      }

      const subgroup = item.product.subgroup;
      if (subgroup && subgroup.trim() !== '') {
        if (!subgroups.has(subgroup)) {
          subgroups.set(subgroup, { type, items: new Map() });
        }

        const subgroupData = subgroups.get(subgroup)!;
        const existingSubItem = subgroupData.items.get(item.product.name);

        if (existingSubItem) {
          existingSubItem.quantity += item.quantity;
          existingSubItem.amount += convertedAmount;
        } else {
          subgroupData.items.set(item.product.name, {
            quantity: item.quantity,
            amount: convertedAmount,
          });
        }
      }
    });
  });

  typeGroups.forEach((group, typeName) => {
    group.items.forEach((data, productName) => {
      rows.push([
        'Type',
        typeName,
        productName,
        data.quantity.toString(),
        data.amount.toFixed(2),
      ]);
    });
  });

  subgroups.forEach((group, subgroupName) => {
    group.items.forEach((data, productName) => {
      rows.push([
        'Subgroup',
        subgroupName,
        productName,
        data.quantity.toString(),
        data.amount.toFixed(2),
      ]);
    });
  });

  return rows;
}

async function formatSpreadsheet(accessToken: string, spreadsheetId: string): Promise<void> {
  try {
    console.log('🎨 Formatting spreadsheet...');
    
    const requests = [
      {
        repeatCell: {
          range: {
            sheetId: 0,
            startRowIndex: 0,
            endRowIndex: 1,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: 0.2, green: 0.6, blue: 0.86 },
              textFormat: {
                foregroundColor: { red: 1, green: 1, blue: 1 },
                bold: true,
              },
            },
          },
          fields: 'userEnteredFormat(backgroundColor,textFormat)',
        },
      },
      {
        autoResizeDimensions: {
          dimensions: {
            sheetId: 0,
            dimension: 'COLUMNS',
            startIndex: 0,
            endIndex: 20,
          },
        },
      },
    ];

    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requests }),
      }
    );

    console.log('✅ Formatting applied');
  } catch (error) {
    console.error('⚠️ Error formatting spreadsheet:', error);
  }
}
