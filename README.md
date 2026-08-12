# Mini Mart POS

A complete point-of-sale system for a mini-mart, built with React + Vite + TailwindCSS and Google Apps Script as the backend.

## Features

- **Barcode/QR Scanning**: Camera-based product lookup using html5-qrcode
- **Cart Management**: Add/remove items, quantity controls, running total
- **Age Verification**: Mandatory toggle for restricted items (cigarettes/alcohol)
- **Payment Methods**: Cash, Card, Mobile Wallet
- **Product Management**: Admin panel with image upload to Google Drive
- **Sales History**: View transactions with date range filtering
- **PWA Support**: Installable on mobile devices, works offline for app shell
- **Multi-role Auth**: Admin and cashier roles with protected routes

## Tech Stack

- **Frontend**: React 18 + Vite + TypeScript + TailwindCSS
- **Backend**: Google Apps Script + Google Sheets
- **Storage**: Google Drive for product images
- **Hosting**: Vercel
- **PWA**: vite-plugin-pwa + Workbox

## Prerequisites

- Node.js 18+
- A Google account
- A GitHub account
- A Vercel account
- A Google Sheet with 4 tabs: `Products`, `Sales`, `SaleItems`, `Users`

## Project Structure

```
minimart-pos/
├── src/
│   ├── lib/
│   │   └── api.ts              # API client for Google Apps Script
│   ├── contexts/
│   │   └── AuthContext.tsx     # Authentication state management
│   ├── components/
│   │   ├── Scanner.tsx         # Camera barcode/QR scanner
│   │   ├── Cart.tsx            # Shopping cart sidebar
│   │   ├── Checkout.tsx        # Payment + age verification modal
│   │   ├── ProductList.tsx     # Admin product table
│   │   └── ProductForm.tsx     # Add/edit product modal
│   ├── pages/
│   │   ├── Login.tsx           # Login page
│   │   ├── POS.tsx             # Cashier POS screen
│   │   └── AdminProducts.tsx   # Admin product management
│   ├── App.tsx                 # Routes with ProtectedRoute
│   ├── main.tsx                # App entry point
│   └── index.css               # TailwindCSS imports
├── gas/
│   └── Code.gs                 # Google Apps Script backend
├── public/
├── vite.config.ts              # Vite + PWA configuration
├── vercel.json                 # Vercel SPA routing
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
└── .env.example
```

## Step 1: Deploy Google Apps Script Backend

1. Create a new Google Sheet with 4 tabs: `Products`, `Sales`, `SaleItems`, `Users`
2. Go to [script.google.com](https://script.google.com/) and create a new project
3. Delete any default code and paste the contents of `gas/Code.gs`
4. Update `SHEET_ID` at the top of `Code.gs` with your Google Sheet ID (from the URL)
5. On first run, you will be prompted to authorize. Grant the permissions:
   - **Google Drive**: `https://www.googleapis.com/auth/drive` (needed for image uploads)
   - **Google Sheets**: `https://www.googleapis.com/auth/spreadsheets` (to read/write data)
   - **Basic**: `https://www.googleapis.com/auth/script.external_request` (if making external requests)
6. Click **Deploy** > **New deployment**
7. Select type: **Web app**
8. Set **Execute as**: **Me**
9. Set **Who has access**: **Anyone**
10. Click **Deploy** and copy the Web App URL
11. Keep this URL for the next step

### Google Apps Script Permissions

The script requires these OAuth scopes:
- `https://www.googleapis.com/auth/drive` — Create folders and upload product images to Google Drive
- `https://www.googleapis.com/auth/spreadsheets` — Read/write product, sales, and user data
- `https://www.googleapis.com/auth/script.external_request` — Standard Apps Script scope

## Step 2: Local Development

```bash
cd minimart-pos
npm install
cp .env.example .env
# Edit .env and set VITE_GAS_URL to your Apps Script Web App URL
npm run dev
```

Open `http://localhost:5173` in your browser.

## Step 3: Push to GitHub

```bash
git init
git add -A
git commit -m "Initial commit: Mini Mart POS"
git remote add origin https://github.com/YOUR_USERNAME/minimart-pos.git
git push -u origin main
```

## Step 4: Deploy to Vercel

1. Go to [vercel.com](https://vercel.com/) and sign in
2. Click **Add New...** > **Project**
3. Import your `minimart-pos` GitHub repository
4. Under **Environment Variables**, add:
   - `VITE_GAS_URL` = your Apps Script Web App URL from Step 1
5. Click **Deploy**

Vercel will build and deploy your app. You will get a URL like `https://minimart-pos.vercel.app`.

## Step 5: Redeploying the Apps Script Backend

When you update `gas/Code.gs`:

1. Go to [script.google.com](https://script.google.com/)
2. Open your project
3. Make your changes
4. Click **Deploy** > **Manage deployments**
5. Click **Edit** on the current deployment
6. Select **New version** and click **Deploy**
7. The URL usually stays the same, so no frontend changes are needed

## Step 6: Testing Camera Scanning + PWA Install

### On Android:
1. Open `https://your-app.vercel.app` in Chrome
2. Grant camera permission when prompted
3. Tap the **Scan** button to open the camera
4. Point at a product barcode (EAN-13, UPC, Code128)
5. Chrome will show an **"Add to Home Screen"** banner (or tap menu > "Add to Home Screen")
6. Once installed, the app launches fullscreen like a native app

### On iOS:
1. Open in Safari (not Chrome)
2. Tap **Share** > **Add to Home Screen**
3. Camera access works in standalone PWA mode on iOS 16.4+
4. Note: iOS Safari may request camera permission each time until installed

## Step 7: Testing the Full Flow

1. **Login**: Use an admin account from the `Users` sheet
2. **Add Products**: Go to `/admin/products`, add products with images
3. **Scan**: Use the Scan button or search manually
4. **Cart**: Verify quantities update correctly
5. **Checkout**: Select payment method, confirm age check for restricted items, complete sale
6. **Verify**: Check the `Sales` and `SaleItems` sheets for the transaction

## Known Apps Script Limitations

- **Execution Quotas**: Apps Script has daily quotas (90,000 calls/day for consumer accounts, 1,000,000 for Workspace). Monitor usage if the shop gets busy.
- **Latency**: Typical response time is 1-3 seconds. Add loading spinners for all API calls.
- **No Real Transactions**: `LockService` prevents race conditions during concurrent checkouts, but Apps Script is not a relational database.
- **Cold Starts**: First request after inactivity can take 5-10 seconds. Subsequent calls are faster.
- **Sheet Limits**: Google Sheets maxes at ~10 million cells. Plan for exports if needed.
- **Image Upload Delay**: Google Drive image uploads add 1-2 seconds to product creation. This is expected.

## When to Migrate to Supabase

Consider migrating if:
- You need sub-second API response times
- You want real-time inventory sync across multiple devices
- You need proper relational queries and reporting
- You want offline mode with local-first sync
- You exceed Apps Script quotas

For a single-location shop with <500 transactions/day, Apps Script is usually sufficient.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_GAS_URL` | Google Apps Script Web App URL |

## License

MIT
