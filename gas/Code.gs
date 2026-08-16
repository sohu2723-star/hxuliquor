// Mini Mart POS - Google Apps Script Backend
// Tabs: Products, Sales, SaleItems, Users
// Deploy as Web App: Execute as "Me", Who has access: "Anyone"

const SHEET_ID = '1o0a1cRxDdk0dyfysq4jx3HL6OqNWT75iCZEBKygOoPY'; // Replace with your Sheet ID
const ADMIN_EMAIL = 'copy2723@gmail.com'; // Only this Google email can login
const ss = SpreadsheetApp.openById(SHEET_ID);
const GOOGLE_CLIENT_ID = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID') || '';
const ADMIN_ACTIONS = new Set(['getSales', 'getEmployees', 'addEmployee', 'deleteEmployee', 'addProduct', 'updateProduct', 'deleteProduct']);

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
    // Older deployments created sheets with fewer/different columns. Insert
    // missing columns in their canonical positions so existing row values move
    // with the columns instead of being read as the next field (price as cost,
    // barcode as name, etc.).
    let currentHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(String);
    headers.forEach((header, index) => {
      if (!currentHeaders.includes(header)) {
        sheet.insertColumnBefore(index + 1);
        sheet.getRange(1, index + 1).setValue(header).setFontWeight('bold');
        currentHeaders.splice(index, 0, header);
      }
    });
    return sheet;
  };

  const products = setupSheet('Products', [
    'id', 'barcode', 'name', 'category', 'price', 'costPrice',
    'stockQty', 'lowStockThreshold', 'requiresAgeCheck', 'imageUrl', 'createdAt'
  ]);
  setupSheet('Sales', [
    'id', 'cashierId', 'cashierName', 'totalAmount', 'paymentMethod', 'ageVerified', 'createdAt'
  ]);
  setupSheet('SaleItems', [
    'id', 'saleId', 'productId', 'productName', 'quantity', 'unitPrice', 'subtotal', 'unitCost', 'profit'
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
}

function appendObject(sheet, object) {
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
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
    requiresAgeCheck: booleanValue(p.requiresAgeCheck),
    imageUrl: text(p.imageUrl),
    createdAt: text(p.createdAt)
  })).filter(p => p.id);
}

function getProductByBarcode(barcode) {
  const products = getProducts();
  const scanned = String(barcode).trim();
  return products.find(p => String(p.barcode).split(/[,\n]/).some(code => {
    const saved = code.trim();
    return saved.endsWith('*') ? scanned.startsWith(saved.slice(0, -1)) : saved === scanned;
  })) || null;
}

function searchProducts(query) {
  const products = getProducts();
  const q = text(query).toLowerCase();
  return products.filter(p =>
    text(p.name).toLowerCase().includes(q) ||
    text(p.category).toLowerCase().includes(q) ||
    text(p.barcode).toLowerCase().includes(q)
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
  if (startDate || endDate) {
    filtered = filtered.filter(s => {
      const date = new Date(s.createdAt);
      if (isNaN(date.getTime())) return false;
      const day = Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      return (!startDate || day >= startDate) && (!endDate || day <= endDate);
    });
  }

  return filtered.map(sale => ({
    ...sale,
    id: text(sale.id),
    cashierId: text(sale.cashierId),
    cashierName: text(sale.cashierName, 'Cashier'),
    totalAmount: numberValue(sale.totalAmount),
    paymentMethod: text(sale.paymentMethod, 'cash'),
    ageVerified: booleanValue(sale.ageVerified),
    createdAt: text(sale.createdAt),
    items: items.filter(i => text(i.saleId) === text(sale.id)).map(i => ({
      ...i,
      id: text(i.id),
      saleId: text(i.saleId),
      productId: text(i.productId),
      productName: text(i.productName, 'Unnamed product'),
      quantity: integerValue(i.quantity),
      unitPrice: numberValue(i.unitPrice),
      subtotal: numberValue(i.subtotal),
      unitCost: numberValue(i.unitCost),
      profit: numberValue(i.profit)
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
    const data = getGoogleTokenData(idToken);
    const email = text(data.email).toLowerCase();

    initSheets();
    const usersSheet = ss.getSheetByName('Users');
    const users = sheetToObjects(usersSheet);
    let user = users.find(u => text(u.email).toLowerCase() === email);

    if (!user && email === ADMIN_EMAIL.toLowerCase()) {
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
    id: text(user.id),
    name: text(user.name, 'Unnamed employee'),
    email: text(user.email).toLowerCase(),
    role: text(user.role, 'employee').toLowerCase()
  })).filter(user => user.id && user.email);
}

function addEmployee(params) {
  initSheets();
  const sheet = ss.getSheetByName('Users');
  const name = text(params && params.name);
  const email = text(params && params.email).toLowerCase();
  if (!name || !email || !email.includes('@')) return { success: false, message: 'Name နှင့် မှန်ကန်သော Google email လိုအပ်ပါသည်။' };
  const users = sheetToObjects(sheet);
  if (users.some(user => text(user.email).toLowerCase() === email)) return { success: false, message: 'This email already exists' };
  const user = { id: generateId(), name, email, role: 'employee' };
  appendObject(sheet, { ...user, passwordHash: '', createdAt: new Date().toISOString() });
  return { success: true, user };
}

function deleteEmployee(id) {
  initSheets();
  const sheet = ss.getSheetByName('Users');
  const users = sheetToObjects(sheet);
  const index = users.findIndex(user => text(user.id) === text(id) && text(user.role).toLowerCase() !== 'admin');
  if (index < 0) return { success: false, message: 'Employee မတွေ့ပါ။' };
  sheet.deleteRow(index + 2);
  return { success: true };
}

function uploadImageToDrive(base64Data, fileName) {
  try {
    const dataUrlMatch = String(base64Data).match(/^data:([^;]+);base64,(.+)$/);
    const mimeType = dataUrlMatch ? dataUrlMatch[1] : 'image/jpeg';
    const encodedData = dataUrlMatch ? dataUrlMatch[2] : String(base64Data);
    // Validate size (max 2MB)
    const sizeInBytes = Math.round(encodedData.length * 3 / 4);
    if (sizeInBytes > 2 * 1024 * 1024) {
      throw new Error('Image size exceeds 2MB limit');
    }

    // Get or create folder
    const folderName = 'MiniMartProductImages';
    let folder = getOrCreateFolder(folderName);
    
    // Create file
    const blob = Utilities.newBlob(Utilities.base64Decode(encodedData), mimeType, fileName || 'product.jpg');
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return file.getUrl();
  } catch (err) {
    throw new Error('Failed to upload image: ' + err.message);
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

    const mergedItems = {};
    items.forEach(item => {
      const productId = text(item && item.productId);
      const quantity = integerValue(item && item.quantity);
      if (!productId || quantity <= 0) throw new Error('Cart item မမှန်ပါ။');
      mergedItems[productId] = (mergedItems[productId] || 0) + quantity;
    });

    const productsSheet = ss.getSheetByName('Products');
    const products = sheetToObjects(productsSheet);
    let totalAmount = 0;
    const saleItems = [];

    Object.keys(mergedItems).forEach(productId => {
      const quantity = mergedItems[productId];
      const product = products.find(p => text(p.id) === productId);
      if (!product) throw new Error(`Product ${productId} not found`);
      const stockQty = integerValue(product.stockQty);
      if (stockQty < quantity) throw new Error(`Insufficient stock for ${text(product.name, 'Unnamed product')}`);
      if (booleanValue(product.requiresAgeCheck) && !booleanValue(params.ageVerified)) {
        throw new Error('Age verification required for restricted items');
      }

      const unitPrice = numberValue(product.price);
      const subtotal = unitPrice * quantity;
      const unitCost = numberValue(product.costPrice);
      const profit = (unitPrice - unitCost) * quantity;
      totalAmount += subtotal;
      saleItems.push({
        id: generateId(),
        saleId: '',
        productId,
        productName: text(product.name, 'Unnamed product'),
        quantity,
        unitPrice,
        subtotal,
        unitCost,
        profit
      });
    });

    const saleId = generateId();
    const createdAt = new Date();
    const paymentMethod = text(params.paymentMethod, 'cash');
    const ageVerified = booleanValue(params.ageVerified);
    ss.getSheetByName('Sales').appendRow([
      saleId,
      actor.id,
      actor.name,
      totalAmount,
      paymentMethod,
      ageVerified,
      createdAt
    ]);

    const saleItemsSheet = ss.getSheetByName('SaleItems');
    const itemRows = saleItems.map(item => {
      item.saleId = saleId;
      return [item.id, item.saleId, item.productId, item.productName, item.quantity, item.unitPrice, item.subtotal, item.unitCost, item.profit];
    });
    if (itemRows.length) saleItemsSheet.getRange(saleItemsSheet.getLastRow() + 1, 1, itemRows.length, itemRows[0].length).setValues(itemRows);

    const productsHeaders = productsSheet.getRange(1, 1, 1, Math.max(productsSheet.getLastColumn(), 1)).getValues()[0];
    const stockColumn = productsHeaders.indexOf('stockQty') + 1;
    if (!stockColumn) throw new Error('Products sheet တွင် stockQty column မရှိပါ။');
    Object.keys(mergedItems).forEach(productId => {
      const rowIndex = products.findIndex(p => text(p.id) === productId);
      const newStock = integerValue(products[rowIndex].stockQty) - mergedItems[productId];
      productsSheet.getRange(rowIndex + 2, stockColumn).setValue(newStock);
    });

    return {
      success: true,
      sale: {
        id: saleId,
        cashierId: actor.id,
        cashierName: actor.name,
        totalAmount,
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

function addProduct(params) {
  initSheets();
  const sheet = ss.getSheetByName('Products');
  const barcode = text(params && params.barcode);
  const name = text(params && params.name);
  const category = text(params && params.category);
  if (!name || !category) return { success: false, message: 'Product name နှင့် category လိုအပ်ပါသည်။' };

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const existing = sheetToObjects(sheet);
    if (barcode && existing.some(product => text(product.barcode) === barcode)) {
      return { success: false, message: 'ဒီ barcode ရှိပြီးသား product တစ်ခုရှိပါသည်။' };
    }

    let imageUrl = '';
    if (params.imageBase64) imageUrl = uploadImageToDrive(params.imageBase64, params.imageFileName);
    const product = {
      id: generateId(),
      barcode,
      name,
      category,
      price: numberValue(params.price),
      costPrice: numberValue(params.costPrice),
      stockQty: integerValue(params.stockQty),
      lowStockThreshold: integerValue(params.lowStockThreshold),
      requiresAgeCheck: booleanValue(params.requiresAgeCheck),
      imageUrl,
      createdAt: new Date().toISOString()
    };
    appendObject(sheet, product);
    return { success: true, product };
  } finally {
    lock.releaseLock();
  }
}

function updateProduct(params) {
  initSheets();
  const sheet = ss.getSheetByName('Products');
  const products = sheetToObjects(sheet);
  const productId = text(params && params.id);
  const index = products.findIndex(p => text(p.id) === productId);
  if (index < 0) return { success: false, message: 'Product not found' };

  const current = products[index];
  const barcode = params.barcode === undefined ? text(current.barcode) : text(params.barcode);
  const name = params.name === undefined ? text(current.name) : text(params.name);
  const category = params.category === undefined ? text(current.category) : text(params.category);
  if (!name || !category) return { success: false, message: 'Product name နှင့် category လိုအပ်ပါသည်။' };
  if (barcode && products.some((product, row) => row !== index && text(product.barcode) === barcode)) {
    return { success: false, message: 'ဒီ barcode ရှိပြီးသား product တစ်ခုရှိပါသည်။' };
  }

  let imageUrl = text(current.imageUrl);
  if (params.imageBase64) imageUrl = uploadImageToDrive(params.imageBase64, params.imageFileName);
  const updated = {
    ...current,
    id: productId,
    barcode,
    name,
    category,
    price: params.price === undefined ? numberValue(current.price) : numberValue(params.price),
    costPrice: params.costPrice === undefined ? numberValue(current.costPrice) : numberValue(params.costPrice),
    stockQty: params.stockQty === undefined ? integerValue(current.stockQty) : integerValue(params.stockQty),
    lowStockThreshold: params.lowStockThreshold === undefined ? integerValue(current.lowStockThreshold) : integerValue(params.lowStockThreshold),
    requiresAgeCheck: params.requiresAgeCheck === undefined ? booleanValue(current.requiresAgeCheck) : booleanValue(params.requiresAgeCheck),
    imageUrl,
    createdAt: text(current.createdAt, new Date().toISOString())
  };

  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  const row = headers.map(header => updated[header] ?? '');
  sheet.getRange(index + 2, 1, 1, headers.length).setValues([row]);
  return { success: true, product: updated };
}

function deleteProduct(id) {
  initSheets();
  const sheet = ss.getSheetByName('Products');
  const products = sheetToObjects(sheet);
  const index = products.findIndex(p => p.id === id);

  if (index >= 0) {
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
  }

  return { success: true };
}
