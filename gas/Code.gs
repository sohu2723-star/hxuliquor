// Mini Mart POS - Google Apps Script Backend
// Tabs: Products, Sales, SaleItems, Users
// Deploy as Web App: Execute as "Me", Who has access: "Anyone"

const SHEET_ID = '1o0a1cRxDdk0dyfysq4jx3HL6OqNWT75iCZEBKygOoPY'; // Replace with your Sheet ID
const ADMIN_EMAIL = 'copy2723@gmail.com'; // Only this Google email can login
const GOOGLE_CLIENT_ID = ''; // Set to your Google OAuth client ID for token validation
const ss = SpreadsheetApp.openById(SHEET_ID);

const ADMIN_ACTIONS = new Set([
  'addEmployee', 'deleteEmployee', 'addProduct', 'updateProduct', 'deleteProduct', 'getEmployees', 'payCredit'
]);

// The frontend reaches this web app through its same-origin Vercel proxy because
// Apps Script ContentService responses cannot set arbitrary CORS headers.

/**
 * Run this function once from the Apps Script editor as the deployment owner.
 * It deliberately touches every authorized service so Google displays the
 * Drive, Sheets, and external-request consent prompts before the web app runs.
 */
function authorizeServices() {
  SpreadsheetApp.openById(SHEET_ID).getName();
  DriveApp.getRootFolder().getName();
  UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=authorization-check', {
    muteHttpExceptions: true
  });
  console.log('Required services are authorized. Redeploy the web app now.');
}

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function jsonResponse(data) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function handleRequest(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || '').trim();
    let params = {};

    if (e && e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
    } else if (e && e.parameter) {
      for (const key in e.parameter) {
        if (key !== 'action') params[key] = e.parameter[key];
      }
    }

    let actor = null;
    if (action !== 'googleLogin' && action !== 'login') {
      actor = requireAuth(params);
      if (ADMIN_ACTIONS.has(action) && actor.role !== 'admin') {
        throw new Error('Admin permission required');
      }
    }

    let result;
    switch (action) {
      case 'getProducts': result = getProducts(); break;
      case 'getProductByBarcode': result = getProductByBarcode(params.barcode); break;
      case 'searchProducts': result = searchProducts(params.query); break;
      case 'getCategories': result = getCategories(); break;
      case 'getSales': result = getSales(params.startDate, params.endDate); break;
      case 'login': result = login(params.email, params.password); break;
      case 'googleLogin': result = googleLogin(params.idToken); break;
      case 'getEmployees': result = getEmployees(); break;
      case 'addEmployee': result = addEmployee(params); break;
      case 'deleteEmployee': result = deleteEmployee(params.id); break;
      case 'createSale': result = createSale(params, actor); break;
      case 'payCredit': result = payCredit(params.saleId); break;
      case 'addProduct': result = addProduct(params); break;
      case 'updateProduct': result = updateProduct(params); break;
      case 'deleteProduct': result = deleteProduct(params.id); break;
      default: result = { success: false, message: 'Unknown action' };
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({
      success: false,
      message: err.toString()
    });
  }
}

function initSheets() {
  const setupSheet = (name, headers) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
    headers.forEach((header, index) => {
      const currentHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
      if (!currentHeaders.includes(header)) {
        sheet.insertColumnBefore(index + 1);
        sheet.getRange(1, index + 1).setValue(header).setFontWeight('bold');
      }
    });
    return sheet;
  };

  const products = setupSheet('Products', [
    'id', 'barcode', 'name', 'category', 'price', 'costPrice',
    'stockQty', 'lowStockThreshold', 'unitsPerPack', 'packPrice', 'requiresAgeCheck', 'imageUrl', 'createdAt'
  ]);
  setupSheet('Sales', [
    'id', 'cashierId', 'cashierName', 'cashierEmail', 'totalAmount', 'paidAmount', 'balanceDue',
    'customerName', 'isCredit', 'settledAt', 'paymentMethod', 'ageVerified', 'createdAt'
  ]);
  setupSheet('SaleItems', [
    'id', 'saleId', 'productId', 'productName', 'quantity', 'saleQuantity', 'saleUnit', 'unitPrice', 'subtotal', 'unitCost', 'profit'
  ]);
  const users = setupSheet('Users', [
    'id', 'name', 'email', 'passwordHash', 'role', 'createdAt'
  ]);
  [products, users].forEach(sheet => {
    if (sheet.getLastRow() < 2) return;
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const idColumn = headers.indexOf('id') + 1;
    if (!idColumn) return;
    const range = sheet.getRange(2, idColumn, sheet.getLastRow() - 1, 1);
    const ids = range.getValues().map(([id]) => [id || generateId()]);
    range.setValues(ids);
  });
  repairShiftedProductRows(products);
}

function repairShiftedProductRows(sheet) {
  if (sheet.getLastRow() < 2) return;
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const index = header => headers.indexOf(header);
  let changed = false;
  rows.forEach(row => {
    const barcode = row[index('barcode')];
    const name = row[index('name')];
    const price = row[index('price')];
    if (!barcode && /^\d{6,}$/.test(String(name)) && price !== '' && isNaN(Number(price))) {
      row[index('barcode')] = name;
      row[index('name')] = row[index('category')];
      row[index('category')] = price;
      row[index('price')] = row[index('costPrice')];
      row[index('costPrice')] = row[index('stockQty')];
      row[index('stockQty')] = row[index('lowStockThreshold')];
      row[index('lowStockThreshold')] = row[index('requiresAgeCheck')];
      row[index('requiresAgeCheck')] = row[index('imageUrl')];
      row[index('imageUrl')] = row[index('createdAt')];
      row[index('createdAt')] = '';
      changed = true;
    }
  });
  if (changed) sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

function appendObject(sheet, object) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(headers.map(header => object[header] ?? ''));
}

function sheetToObjects(sheet) {
  const data = sheet.getDataRange().getValues();
  if (data.length === 0) return [];
  const headers = data[0];
  const objects = [];
  for (let i = 1; i < data.length; i++) {
    const obj = {};
    headers.forEach((header, j) => {
      obj[header] = data[i][j];
    });
    objects.push(obj);
  }
  return objects;
}

function objectsToSheet(sheet, objects) {
  if (objects.length === 0) return;
  const headers = Object.keys(objects[0]);
  const values = objects.map(obj => headers.map(h => obj[h] ?? ''));
  sheet.clearContents();
  sheet.appendRow(headers);
  values.forEach(row => sheet.appendRow(row));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

function text(value, fallback) {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || (fallback || '');
}

function numberValue(value, fallback) {
  const result = Number(value);
  return isFinite(result) ? result : (fallback || 0);
}

function integerValue(value, fallback) {
  return Math.trunc(numberValue(value, fallback));
}

function booleanValue(value) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

function getGoogleTokenData(idToken) {
  if (!text(idToken)) throw new Error('Google token မရပါ။ Login ပြန်လုပ်ပါ။');
  const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(String(idToken)), {
    muteHttpExceptions: true
  });
  const status = response.getResponseCode();
  let data = {};
  try { data = JSON.parse(response.getContentText() || '{}'); } catch (err) { data = {}; }
  if (status !== 200 || data.error_description || !text(data.email)) {
    throw new Error('Invalid Google token');
  }
  if (GOOGLE_CLIENT_ID && text(data.aud) !== GOOGLE_CLIENT_ID) {
    throw new Error('Google client ID မကိုက်ညီပါ။');
  }
  return data;
}

function authCacheKey(token) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token), Utilities.Charset.UTF_8);
  return 'auth_' + digest.map(byte => {
    const value = byte < 0 ? byte + 256 : byte;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function requireAuth(params) {
  const token = text(params && params.accessToken);
  if (!token) throw new Error('Login session မရှိပါ။ Login ပြန်လုပ်ပါ။');
  const cache = CacheService.getScriptCache();
  const key = authCacheKey(token);
  const cached = cache.get(key);
  if (cached) {
    try { return JSON.parse(cached); } catch (err) { cache.remove(key); }
  }

  const data = getGoogleTokenData(token);
  initSheets();
  const email = text(data.email).toLowerCase();
  const users = sheetToObjects(ss.getSheetByName('Users'));
  const user = users.find(u => text(u.email).toLowerCase() === email);
  if (!user) throw new Error('Employee account မရှိသေးပါ။ Admin ကို ဒီ Google email ထည့်ခိုင်းပါ။');
  const actor = {
    id: text(user.id),
    name: text(user.name, email.split('@')[0]),
    email,
    role: text(user.role, 'employee').toLowerCase()
  };
  cache.put(key, JSON.stringify(actor), 300);
  return actor;
}

function getProducts() {
  initSheets();
  const sheet = ss.getSheetByName('Products');
  const products = sheetToObjects(sheet);
  return products.map(p => ({
    ...p,
    id: text(p.id),
    barcode: text(p.barcode),
    name: text(p.name, 'Unnamed product'),
    category: text(p.category),
    price: numberValue(p.price),
    costPrice: numberValue(p.costPrice),
    stockQty: integerValue(p.stockQty),
    lowStockThreshold: integerValue(p.lowStockThreshold),
    unitsPerPack: Math.max(1, integerValue(p.unitsPerPack, 1)),
    packPrice: numberValue(p.packPrice),
    requiresAgeCheck: booleanValue(p.requiresAgeCheck),
    imageUrl: text(p.imageUrl),
    createdAt: text(p.createdAt)
  })).filter(p => p.id);
}

function getProductByBarcode(barcode) {
  const products = getProducts();
  const scanned = normalizeBarcode(barcode);
  return products.find(p => String(p.barcode).split(/[,\n;]/).some(code => {
    const saved = normalizeBarcode(code);
    if (!saved) return false;
    return saved.endsWith('*') ? scanned.startsWith(saved.slice(0, -1))
      : saved === scanned || '0' + saved === scanned || saved === '0' + scanned;
  })) || null;
}

function normalizeBarcode(value) {
  return String(value || '').trim().replace(/[\s-]+/g, '').toUpperCase();
}

function searchProducts(query) {
  const products = getProducts();
  const q = String(query || '').toLowerCase();
  return products.filter(p => 
    String(p.name || '').toLowerCase().includes(q) ||
    String(p.category || '').toLowerCase().includes(q)
  );
}

function getCategories() {
  const products = getProducts();
  const cats = [...new Set(products.map(p => text(p.category)).filter(Boolean))];
  return cats.sort();
}

function getSales(startDate, endDate) {
  initSheets();
  const salesSheet = ss.getSheetByName('Sales');
  const itemsSheet = ss.getSheetByName('SaleItems');
  const sales = sheetToObjects(salesSheet);
  const items = sheetToObjects(itemsSheet);

  let filtered = sales;
  if (startDate || endDate) filtered = filtered.filter(s => {
    const dates = [s.createdAt, s.settledAt].filter(Boolean).map(value => Utilities.formatDate(new Date(value), 'Asia/Yangon', 'yyyy-MM-dd'));
    return dates.some(date => (!startDate || date >= startDate) && (!endDate || date <= endDate));
  });

  return filtered.map(sale => ({
    ...sale,
    id: text(sale.id),
    cashierId: text(sale.cashierId),
    cashierName: text(sale.cashierName, 'Cashier'),
    cashierEmail: text(sale.cashierEmail),
    totalAmount: numberValue(sale.totalAmount),
    paidAmount: sale.paidAmount === '' ? numberValue(sale.totalAmount) : numberValue(sale.paidAmount),
    balanceDue: numberValue(sale.balanceDue),
    customerName: text(sale.customerName),
    isCredit: booleanValue(sale.isCredit),
    settledAt: text(sale.settledAt),
    paymentMethod: text(sale.paymentMethod, 'cash'),
    ageVerified: booleanValue(sale.ageVerified),
    createdAt: text(sale.createdAt),
    items: items.filter(i => text(i.saleId) === text(sale.id)).map(i => ({
      ...i,
      quantity: parseInt(i.quantity) || 0,
      unitPrice: parseFloat(i.unitPrice) || 0,
      subtotal: parseFloat(i.subtotal) || 0,
      unitCost: parseFloat(i.unitCost) || 0,
      profit: parseFloat(i.profit) || 0
      ,saleQuantity: parseInt(i.saleQuantity) || parseInt(i.quantity) || 0
      ,saleUnit: text(i.saleUnit, 'unit')
    }))
  }));
}

function login(email, password) {
  initSheets();
  const users = sheetToObjects(ss.getSheetByName('Users'));
  const user = users.find(u => u.email === email);
  if (!user) {
    return { success: false, message: 'Invalid credentials' };
  }
  if (user.passwordHash !== password) {
    return { success: false, message: 'Invalid credentials' };
  }
  return {
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  };
}

function googleLogin(idToken) {
  try {
    const response = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
    const data = JSON.parse(response.getContentText());

    if (data.error_description) {
      return { success: false, message: 'Invalid Google token' };
    }

    const email = String(data.email || '').trim().toLowerCase();
    if (!email) {
      return { success: false, message: 'No email found in Google token' };
    }

    initSheets();
    const usersSheet = ss.getSheetByName('Users');
    const users = sheetToObjects(usersSheet);
    let user = users.find(u => text(u.email).toLowerCase() === email);

    if (!user && email === ADMIN_EMAIL.toLowerCase()) {
      const id = generateId();
      const name = data.name || email.split('@')[0];
      const newUser = {
        id: generateId(),
        name: text(data.name, email.split('@')[0]),
        email,
        passwordHash: '',
        role: 'admin',
        createdAt: new Date().toISOString()
      };
      appendObject(usersSheet, newUser);
      user = newUser;
    }

    if (!user) {
      return { success: false, message: 'Employee account မရှိသေးပါ။ Admin ကို ဒီ Google email ထည့်ခိုင်းပါ။' };
    }

    return {
      success: true,
      user: {
        id: text(user.id),
        name: text(user.name, email.split('@')[0]),
        email,
        role: text(user.role, 'employee').toLowerCase()
      }
    };
  } catch (err) {
    return { success: false, message: 'Google login failed: ' + err.toString() };
  }
}

function getEmployees() {
  initSheets();
  return sheetToObjects(ss.getSheetByName('Users')).map(user => ({
    id: user.id, name: user.name, email: user.email, role: user.role
  }));
}

function addEmployee(params) {
  initSheets();
  const sheet = ss.getSheetByName('Users');
  const email = String(params.email || '').trim().toLowerCase();
  if (!email || !params.name) return { success: false, message: 'Name and Google email are required' };
  const users = sheetToObjects(sheet);
  if (users.some(user => String(user.email).toLowerCase() === email)) return { success: false, message: 'This email already exists' };
  const user = { id: generateId(), name: params.name, email, role: 'employee' };
  appendObject(sheet, { ...user, passwordHash: '', createdAt: new Date().toISOString() });
  return { success: true, user };
}

function deleteEmployee(id) {
  initSheets();
  const sheet = ss.getSheetByName('Users');
  const users = sheetToObjects(sheet);
  const index = users.findIndex(user => String(user.id) === String(id) && user.role !== 'admin');
  if (index < 0) return { success: false, message: 'Employee not found or admin cannot be removed' };
  sheet.deleteRow(index + 2);
  return { success: true };
}

function uploadImageToDrive(base64Data, fileName) {
  try {
    const dataUrlMatch = String(base64Data).match(/^data:([^;]+);base64,(.+)$/);
    const mimeType = dataUrlMatch ? dataUrlMatch[1] : 'image/jpeg';
    const encodedData = dataUrlMatch ? dataUrlMatch[2] : String(base64Data);
    const sizeInBytes = Math.round(encodedData.length * 3 / 4);
    if (sizeInBytes > 2 * 1024 * 1024) {
      throw new Error('Image size exceeds 2MB limit');
    }

    const folderName = 'MiniMartProductImages';
    let folder = getOrCreateFolder(folderName);
    
    const blob = Utilities.newBlob(Utilities.base64Decode(encodedData), mimeType, fileName || 'product.jpg');
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return 'https://drive.google.com/uc?export=view&id=' + file.getId();
  } catch (err) {
    // Some existing web-app deployments were authorized before Drive scope was
    // added. Keep product creation working by storing the already-compressed
    // data URL directly in the Sheet until the owner re-authorizes Drive.
    const inlineImage = String(base64Data || '');
    if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(inlineImage) && inlineImage.length <= 48000) {
      return inlineImage;
    }
    throw new Error('ပုံတင်၍မရပါ။ Apps Script တွင် authorizeServices ကို Run လုပ်ပြီး Drive permission ပေးပါ။');
  }
}

function getOrCreateFolder(folderName) {
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(folderName);
}

function createSale(params, actor) {
  initSheets();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    if (!actor) throw new Error('Login session မရှိပါ။ Login ပြန်လုပ်ပါ။');
    const items = Array.isArray(params && params.items) ? params.items : [];
    if (!items.length) throw new Error('Cart ထဲတွင် product မရှိပါ။');

    const productsSheet = ss.getSheetByName('Products');
    const products = sheetToObjects(productsSheet);
    const remainingStock = {};
    const stockUsed = {};
    let totalAmount = 0;
    const saleItems = [];

    items.forEach(item => {
      const productId = text(item && item.productId);
      const quantity = integerValue(item && item.quantity);
      const saleUnit = text(item && item.saleUnit, 'unit') === 'pack' ? 'pack' : 'unit';
      if (!productId || quantity <= 0) throw new Error('Cart item မမှန်ပါ။');
      const product = products.find(p => text(p.id) === productId);
      if (!product) throw new Error('Product ' + productId + ' not found');
      const stockQty = integerValue(product.stockQty);
      const unitsPerPack = Math.max(1, integerValue(product.unitsPerPack, 1));
      const stockQuantity = quantity * (saleUnit === 'pack' ? unitsPerPack : 1);
      stockUsed[productId] = (stockUsed[productId] || 0) + stockQuantity;
      if (stockQty < stockUsed[productId]) throw new Error('Insufficient stock for ' + text(product.name, 'Unnamed product'));
      remainingStock[productId] = stockQty - stockUsed[productId];
      if (booleanValue(product.requiresAgeCheck) && !booleanValue(params.ageVerified)) {
        throw new Error('Age verification required for restricted items');
      }

      const sellingPrice = saleUnit === 'pack' ? numberValue(product.packPrice) : numberValue(product.price);
      if (saleUnit === 'pack' && (unitsPerPack <= 1 || sellingPrice <= 0)) throw new Error('Pack price is not configured for ' + text(product.name));
      const subtotal = sellingPrice * quantity;
      const unitCost = numberValue(product.costPrice);
      const profit = subtotal - (unitCost * stockQuantity);
      totalAmount += subtotal;
      saleItems.push({
        id: generateId(),
        saleId: '',
        productId: productId,
        productName: text(product.name) + (saleUnit === 'pack' ? ' (Pack x' + unitsPerPack + ')' : ''),
        quantity: stockQuantity,
        saleQuantity: quantity,
        saleUnit: saleUnit,
        unitPrice: subtotal / stockQuantity,
        subtotal: subtotal,
        unitCost: unitCost,
        profit: profit
      });
    });

    const saleId = generateId();
    const createdAt = new Date();
    const paymentMethod = text(params.paymentMethod, 'cash');
    const isCredit = booleanValue(params.isCredit) || paymentMethod.toLowerCase() === 'credit';
    const customerName = text(params.customerName);
    if (isCredit && !customerName) throw new Error('အကြွေးရောင်းရန် customer name လိုအပ်ပါသည်။');
    const paidAmount = isCredit ? 0 : totalAmount;
    const balanceDue = isCredit ? totalAmount : 0;
    const ageVerified = booleanValue(params.ageVerified);
    appendObject(ss.getSheetByName('Sales'), {
      id: saleId, cashierId: actor.id, cashierName: actor.name, cashierEmail: actor.email,
      totalAmount: totalAmount, paidAmount: paidAmount, balanceDue: balanceDue,
      customerName: customerName, isCredit: isCredit, settledAt: '',
      paymentMethod: paymentMethod, ageVerified: ageVerified, createdAt: createdAt
    });

    const saleItemsSheet = ss.getSheetByName('SaleItems');
    saleItems.forEach(item => {
      item.saleId = saleId;
      appendObject(saleItemsSheet, item);
    });

    // Stock is stored as individual units. One bottle sold subtracts one;
    // selling a 12-unit pack subtracts 12 through the same quantity field.
    const productSheetHeaders = productsSheet.getRange(1, 1, 1, productsSheet.getLastColumn()).getValues()[0];
    const stockColumn = productSheetHeaders.indexOf('stockQty') + 1;
    products.forEach((product, index) => {
      const productId = text(product.id);
      if (remainingStock[productId] !== undefined) {
        productsSheet.getRange(index + 2, stockColumn).setValue(remainingStock[productId]);
      }
    });

    return {
      success: true,
      sale: {
        id: saleId,
        cashierId: actor.id,
        cashierName: actor.name,
        cashierEmail: actor.email,
        totalAmount,
        paidAmount,
        balanceDue,
        customerName,
        isCredit,
        settledAt: '',
        paymentMethod,
        ageVerified,
        createdAt: createdAt.toISOString(),
        items: saleItems
      }
    };
  } finally {
    lock.releaseLock();
  }
}

function payCredit(saleId) {
  initSheets();
  const sheet = ss.getSheetByName('Sales');
  const sales = sheetToObjects(sheet);
  const index = sales.findIndex(sale => text(sale.id) === text(saleId));
  if (index < 0) throw new Error('အကြွေးစာရင်း မတွေ့ပါ။');
  const sale = sales[index];
  if (numberValue(sale.balanceDue) <= 0) throw new Error('ဤအကြွေးစာရင်း ပေးချေပြီးဖြစ်ပါသည်။');
  sale.paidAmount = numberValue(sale.totalAmount);
  sale.balanceDue = 0;
  sale.settledAt = new Date().toISOString();
  const salesSheetHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.getRange(index + 2, 1, 1, salesSheetHeaders.length).setValues([salesSheetHeaders.map(header => sale[header] ?? '')]);
  return { success: true, sale: getSales().find(item => item.id === text(saleId)) };
}

function addProduct(params) {
  initSheets();
  const sheet = ss.getSheetByName('Products');
  const barcode = text(params && params.barcode);
  const name = text(params && params.name);
  const category = text(params && params.category);
  if (!name || !category) return { success: false, message: 'Product name နှင့် category လိုအပ်ပါသည်။' };

  let imageUrl = '';
  if (params.imageBase64) {
    imageUrl = uploadImageToDrive(params.imageBase64, params.imageFileName);
  }

  const product = {
    id: generateId(),
    barcode: barcode,
    name: name,
    category: category,
    price: numberValue(params.price),
    costPrice: numberValue(params.costPrice),
    stockQty: integerValue(params.stockQty),
    lowStockThreshold: integerValue(params.lowStockThreshold),
    unitsPerPack: Math.max(1, integerValue(params.unitsPerPack, 1)),
    packPrice: numberValue(params.packPrice),
    requiresAgeCheck: booleanValue(params.requiresAgeCheck),
    imageUrl: imageUrl,
    createdAt: new Date().toISOString()
  };

  appendObject(sheet, product);
  return { success: true, product: product };
}

function updateProduct(params) {
  initSheets();
  const sheet = ss.getSheetByName('Products');
  const products = sheetToObjects(sheet);
  const index = products.findIndex(p => String(p.id) === String(params.id));

  if (index < 0) {
    return { success: false, message: 'Product not found' };
  }

  const current = products[index];
  const productId = text(current.id);
  let imageUrl = text(current.imageUrl);
  if (params.imageBase64) {
    imageUrl = uploadImageToDrive(params.imageBase64, params.imageFileName);
  }

  const updated = {
    ...current,
    id: productId,
    barcode: params.barcode === undefined ? text(current.barcode) : text(params.barcode),
    name: params.name === undefined ? text(current.name) : text(params.name),
    category: params.category === undefined ? text(current.category) : text(params.category),
    price: params.price === undefined ? numberValue(current.price) : numberValue(params.price),
    costPrice: params.costPrice === undefined ? numberValue(current.costPrice) : numberValue(params.costPrice),
    stockQty: params.stockQty === undefined ? integerValue(current.stockQty) : integerValue(params.stockQty),
    lowStockThreshold: params.lowStockThreshold === undefined ? integerValue(current.lowStockThreshold) : integerValue(params.lowStockThreshold),
    unitsPerPack: params.unitsPerPack === undefined ? Math.max(1, integerValue(current.unitsPerPack, 1)) : Math.max(1, integerValue(params.unitsPerPack, 1)),
    packPrice: params.packPrice === undefined ? numberValue(current.packPrice) : numberValue(params.packPrice),
    requiresAgeCheck: params.requiresAgeCheck === undefined ? booleanValue(current.requiresAgeCheck) : booleanValue(params.requiresAgeCheck),
    imageUrl: imageUrl,
    createdAt: text(current.createdAt, new Date().toISOString())
  };

  const productUpdateHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  const row = productUpdateHeaders.map(header => updated[header] ?? '');
  sheet.getRange(index + 2, 1, 1, productUpdateHeaders.length).setValues([row]);
  return { success: true, product: updated };
}

function deleteProduct(id) {
  initSheets();
  const sheet = ss.getSheetByName('Products');
  const products = sheetToObjects(sheet);
  const index = products.findIndex(p => String(p.id) === String(id));

  if (index < 0) return { success: false, message: 'Product not found. Refresh Products and try again.' };
  // Optionally delete Drive image
  const product = products[index];
  if (product.imageUrl && product.imageUrl.includes('drive.google.com')) {
    try {
      const fileId = product.imageUrl.match(/id=([^&]+)/)?.[1];
      if (fileId) {
        DriveApp.getFileById(fileId).setTrashed(true);
      }
    } catch (err) {
      // Ignore if file not found
    }
  }
  sheet.deleteRow(index + 2);

  return { success: true };
}
