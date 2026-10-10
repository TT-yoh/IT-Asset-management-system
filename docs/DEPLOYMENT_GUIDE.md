# OmniAsset Enterprise IT Asset Management - Production Deployment Guide

## 1. Executive Summary & Readiness
All dummy records, test assets, sample work orders, and demo accounts have been completely purged from both the live database and frontend fallback collections. The system is in a clean **Day-1 Production State** with zero inventory and active cryptographic audit-chain genesis.

### Clean Baseline State
| Entity | Status | Description |
| :--- | :--- | :--- |
| **Assets Inventory** | `0 Records` | Pristine state ready for physical asset intake / barcode onboarding |
| **Checkouts / Custody** | `0 Records` | Zero active checkouts |
| **Maintenance Tickets** | `0 Records` | Zero open repair orders |
| **Budgets** | `0 Records` | Ready for financial year allocations |
| **Super Admin** | `Active` | Email: `ishmaelt42@gmail.com` |
| **Primary Organization** | `org-omnitech` | OmniTech Enterprise Systems |
| **Primary Facility** | `branch-main` | Global Headquarters |
| **Cryptographic Audit Chain** | `Genesis Initialized` | Sequential SHA-256 hash chaining active |

---

## 2. Super Admin Initial Credentials

Upon initial deployment, use the provisioned enterprise Super Admin account to access the administrative portal and invite staff:

- **Portal URL**: `/` or `/login`
- **Username / Email**: `ishmaelt42@gmail.com`
- **Password**: `Tatenda3@4`
- **Role**: `SUPER_ADMIN` (Omni-tenant and system-wide privileges)

> **Important**: Upon first production deployment, you can immediately manage users in **Admin Settings > Staff**, configure branch locations, and generate initial asset tags.

---

## 3. Environment Variables Specification

Ensure the following variables are configured in your production environment (e.g., host environment, `.env`, or cloud secrets vault):

```bash
# Node & Gateway Port
PORT=3001
NODE_ENV=production

# Security Session & Signing Secret (Generate 32+ random hex characters)
SESSION_SECRET=change-this-to-a-secure-random-32-byte-hex-key

# PingCAP TiDB Cloud (TLS connection on Port 4000)
TIDB_HOST=gateway01.us-east-1.prod.aws.tidbcloud.com
TIDB_PORT=4000
TIDB_USER=<your-tidb-cluster-user>
TIDB_PASSWORD=<your-tidb-cluster-password>
TIDB_DATABASE=it_asset_ledger
TIDB_SSL=true

# AI Assistant & Depreciation Advisor (Optional)
GEMINI_API_KEY=<your-google-gemini-api-key>

# Application Base URL (for email links and webhooks)
APP_URL=https://assets.yourcompany.com
```

---

## 4. Deployment Architectures

OmniAsset supports both **Unified Single-Process Deployment** (Express serves both the `/api/*` endpoints and the compiled React SPA from `dist/`) or **Decoupled Architecture** (Static CDN frontend + Node API server).

### Option A: Unified Container Deployment (Docker)

A multi-stage `Dockerfile` is included in the project root.

1. **Build Container Image**:
   ```bash
   docker build -t omniasset-production:latest .
   ```

2. **Run Container**:
   ```bash
   docker run -d \
     --name omniasset \
     -p 3001:3001 \
     --env-file .env \
     --restart unless-stopped \
     omniasset-production:latest
   ```

3. **Verify Container Health**:
   ```bash
   curl http://localhost:3001/api/health
   # Returns: {"status":"healthy","database":"connected", ...}
   ```

---

### Option B: Cloud Platform Deployments (Render, Railway, Fly.io)

For platforms that detect Node.js applications:

1. **Build Command**:
   ```bash
   npm install && npm run build
   ```
2. **Start Command**:
   ```bash
   npm start
   ```
3. Set Environment Variables matching Section 3 above.

---

### Option C: Bare Metal / Linux VPS (Ubuntu / Debian + PM2 + Nginx)

1. **Clone and Install**:
   ```bash
   git clone <repo-url> /opt/omniasset
   cd /opt/omniasset
   npm ci
   npm run build
   ```

2. **Configure PM2 Process Manager**:
   ```bash
   npm install -g pm2
   pm2 start "npm start" --name omniasset
   pm2 save
   pm2 startup
   ```

3. **Nginx Reverse Proxy Configuration**:
   ```nginx
   server {
       listen 80;
       server_name assets.yourcompany.com;

       location / {
           proxy_pass http://127.0.0.1:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

---

## 5. Maintenance & Database Scripts

The following commands are available for database maintenance:

- **Run Automated Verification Suite**:
  ```bash
  npm test
  ```
  Runs 73 automated tests covering tenant scoping, RBAC permission matrices, monotonic cryptographic audit integrity, optimistic concurrency control, and end-to-end business workflows.

- **Purge Dummy Data to Pristine Baseline**:
  ```bash
  npm run db:clean
  ```
  Safely purges any test assets, checkouts, and dummy users while keeping the primary organization and Super Admin account intact.

- **Apply Schema Migrations**:
  ```bash
  node scripts/execute-tidb-schema.mjs
  ```
