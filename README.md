# DocuIntel Next.js Frontend

Web user interface for the DocuIntel Document Intelligence System built with **Next.js 16**, **React 19**, and **100% TypeScript**.

## Features
- **Batch Upload**: Multi-file drag & drop support for PDF, JPG, PNG, TIFF, XLSX, XLS, and CSV.
- **Live Progress**: Dynamic stage progress tracking with error badges.
- **Invoice Inspection**: Visual review of extracted data, confidence scores, and line items.
- **Manual Corrections**: In-browser editing interface with instant recalculation.
- **Search**: Hybrid keyword and semantic vector search interface.
- **Zero-CORS Security**: Internal server-side API proxy attaching the `BACKEND_API_KEY` securely without exposing secrets to the browser.

## Quick Start (Local)

```bash
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

## Docker Build & Run

```bash
docker build -t docuintel-frontend .
docker run -p 3000:3000 --env-file .env docuintel-frontend
```

## Vercel Deployment
1. Import this repository (or set root directory to `frontend/`).
2. Add environment variables:
   - `BACKEND_URL`: `https://your-backend-service.onrender.com`
   - `BACKEND_API_KEY`: `your-backend-api-key`
3. Click **Deploy**.

