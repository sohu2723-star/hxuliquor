# Deployment Guide

## Google Apps Script Backend

### Setup
1. Create a Google Sheet with tabs: `Products`, `Sales`, `SaleItems`, `Users`
2. Go to [script.google.com](https://script.google.com/)
3. Create a new project
4. Paste `gas/Code.gs` into the editor
5. Update `SHEET_ID` in the code with your Sheet ID

### First-Run Authorization
On first execution, Apps Script will prompt for permissions. Grant:
- **Google Drive**: `https://www.googleapis.com/auth/drive`
- **Google Sheets**: `https://www.googleapis.com/auth/spreadsheets`

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
3. Add environment variable: `VITE_GAS_URL` = your Apps Script URL
4. Click **Deploy**

### Redeploying Apps Script
1. Open your Apps Script project
2. Make changes to `Code.gs`
3. Click **Deploy** > **Manage deployments**
4. Click **Edit** on the active deployment
5. Select **New version** and deploy
6. The URL typically stays the same

## Testing
1. Open the deployed Vercel URL
2. Login with a user from the `Users` sheet
3. Test scanning, cart, checkout
4. Verify sales appear in the `Sales` and `SaleItems` sheets
