// Mini Mart POS - Google Apps Script Backend
// Tabs: Products, Sales, SaleItems, Users
// Deploy as Web App: Execute as "Me", Who has access: "Anyone"

const SHEET_ID = '1o0a1cRxDdk0dyfysq4jx3HL6OqNWT75iCZEBKygOoPY'; // Replace with your Sheet ID
const ss = SpreadsheetApp.openById(SHEET_ID);

// CORS note:
// Apps Script Web Apps have CORS limitations when called with custom headers
// (like Content-Type: application/json). To avoid preflight OPTIONS requests,
// the frontend sends JSON as a plain string in the body with Content-Type: text/plain.
// This backend reads e.postData.contents and parses JSON manually.

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
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
      case 'createSale': result = createSale(params); break;
      case 'addProduct': result = addProduct(params); break;
      case 'updateProduct': result = updateProduct(params); break;
      case 'deleteProduct': result = deleteProduct(params.id); break;
      default: result = { success: false, message: 'Unknown action' };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
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
    return sheet;
  };

  setupSheet('Products', [
    'id', 'barcode', 'name', 'category', 'price', 'costPrice',
    'stockQty', 'lowStockThreshold', 'requiresAgeCheck', 'imageUrl', 'createdAt'
  ]);
  setupSheet('Sales', [
    'id', 'cashierId', 'cashierName', 'totalAmount', 'paymentMethod', 'ageVerified', 'createdAt'
  ]);
  setupSheet('SaleItems', [
    'id', 'saleId', 'productId', 'productName', 'quantity', 'unitPrice', 'subtotal'
  ]);
  setupSheet('Users', [
    'id', 'name', 'email', 'passwordHash', 'role', 'createdAt'
  ]);
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
  return products.find(p => p.barcode == barcode) || null;
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
    filtered = filtered.filter(s => s.createdAt >= startDate);
  }
  if (endDate) {
    filtered = filtered.filter(s => s.createdAt <= endDate + ' 23:59:59');
  }

  return filtered.map(sale => ({
    ...sale,
    totalAmount: parseFloat(sale.totalAmount) || 0,
    ageVerified: sale.ageVerified === true || sale.ageVerified === 'TRUE' || sale.ageVerified === 'true',
    items: items.filter(i => i.saleId === sale.id).map(i => ({
      ...i,
      quantity: parseInt(i.quantity) || 0,
      unitPrice: parseFloat(i.unitPrice) || 0,
      subtotal: parseFloat(i.subtotal) || 0
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

function uploadImageToDrive(base64Data, fileName) {
  try {
    // Validate size (max 2MB)
    const base64Length = base64Data.length - base64Data.indexOf(',') - 1;
    const sizeInBytes = Math.round(base64Length * 3 / 4);
    if (sizeInBytes > 2 * 1024 * 1024) {
      throw new Error('Image size exceeds 2MB limit');
    }

    // Get or create folder
    const folderName = 'MiniMartProductImages';
    let folder = getOrCreateFolder(folderName);
    
    // Create file
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), 'image/jpeg', fileName || 'product.jpg');
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
      totalAmount += subtotal;

      saleItems.push({
        id: generateId(),
        saleId: '',
        productId: item.productId,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: unitPrice,
        subtotal: subtotal
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
        item.subtotal
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

  sheet.appendRow([
    product.id,
    product.barcode,
    product.name,
    product.category,
    product.price,
    product.costPrice,
    product.stockQty,
    product.lowStockThreshold,
    product.requiresAgeCheck,
    product.imageUrl,
    product.createdAt
  ]);

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
