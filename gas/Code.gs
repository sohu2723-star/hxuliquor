// Mini Mart POS - Google Apps Script Backend
// Tabs: Products, Sales, SaleItems, Users
// Deploy as Web App: Execute as "Me", Who has access: "Anyone"

const SHEET_ID = '1o0a1cRxDdk0dyfysq4jx3HL6OqNWT75iCZEBKygOoPY'; // Replace with your Sheet ID
const ADMIN_EMAIL = 'copy2723@gmail.com'; // Only this Google email can login
const ss = SpreadsheetApp.openById(SHEET_ID);

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
    const action = e.parameter.action;
    let params = {};

    if (e.postData && e.postData.contents) {
      params = JSON.parse(e.postData.contents);
    } else {
      for (const key in e.parameter) {
        if (key !== 'action') params[key] = e.parameter[key];
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
      case 'createSale': result = createSale(params); break;
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

function getProducts() {
  initSheets();
  const sheet = ss.getSheetByName('Products');
  const products = sheetToObjects(sheet);
  return products.map(p => ({
    ...p,
    price: parseFloat(p.price) || 0,
    costPrice: parseFloat(p.costPrice) || 0,
    stockQty: parseInt(p.stockQty) || 0,
    lowStockThreshold: parseInt(p.lowStockThreshold) || 0,
    requiresAgeCheck: p.requiresAgeCheck === true || p.requiresAgeCheck === 'TRUE' || p.requiresAgeCheck === 'true'
  }));
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
  const q = query.toLowerCase();
  return products.filter(p => 
    p.name.toLowerCase().includes(q) ||
    p.category.toLowerCase().includes(q)
  );
}

function getCategories() {
  const products = getProducts();
  const cats = [...new Set(products.map(p => p.category).filter(c => c))];
  return cats.sort();
}

function getSales(startDate, endDate) {
  initSheets();
  const salesSheet = ss.getSheetByName('Sales');
  const itemsSheet = ss.getSheetByName('SaleItems');
  const sales = sheetToObjects(salesSheet);
  const items = sheetToObjects(itemsSheet);

  let filtered = sales;
  if (startDate) {
    filtered = filtered.filter(s => Utilities.formatDate(new Date(s.createdAt), Session.getScriptTimeZone(), 'yyyy-MM-dd') >= startDate);
  }
  if (endDate) {
    filtered = filtered.filter(s => Utilities.formatDate(new Date(s.createdAt), Session.getScriptTimeZone(), 'yyyy-MM-dd') <= endDate);
  }

  return filtered.map(sale => ({
    ...sale,
    totalAmount: parseFloat(sale.totalAmount) || 0,
    ageVerified: sale.ageVerified === true || sale.ageVerified === 'TRUE' || sale.ageVerified === 'true',
    items: items.filter(i => i.saleId === sale.id).map(i => ({
      ...i,
      quantity: parseInt(i.quantity) || 0,
      unitPrice: parseFloat(i.unitPrice) || 0,
      subtotal: parseFloat(i.subtotal) || 0,
      unitCost: parseFloat(i.unitCost) || 0,
      profit: parseFloat(i.profit) || 0
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
    let user = users.find(u => u.email === email);

    if (!user && email === ADMIN_EMAIL.toLowerCase()) {
      const id = generateId();
      const name = data.name || email.split('@')[0];
      const newUser = {
        id: id,
        name: name,
        email: email,
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
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
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
  if (index >= 0) sheet.deleteRow(index + 2);
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

function createSale(params) {
  initSheets();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const { cashierId, cashierName, items, ageVerified, paymentMethod } = params;
    const productsSheet = ss.getSheetByName('Products');
    const products = sheetToObjects(productsSheet);

    let totalAmount = 0;
    const saleItems = [];

    for (const item of items) {
      const product = products.find(p => p.id === item.productId);
      if (!product) {
        throw new Error(`Product ${item.productId} not found`);
      }
      if ((parseInt(product.stockQty) || 0) < item.quantity) {
        throw new Error(`Insufficient stock for ${product.name}`);
      }
      if (product.requiresAgeCheck && !ageVerified) {
        throw new Error('Age verification required for restricted items');
      }

      const unitPrice = parseFloat(product.price) || 0;
      const subtotal = unitPrice * item.quantity;
      const unitCost = parseFloat(product.costPrice) || 0;
      const profit = (unitPrice - unitCost) * item.quantity;
      totalAmount += subtotal;

      saleItems.push({
        id: generateId(),
        saleId: '',
        productId: item.productId,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: unitPrice,
        subtotal: subtotal,
        unitCost: unitCost,
        profit: profit
      });
    }

    const saleId = generateId();
    const salesSheet = ss.getSheetByName('Sales');
    salesSheet.appendRow([
      saleId,
      cashierId,
      cashierName,
      totalAmount,
      paymentMethod,
      ageVerified,
      new Date()
    ]);

    const saleItemsSheet = ss.getSheetByName('SaleItems');
    saleItems.forEach(item => {
      item.saleId = saleId;
      saleItemsSheet.appendRow([
        item.id,
        item.saleId,
        item.productId,
        item.productName,
        item.quantity,
        item.unitPrice,
        item.subtotal,
        item.unitCost,
        item.profit
      ]);
    });

    // Deduct stock
    for (const item of items) {
      const rowIndex = products.findIndex(p => p.id === item.productId);
      if (rowIndex >= 0) {
        const newStock = (parseInt(products[rowIndex].stockQty) || 0) - item.quantity;
        productsSheet.getRange(rowIndex + 2, 7).setValue(newStock);
      }
    }

    lock.releaseLock();
    return {
      success: true,
      sale: {
        id: saleId,
        cashierId,
        cashierName,
        totalAmount,
        paymentMethod,
        ageVerified,
        createdAt: new Date().toISOString(),
        items: saleItems
      }
    };
  } catch (err) {
    lock.releaseLock();
    throw err;
  }
}

function addProduct(params) {
  initSheets();
  const sheet = ss.getSheetByName('Products');
  const id = generateId();
  const createdAt = new Date().toISOString();

  let imageUrl = '';
  if (params.imageBase64) {
    imageUrl = uploadImageToDrive(params.imageBase64, params.imageFileName);
  }

  const product = {
    id,
    barcode: params.barcode || '',
    name: params.name || '',
    category: params.category || '',
    price: parseFloat(params.price) || 0,
    costPrice: parseFloat(params.costPrice) || 0,
    stockQty: parseInt(params.stockQty) || 0,
    lowStockThreshold: parseInt(params.lowStockThreshold) || 0,
    requiresAgeCheck: params.requiresAgeCheck === true || params.requiresAgeCheck === 'TRUE',
    imageUrl,
    createdAt
  };

  appendObject(sheet, product);

  return { success: true, product };
}

function updateProduct(params) {
  initSheets();
  const sheet = ss.getSheetByName('Products');
  const products = sheetToObjects(sheet);
  const index = products.findIndex(p => p.id === params.id);

  if (index < 0) {
    return { success: false, message: 'Product not found' };
  }

  let imageUrl = products[index].imageUrl;
  if (params.imageBase64) {
    imageUrl = uploadImageToDrive(params.imageBase64, params.imageFileName);
  }

  const updated = {
    ...products[index],
    ...params,
    imageUrl
  };

  const headers = Object.keys(products[0]);
  const row = headers.map(h => updated[h]);
  sheet.getRange(index + 2, 1, 1, headers.length).setValues([row]);

  return { success: true };
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
