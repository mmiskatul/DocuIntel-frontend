# DocuIntel Next.js Frontend

Web user interface for the DocuIntel Document Intelligence Platform built with **Next.js 16 (App Router + Turbopack)**, **React 19**, **Redux Toolkit**, and **TypeScript**.

Connected to the [DocuIntel FastAPI Backend](https://github.com/mmiskatul/DocuIntel-backend).

---

## Key Features

* **Multi-File Batch Upload**: Drag-and-drop file ingestion supporting multi-page digital PDFs, scanned images, Excel workbooks (`.xlsx` & `.xls`), and CSVs.
* **Live Operations Dashboard**: Real-time polling with status badges (`Queued`, `Processing`, `Needs Review`, `Completed`, `Rejected`, `Failed`), dynamic progress bars, and KPI stat counters.
* **Document Inspection & Split-Screen OCR**: Side-by-side original file preview and raw OCR text viewer with page-by-page navigation.
* **Structured Data & Line Items Table**: Displays vendor, customer, dates, invoice numbers, amounts, currency, and complete itemized line items (quantities, unit rates, amounts).
* **Enterprise Validation & Discrepancy Alerts**: Visual alerts for missing fields, arithmetic variances ($\sum \text{Line Items} \neq \text{Subtotal}$, $\text{Subtotal} + \text{Tax} \neq \text{Total}$), duplicate invoices, and dynamic non-invoice rejection reasons.
* **Manual Review & 1-Click Reconciliation**: Inline **"Edit Fields"** form to correct extracted values, plus 1-click **"Apply Sum"** and **"Override Total"** reconciliation buttons that automatically approve documents and sync to the vector database.
* **Smart Search & AI Document Analyst (RAG)**:
  * **Keyword Search**: Instant document filtering by filename, vendor, or invoice number.
  * **Smart Search**: High-dimensional vector embeddings with cosine similarity matching.
  * **⚡ AI Document Analyst**: Grounded question answering synthesizing document context with source citations.

---

## Quick Start (Local)

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (.env.local)
echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1" > .env.local

# 3. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Production Build

```bash
npm run build
npm run start
```

---

## Docker Build & Run

```bash
docker build -t docuintel-frontend .
docker run -p 3000:3000 -e NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1 docuintel-frontend
```
