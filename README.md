# QHVAC Inspection Tool

A modern, offline-first inspection form application built with React, TypeScript, and Cloudscape Design Components. This Progressive Web App (PWA) works seamlessly online and offline, with all data persisted locally.

## Features

- ✅ **Offline-First**: Works without internet connection after first visit
- ✅ **PWA Support**: Installable on desktop and mobile
- ✅ **Dynamic Forms**: JSON-based form schemas with conditional visibility
- ✅ **Form Validation**: Multiple validation rule types with real-time feedback
- ✅ **Data Persistence**: localStorage-based data storage
- ✅ **Multi-Form Types**: Support for Electrical and HVAC inspections
- ✅ **Inspection Management**: View, filter, sort, and delete inspections
- ✅ **Session Management**: Editable session names and upload status tracking
- ✅ **Responsive Design**: Works on desktop, tablet, and mobile

## Tech Stack

- **Frontend**: React 18.3 + TypeScript 5.6
- **UI Components**: Cloudscape Design Components 3.0
- **Routing**: React Router 6.26
- **Build Tool**: Vite 7.3
- **PWA**: vite-plugin-pwa with Workbox
- **Package Manager**: npm

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm 9+

### Local Development

1. Clone the repository
```bash
git clone https://github.com/yourusername/React-PoC.git
cd React-PoC
```

2. Install dependencies
```bash
npm install
```

3. Start development server
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Building for Production

```bash
npm run build
```

This creates an optimized `dist` folder ready for deployment.

### Testing Offline Mode

1. Build and preview the production app:
```bash
npm run build
npm run preview
```

2. Open the app in Chrome/Edge
3. Open DevTools (F12) → Network tab
4. Click the dropdown at top-left (currently "Online")
5. Select "Offline"
6. Refresh the page - app should load from cache
7. All functionality works with cached assets and localStorage

## Project Structure

```
src/
├── components/
│   └── FormRenderer.tsx      # Dynamic form rendering engine
├── pages/
│   ├── Home.tsx              # Home page
│   ├── FillForm.tsx          # Form filling page
│   ├── MyInspections.tsx     # Inspection management page
│   ├── NewForm.tsx           # Form type selection
│   └── NewInspection.tsx     # Inspection creation
├── resources/
│   ├── electrical.json       # Electrical form schema
│   └── hvac.json            # HVAC form schema
├── utils/
│   └── FormValidator.ts     # Validation & visibility logic
├── Layout.tsx               # App layout with sidebar
├── routes.tsx              # Route definitions
├── types.ts                # TypeScript interfaces
└── main.tsx               # App entry point
```

## Form Schemas

Forms are defined in JSON files under `src/resources/`:

- **Electrical**: `/src/resources/electrical.json`
- **HVAC**: `/src/resources/hvac.json`

Each form includes:
- Field definitions with types, labels, and validation rules
- Conditional visibility logic
- External ID mappings for data export

## Data Storage

All inspection data is stored in the browser's `localStorage`:

- `inspection_{sessionId}`: Persistent session metadata
- `formData_{sessionId}`: Form field responses with external IDs
- `currentSession`: Active session reference

Data persists across:
- Page refreshes
- Browser restarts
- Offline usage
- Multiple browser windows

## Deployment to Azure

### Prerequisites

- Azure account ([Create free account](https://azure.microsoft.com/free))
- GitHub repository (public or private)
- GitHub account with repo access

### Setup Instructions

1. **Create Azure Static Web App**

   - Go to [Azure Portal](https://portal.azure.com)
   - Click "Create a resource" 
   - Search for and select "Static Web App"
   - Fill in details:
     - **Resource Group**: Create new or select existing
     - **Name**: `qhvac-inspection-tool` (or preferred name)
     - **Region**: Select closest to your users
     - **SKU**: Free or Standard
     - **Source**: GitHub
     - **GitHub Account**: Sign in and authorize Azure
     - **Organization**: Select your GitHub org
     - **Repository**: Select `React-PoC`
     - **Branch**: `main`
     - **Build Presets**: Custom
     - **App location**: `/`
     - **API location**: (leave blank)
     - **Output location**: `dist`
   
   - Click "Review + Create" → "Create"

2. **Azure Auto-Configuration**

   After creation, Azure will:
   - Generate a deployment token
   - Automatically add `AZURE_STATIC_WEB_APPS_TOKEN` to GitHub repo secrets
   - Trigger the first deployment workflow

3. **Verify Deployment**

   - Go to GitHub → Your repo → **Actions** tab
   - Watch the `Deploy to Azure Static Web Apps` workflow run
   - Once complete (green checkmark), your app is live!
   - View your app URL in the Azure Portal under your Static Web App resource

### GitHub Secrets

The deployment workflow requires one secret:

- **`AZURE_STATIC_WEB_APPS_TOKEN`**: Automatically set by Azure during Static Web App creation

**To verify the secret is present:**
1. Go to GitHub → Your repo → Settings → Secrets and variables → Actions
2. You should see `AZURE_STATIC_WEB_APPS_TOKEN` listed
3. If missing, create it manually:
   - In Azure Portal, go to your Static Web App
   - Click "Manage deployment token" 
   - Copy the token
   - Add it to GitHub repo secrets with key `AZURE_STATIC_WEB_APPS_TOKEN`

### CI/CD Workflow

The GitHub Actions workflow (`.github/workflows/deploy.yml`) automatically:

- ✅ Installs dependencies
- ✅ Runs TypeScript type checking
- ✅ Builds optimized production bundle
- ✅ Deploys to Azure Static Web Apps
- ✅ Configures SPA routing (all routes → index.html)
- ✅ Sets cache headers for optimal performance
- ✅ Includes security headers (XSS, clickjacking protection)

**Deployment triggers:**
- Commits to `main` branch
- Pull requests to `main` branch

### Post-Deployment

Once deployed:

1. **Update App URL**: Share the Azure Static Web App URL with users
2. **Custom Domain** (optional): 
   - In Azure Portal → Custom domains
   - Add your own domain (e.g., `inspections.yourdomain.com`)
3. **HTTPS**: Automatic (Azure provides free SSL)
4. **Offline Support**: PWA works fully offline after first visit

## Scripts

```bash
npm run dev       # Start development server
npm run build     # Build for production
npm run preview   # Preview production build locally
npm run typecheck # Run TypeScript checks
npm run lint      # Run type checks + ESLint
```

## Adding a Feature with specKit

Use the `create-new-feature.ps1` helper to scaffold a new feature spec:

```powershell
.\.specify\scripts\powershell\create-new-feature.ps1 -SpecPath "specs\001-new-feature\spec.md"
```

## Validation Rules

Forms support these validation types:

- `minLength`: Minimum string length
- `maxLength`: Maximum string length
- `min`: Minimum numeric value
- `max`: Maximum numeric value
- `pattern`: Regex pattern matching
- `custom`: Custom validation function

## Conditional Field Visibility

Fields can be shown/hidden based on other field values using:

- `equals`: Exact value match
- `notEquals`: Value does not match
- `contains`: String contains substring
- `greaterThan`: Numeric comparison
- `lessThan`: Numeric comparison

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- All modern mobile browsers

## License

MIT
