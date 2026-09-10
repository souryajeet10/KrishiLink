# KrishiLink – AI Agri-Market Intelligence Platform

[![Platform](https://img.shields.io/badge/Platform-Node.js%20%7C%20Express-green?style=for-the-badge)](.)
[![Database](https://img.shields.io/badge/Database-PostgreSQL%20%2B%20PostGIS-blue?style=for-the-badge)](.)
[![Cache](https://img.shields.io/badge/Cache-Redis-red?style=for-the-badge)](.)
[![Auth & Push](https://img.shields.io/badge/Cloud-Firebase%20Admin%20%26%20FCM-orange?style=for-the-badge)](.)
[![Status](https://img.shields.io/badge/Tests-Passing%20100%25-brightgreen?style=for-the-badge)](.)

KrishiLink connects Indian farmers directly with verified institutional and retail buyers, provides live AGMARKNET mandi rates, delivers AI-driven price recommendations, and triggers automated Firebase Cloud Messaging (FCM) push notifications on core transaction events.

---

## 🏗️ System Architecture

```
                                  ┌────────────────────────┐
                                  │      Client Layer      │
                                  │  (Web SPA & Admin App) │
                                  └───────────┬────────────┘
                                              │ REST / FCM
                                              ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               Express.js REST API Backend                              │
│                                                                                        │
│  ┌────────────────────┐   ┌────────────────────┐   ┌────────────────────────────────┐  │
│  │    Auth & RBAC     │   │   Produce & Deals  │   │      Notification Service      │  │
│  │  (Firebase Admin)  │   │  (Listings/Offers) │   │     (FCM Push + Database)      │  │
│  └────────────────────┘   └────────────────────┘   └────────────────────────────────┘  │
│                                      │                                                 │
│                                      ▼                                                 │
│  ┌────────────────────┐   ┌────────────────────┐   ┌────────────────────────────────┐  │
│  │   PostgreSQL DB    │   │    Redis Cache     │   │       AGMARKNET Service        │  │
│  │  (Spatial PostGIS) │   │  (Mandi Key/Value) │   │     (data.gov.in Live API)     │  │
│  └────────────────────┘   └────────────────────┘   └────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Backend Runtime**: Node.js 18+ with Express.js
- **Primary Database**: PostgreSQL with PostGIS spatial extension (with resilient in-memory fallback for local offline testing)
- **Caching Layer**: Redis (LRU cache for high-throughput daily mandi rates)
- **Authentication**: Firebase Authentication with custom token synchronization into PostgreSQL
- **Push Messaging**: Firebase Cloud Messaging (FCM) for instant alerts on offers and order state transitions
- **Market Data Feed**: AGMARKNET (data.gov.in Open Government Data API)

---

## ⚡ Quick Start (Fresh Local Environment)

### 1. Prerequisites
- **Node.js**: `v18.0.0` or higher ([Download Node.js](https://nodejs.org/))
- **Git**: For source control
- *(Optional)* Local **PostgreSQL** & **Redis** instances (the system includes an automated in-memory store fallback if local services are not running).

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/your-repo/krishilink.git
cd krishilink

# Install dependencies
npm install
```

### 3. Configure Environment Variables
Copy the template configuration file:
```bash
# Windows PowerShell
Copy-Item .env.example .env

# Linux / macOS
cp .env.example .env
```
Edit `.env` to set your credentials (see checklist below).

### 4. Run Database Migrations & Seeds
```bash
# Apply migrations (initial schema, Firebase auth, FCM tokens)
npm run migrate

# Check migration status
npm run migrate:status

# Seed test users, mandi prices, listings, and offers
npm run seed
```

### 5. Start the Server
```bash
# Start development server
npm run dev

# Or start production server
npm start
```
Open your browser at:
- **Web App & Admin Dashboard**: `http://localhost:5173/app.html`
- **API Health Check**: `http://localhost:5173/api/health`
- **Mandi Rates Endpoint**: `http://localhost:5173/api/v1/market-prices`

---

## 📋 Environment Variables Checklist

The table below outlines all configuration keys supported in `.env`:

| Variable Name | Required | Default / Example Value | Description |
|---|:---:|---|---|
| `PORT` | Optional | `5173` | Port for Express HTTP server to listen on. |
| `NODE_ENV` | Optional | `development` | `development`, `test`, or `production`. |
| `CORS_ORIGIN` | Optional | `*` | Allowed CORS origins (e.g. `https://krishilink.vercel.app`). |
| `DATABASE_URL` | **Required in Prod** | `postgresql://postgres:postgres@localhost:5432/krishilink` | PostgreSQL connection string. |
| `PGSSL` | Optional | `false` (set `true` on Render/Neon) | Enable SSL mode for PostgreSQL database connection. |
| `REDIS_URL` | Optional | `redis://localhost:6379` | Redis connection URL. In-memory cache activates if omitted. |
| `REDIS_CACHE_TTL`| Optional | `10800` | Redis caching duration in seconds (3 hours default). |
| `FIREBASE_PROJECT_ID` | **Required for FCM** | `krishilink-dev` | Firebase Project ID from Google Cloud Console. |
| `FIREBASE_CLIENT_EMAIL` | **Required for FCM** | `firebase-adminsdk@....iam.gserviceaccount.com` | Service account email address. |
| `FIREBASE_PRIVATE_KEY` | **Required for FCM** | `"-----BEGIN PRIVATE KEY-----\n..."` | Service account RSA private key (with escaped `\n`). |
| `FIREBASE_DEV_MODE` | Optional | `true` (dev) / `false` (prod) | Allows offline mock tokens and dev delivery logging. |
| `DATA_GOV_IN_API_KEY` | Optional | `579b464db66ec23bdd000001...` | Free API key from [data.gov.in](https://data.gov.in) for AGMARKNET. |
| `AGMARKNET_RESOURCE_ID` | Optional | `9ef84268-d588-465a-a308-a864a43d0070` | Mandi price resource identifier on data.gov.in. |

---

## 🔔 Firebase Cloud Messaging (FCM) Integration

KrishiLink provides real-time notifications dispatched via Firebase Cloud Messaging and recorded in the PostgreSQL `notifications` table:

### Triggered Database Events:
1. **New Offer Received**:
   - **Trigger**: Buyer places an offer via `POST /api/v1/offers`.
   - **Recipient**: Farmer who owns the produce listing.
   - **Notification**: `"नया ऑफर मिला!"` / `"New Offer Received"`.
2. **Offer Accepted**:
   - **Trigger**: Farmer updates offer status to `accepted` via `PUT /api/v1/offers/:id`.
   - **Recipient**: Buyer. Automatically creates confirmed `orders` record.
   - **Notification**: `"ऑर्डर स्वीकृत!"` / `"Offer Accepted"`.
3. **Offer Rejected**:
   - **Trigger**: Farmer updates offer status to `rejected` via `PUT /api/v1/offers/:id`.
   - **Recipient**: Buyer.
   - **Notification**: `"ऑफर अस्वीकृत"` / `"Offer Rejected"`.
4. **Order Status Change**:
   - **Trigger**: Order lifecycle updated (e.g. `pickup_scheduled`, `in_transit`, `delivered`, `cancelled`) via `PUT /api/v1/orders/:id`.
   - **Recipient**: Both Buyer and Farmer receive status updates and tracking details.
   - **Notification**: `"ऑर्डर स्थिति अपडेट (${status})"` / `"Order Status: ${status}"`.

### Registering Device FCM Tokens:
Clients register device push tokens using the authenticated endpoint:
```http
POST /api/v1/notifications/fcm-token
Authorization: Bearer <Firebase_ID_Token>
Content-Type: application/json

{
  "token": "fcm_device_token_string_from_firebase_messaging_sdk",
  "deviceType": "android"
}
```

---

## 🧪 Automated Testing

The project includes an end-to-end testing suite with automated assertions:

```bash
# Run complete test suite (Integration tests + E2E demo flow)
npm test

# Run API endpoint integration tests
npm run test:api

# Run full end-to-end marketplace & FCM notification flow test
npm run test:e2e
```

### What the tests cover:
- **Pagination & Utilities**: Limit, page, offset math, structured pagination envelope.
- **Health & Error Handling**: DB connectivity verification, structured 404 handler.
- **Security & RBAC**: Bearer token enforcement (401), role-based forbidden actions (403).
- **Validation**: Schema assertions on missing or malformed inputs (400).
- **Auth API**: Register, login with credentials, Firebase token sync, user profile `/me`.
- **Produce Listings**: Complete CRUD lifecycle with category and price filters.
- **Offers & Deal Flow**: Create offer, inspect offer by listing ID, farmer accept/reject.
- **Orders & Tracking**: Automatic order generation upon offer acceptance, status updates.
- **Market Rates & Cache**: AGMARKNET API integration, Redis caching, commodity search.
- **Push Notification Audit**: Asserting that all 4 FCM events fire with expected payloads.
- **Admin Analytics**: Multi-role metrics (`totalFarmers`, `totalBuyers`, `revenue`).

---

## 🚀 Production Deployment

### Option 1: Backend Deployment to Render (Recommended)
This repository includes a [`render.yaml`](./render.yaml) Blueprint that provisions the Node.js web service, managed PostgreSQL database, and Redis cache together.

1. Fork or push this repository to GitHub.
2. Log in to [Render.com](https://dashboard.render.com/).
3. Navigate to **Blueprints** → Click **New Blueprint Instance**.
4. Select your KrishiLink repository.
5. Render will automatically detect `render.yaml` and configure:
   - **Web Service**: `krishilink-backend`
   - **PostgreSQL**: `krishilink-postgres` (auto-links `DATABASE_URL` with SSL)
   - **Redis**: `krishilink-redis` (auto-links `REDIS_URL`)
6. Under **Environment Variables**, fill in the secret keys:
   - `DATA_GOV_IN_API_KEY`: Your data.gov.in API key.
   - `FIREBASE_PROJECT_ID`: Your Firebase project ID.
   - `FIREBASE_CLIENT_EMAIL`: Your service account email.
   - `FIREBASE_PRIVATE_KEY`: Your private key from Firebase JSON.
7. Click **Apply**. Render will build and deploy the service.

---

### Option 2: Backend Deployment to Railway
1. Install Railway CLI or connect via [Railway.app](https://railway.app).
2. Click **New Project** → **Deploy from GitHub repo**.
3. Add **PostgreSQL** plugin from Railway marketplace (`DATABASE_URL` is injected automatically).
4. Add **Redis** plugin from Railway marketplace (`REDIS_URL` is injected automatically).
5. Set environment variables in Railway dashboard:
   - `PGSSL=true`
   - `DATA_GOV_IN_API_KEY=...`
   - `FIREBASE_PROJECT_ID=...`
   - `FIREBASE_CLIENT_EMAIL=...`
   - `FIREBASE_PRIVATE_KEY=...`
   - `NODE_ENV=production`
6. Railway uses [`railway.json`](./railway.json) and [`Procfile`](./Procfile) to run migrations and start the server.

---

### Option 3: Web Client & Admin Dashboard Deployment

#### A. Firebase Hosting
1. Install Firebase CLI:
   ```bash
   npm install -g firebase-tools
   ```
2. Log in and associate project:
   ```bash
   firebase login
   firebase use --add
   ```
3. Deploy frontend using the included [`firebase.json`](./firebase.json):
   ```bash
   firebase deploy --only hosting
   ```

#### B. Vercel
1. Install Vercel CLI or import the GitHub repository in [Vercel](https://vercel.com).
2. The project root contains [`vercel.json`](./vercel.json) with SPA routes, security headers, and `/api/*` proxies.
3. Deploy:
   ```bash
   vercel --prod
   ```

---

## 🔑 Demo Credentials

For quick evaluation and demonstrations, the following accounts are pre-seeded:

| Role | Phone | Password | Name & Location |
|---|---|---|---|
| 👨‍🌾 Farmer | `9876543210` | `farmer123` | Ramesh Patel, Nashik, Maharashtra |
| 👩‍🌾 Farmer | `9812345678` | `farmer123` | Sunita Devi, Sonipat, Haryana |
| 🏪 Buyer | `9123456789` | `buyer123` | Anil Kumar Sharma (FreshMart Wholesalers), Delhi |
| 🏬 Buyer | `9234567890` | `buyer123` | Priya Patel (AgroTrade Ltd), Ahmedabad, Gujarat |
| ⚙️ Admin | `9000000001` | `admin123` | KrishiLink Platform Administrator |

---

## 📄 License
This project is licensed under the ISC License.
