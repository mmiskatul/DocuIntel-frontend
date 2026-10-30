export type DocStatus = "queued" | "processing" | "completed" | "needs_review" | "failed" | "rejected";

export interface DocSummary {
  invoice_number?: string | null;
  supplier_name?: string | null;
  customer_name?: string | null;
  subtotal?: number | null;
  tax?: number | null;
  total?: number | null;
  currency?: string | null;
  invoice_date?: string | null;
}

export interface DocumentOut {
  id: string;
  filename: string;
  file_type: string;
  size_bytes: number;
  status: DocStatus;
  stage: string;
  progress: number;
  page_count: number;
  pages_done: number;
  error: string | null;
  attempts: number;
  processing_ms: number | null;
  created_at: string;
  updated_at: string;
  invoice_count: number;
  needs_review: boolean;
  summary: DocSummary;
}

export interface LineItem {
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
}

export interface InvoiceData {
  invoice_number: string | null;
  invoice_date: string | null;
  supplier_name: string | null;
  customer_name: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  currency: string | null;
  line_items: LineItem[];
}

export interface Issue {
  id: number;
  code: string;
  severity: "error" | "warning" | "info";
  field: string | null;
  message: string;
  details: Record<string, unknown>;
  resolved: boolean;
}

export interface ResultOut {
  id: number;
  document_id: string;
  invoice_index: number;
  source_pages: number[];
  extractor: string;
  data: InvoiceData;
  corrected_data: Partial<InvoiceData> | null;
  effective_data: InvoiceData;
  confidence: Record<string, number>;
  overall_confidence: number;
  needs_review: boolean;
  reviewed: boolean;
  issues: Issue[];
}

export interface PageOut {
  page_number: number;
  label: string;
  method: string;
  text: string;
  ocr_confidence: number | null;
  warnings: string[];
}

export interface EventOut {
  id: number;
  event: string;
  message: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface UploadItem {
  id: string | null;
  filename: string;
  status: "queued" | "rejected";
  error: string | null;
  duplicate_of: string | null;
}

export interface Stats {
  total: number;
  by_status: Record<DocStatus, number>;
  avg_processing_ms: number | null;
  open_review_items: number;
}

export interface SearchHit {
  document_id: string;
  page: number | null;
  score: number;
  snippet: string;
  match: "semantic" | "keyword" | "hybrid" | "filters";
  document: DocumentOut;
}

export interface DocFilters {
  q?: string;
  supplier?: string;
  invoice_number?: string;
  status?: string;
  needs_review?: boolean;
  date_from?: string;
  date_to?: string;
  min_total?: number;
  max_total?: number;
}

export interface RAGCitation {
  document_id: string;
  filename: string;
  supplier?: string;
  total?: number;
  currency?: string;
  similarity: number;
  snippet?: string;
}

export interface RAGResult {
  query: string;
  answer: string;
  provider_used: string;
  citations: RAGCitation[];
  hits: SearchHit[];
  latency_ms: number;
}

export const IN_FLIGHT: DocStatus[] = ["queued", "processing"];

export interface CrossVerifyDifference {
  field: string;
  left: string | number | null;
  right: string | number | null;
  severity: "error" | "warning";
  difference?: number;
}

export interface CrossVerifyReport {
  verdict: "match" | "discrepancies_found" | "no_comparable_invoices";
  summary: {
    left_invoices: number; right_invoices: number; matched: number; mismatched: number;
    only_in_left: number; only_in_right: number; without_invoice_number: number;
  };
  matched: { invoice_number: string }[];
  mismatched: { invoice_number: string; differences: CrossVerifyDifference[] }[];
  only_in_left: { invoice_number: string; total: number | null; supplier_name: string | null }[];
  only_in_right: { invoice_number: string; total: number | null; supplier_name: string | null }[];
  left_document: { id: string; filename: string };
  right_document: { id: string; filename: string };
  flagged_results: number;
}
