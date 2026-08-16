# Deployment Guide

## Google Apps Script Backend

### Setup

1. Create a Google Sheet with tabs: `Products`, `Sales`, `SaleItems`, `Users`
2. Go to [script.google.com](https://script.google.com/)
3. Create a new project
4. Open the editor's existing `Code.gs`, select **all** of its contents, and replace it with the complete `gas/Code.gs` file. Do not append a new copy below old code. Enable **Show "appsscript.json" manifest file in editor** in Project Settings and replace that manifest with `gas/appsscript.json`.
5. Update `SHEET_ID` in the code with your Sheet ID

### First-Run Authorization

Select `authorizeServices`, click **Run**, and grant the deployment-owner account these permissions:

- **Google Drive**: `https://www.googleapis.com/auth/drive`
- **Google Sheets**: `https://www.googleapis.com/auth/spreadsheets`
- **External requests**: `https://www.googleapis.com/auth/script.external_request`

If Google login reports that `UrlFetchApp.fetch` is not permitted, run `authorizeServices` again and accept every consent prompt, then deploy a **New version**. The function must be authorized by the same account selected by **Execute as: Me**.

### Deploy

1. Click **Deploy** > **New deployment**
2. Select type: **Web app**
3. Execute as: **Me**
4. Who has access: **Anyone**
5. Click **Deploy** and copy the URL

## Vercel Deployment

### Setup

1. Push this repo to GitHub
2. Go to [vercel.com](https://vercel.com/) and import the repo
3. Add environment variable: `GAS_URL` = your Apps Script URL
4. Click **Deploy**

`GAS_URL` must be the deployed Web app URL ending in `/exec`—not the Apps Script editor URL and not a `/dev` test URL. If the app reports HTTP 404, copy the current URL from **Deploy → Manage deployments**, replace `GAS_URL` in Vercel for Production, Preview, and Development, then redeploy Vercel.

### Redeploying Apps Script

1. Open your Apps Script project
2. Make changes to `Code.gs`
3. Click **Deploy** > **Manage deployments**
4. Click **Edit** on the active deployment
5. Select **New version** and deploy
6. The URL typically stays the same

If Apps Script reports `Identifier '...' has already been declared`, the editor contains duplicated old/new code. Select all content in `Code.gs`, paste one complete fresh copy of `gas/Code.gs`, save, and deploy a new version. Replacing only a section can leave a second declaration elsewhere in the file.

After deploying this version, open the Products page once. `initSheets()` will automatically repair older `Products`/`Users` column layouts, generate missing row IDs, and prevent barcode/name/price values from shifting into the wrong fields.

It also repairs the known legacy shifted-row pattern where a numeric barcode appeared as the product name, the real name appeared as category, and price/stock displayed as zero. Product and employee deletion now return an explicit error instead of silently reporting success when an ID cannot be found.

## Testing

1. Open the deployed Vercel URL
2. Login with a user from the `Users` sheet
3. Test scanning, cart, checkout
4. Verify sales appear in the `Sales` and `SaleItems` sheets
