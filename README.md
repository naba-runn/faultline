# Faultline — AI-Grounded Error Intelligence Platform

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](#-verification--test-suite)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-blue)](#-tech-stack)
[![License](https://img.shields.io/badge/license-MIT-green)](#)

> **Faultline** is a modern, real-time error tracking and AI-grounded root-cause intelligence platform — a lightweight, developer-focused alternative to Sentry.
> 
> Client applications ingest runtime errors to Faultline's API. Errors are automatically deduplicated by stack-trace fingerprinting. On the first occurrence of a new error group, Faultline fetches the offending source code directly from GitHub and calls **Google Gemini 2.5 Flash** to generate a structured, actionable root-cause analysis and suggested fix.

---

## 📸 Key Features

- 🧠 **AI Root-Cause Intelligence**: Asynchronous background enrichment using Google Gemini 2.5 Flash, grounded with GitHub code snippet context.
- ⚡ **Real-Time Dashboard**: Server-Sent Events (SSE) push live error occurrences, count updates, and enrichment completions directly to the UI without page reloads.
- 🗺️ **Source-Map Support**: Synchronous JavaScript Source Map v3 resolution (`source-map-js`) mapping minified production stack frames back to original source code files.
- 📈 **Trend & Spike Detection**: Statistical baseline algorithm evaluating trailing 24-hour error frequency to detect real anomaly spikes.
- 🔔 **Multi-Channel Alerting**: Instant notification system supporting Resend email delivery for new error groups and volume spikes.
- 🏷️ **Multi-Environment & Release Tagging**: Categorize issues by environment (`production`, `staging`) and trace bugs to exact release builds (`v1.4.2`).
- 🔍 **Search, Filters & Saved Views**: Deep error searching by regex message matching, status (`open`, `resolved`, `ignored`), and AI severity (`critical`, `high`, `medium`, `low`).
- ⚡ **SDK Snippet Generator**: Copyable onboarding code snippets for **cURL**, **Node.js / Express**, and **Python**.
- 📖 **Live Public API Documentation**: Built-in interactive documentation available at `/docs` rendered dynamically from raw API specifications.

---

## 🏗️ Architecture Overview

```
                      +-------------------+
                      |   Client SDKs     |
                      | (Node/Python/curl)|
                      +---------+---------+
                                |
                                | POST /api/events (API Key Authed)
                                v
                      +-------------------+
                      |   Express API     |
                      |   (server.js)     |
                      +----+---------+----+
                           |         |
         +-----------------+         +------------------+
         |                                              |
         v                                              v
+------------------+                          +-------------------+
|  MongoDB Atlas   |                          | Render Key Value  |
| (Groups & Events)|                          | (Redis Queue/PubSub)
+------------------+                          +---------+---------+
         ^                                              |
         |                                              v
+--------+---------+                          +-------------------+
|  React Dashboard |<======== SSE Stream =====| Background Worker |
| (Vite App @ /)   |   (Real-time push)       |    (worker.js)    |
+------------------+                          +---------+---------+
                                                        |
                                                        v
                                              +-------------------+
                                              | Google Gemini AI  |
                                              | & GitHub API      |
                                              +-------------------+
```

---

## 🛠️ Tech Stack

### Frontend (`/client`)
- **Framework**: React 18 + Vite
- **Routing**: React Router DOM v6
- **Styling**: Vanilla CSS (Tailwind-free) custom design system with dark-mode tokens & CSS grid layouts
- **HTTP Client**: Axios with JWT interceptors
- **Markdown Parsing**: `marked` v15

### Backend (`/server`)
- **Runtime**: Node.js (ES Modules / CommonJS)
- **Framework**: Express.js
- **Database**: MongoDB Atlas via Mongoose ORM
- **Queue & Real-Time**: BullMQ + Redis (Render Key Value / local Redis)
- **AI Integration**: `@google/genai` (Gemini 2.5 Flash)
- **Email Delivery**: Resend API
- **Source Maps**: `source-map-js`

---

## 🚀 Quickstart Guide

### Prerequisites
- **Node.js** `>= 20.0.0`
- **npm** `>= 10.0.0`
- **MongoDB Atlas** cluster (or local MongoDB)
- **Redis** instance (local `redis-server` or cloud Redis)
- **Gemini API Key** (from Google AI Studio)

### 1. Repository Setup

```bash
git clone https://github.com/naba-runn/faultline.git
cd faultline
```

### 2. Backend Setup

```bash
cd server
npm install
cp .env.example .env
```

Configure your `.env` variables:
```env
PORT=5050
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/faultline
JWT_SECRET=your-super-secret-jwt-key
GEMINI_API_KEY=your-gemini-api-key
REDIS_URL=redis://127.0.0.1:6379
RESEND_API_KEY=re_123456789 (optional for email alerts)
```

Start the development server & worker process:
```bash
# Terminal 1: API Server
npm run dev

# Terminal 2: Background Enrichment Worker
npm run worker:dev
```

### 3. Frontend Setup

```bash
cd ../client
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 🧪 Testing with Demo App

Faultline includes a pre-configured demo application for testing real ingestion, minified source maps, and error spikes:

```bash
cd demo-app
npm install
node index.js          # Ingests sample runtime errors
node minified-demo.js  # Demonstrates source-map upload and minified frame resolution
```

---

## 🧪 Verification & Test Suite

The server includes a suite of 50 unit and integration tests covering deduplication, trend calculation, spike evaluation, source map resolution, and API contracts:

```bash
cd server
npm test
```

---

## 🌐 Production Deployment Guide

### Frontend Deployment (Vercel)
1. Import `client/` into Vercel.
2. Build Command: `npm run build`
3. Output Directory: `dist`
4. The repository includes `client/vercel.json` configured for SPA routing rewrites.

### Backend Deployment (Render)
1. **Database & Queue**: Create a MongoDB Atlas cluster and a Render Key Value (Redis) instance.
2. **API Web Service**:
   - Build Command: `cd server && npm install`
   - Start Command: `cd server && node server.js`
3. **Background Worker Service**:
   - Service Type: Render Background Worker
   - Start Command: `cd server && node worker.js`

---

## 📄 License & Documentation

- **Live API Documentation**: Accessible within the running app at `/docs` or in `docs/API.md`.
- **System Decisions**: Comprehensive Architectural Decision Records in `docs/DECISIONS.md`.
- **License**: MIT