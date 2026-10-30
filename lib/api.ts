import type {
  CrossVerifyReport, DocFilters, DocumentOut, EventOut, InvoiceData, ResultOut, SearchHit, Stats, UploadItem,
} from "./types";

// Default to the same-origin Next.js proxy (app/api/[...path]); set NEXT_PUBLIC_API_URL only to call the backend directly.
const BASE = process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "")}/api` : "/api";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { cache: "no-store", ...init });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = typeof body.message === "string" ? body.message : (typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail ?? body));
    } catch { /* non-JSON error body */ }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export const api = {
  // Documents & Processing API
  upload(files: File[]): Promise<UploadItem[]> {
    const form = new FormData();
    files.forEach((f) => form.append("files", f, f.name));
    return request<UploadItem[]>("/documents", { method: "POST", body: form });
  },
  listDocuments: (f: DocFilters & { limit?: number; offset?: number } = {}) =>
    request<DocumentOut[]>(`/documents${buildQuery({ limit: 100, ...f })}`),
  getDocument: (id: string) => request<DocumentOut>(`/documents/${id}`),
  getResults: (id: string) => request<ResultOut[]>(`/documents/${id}/results`),
  getEvents: (id: string) => request<EventOut[]>(`/documents/${id}/events`),
  reprocess: (id: string, force = false) =>
    request<DocumentOut>(`/documents/${id}/reprocess${buildQuery({ force })}`, { method: "POST" }),
  reprocessAllFailed: () => request<{ requeued: number }>("/documents/reprocess-failed", { method: "POST" }),
  deleteDocument: (id: string) => request<void>(`/documents/${id}`, { method: "DELETE" }),
  correctDocument: (docId: string, corrections: Record<string, any>, reviewer = "auditor@docuintel.com", resultId?: number) =>
    request<any>(`/documents/${docId}/correct`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ corrections, reviewer, result_id: resultId }),
    }),
  correct: (resultId: number, corrections: Partial<InvoiceData>, confirm: boolean, reviewer?: string) =>
    request<ResultOut>(`/results/${resultId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ corrections, confirm, reviewer }),
    }),
  search: (q: string, mode: "keyword" | "semantic" | "hybrid", limit = 20) =>
    request<SearchHit[]>(`/search${buildQuery({ q, mode, limit })}`),
  ragSearch: (q: string, provider: "auto" | "openai" | "anthropic" | "deepseek" | "grok" = "auto") =>
    request<import("./types").RAGResult>(`/search/rag${buildQuery({ q, provider })}`),
  stats: () => request<Stats>("/stats"),
  crossVerify: (left: string, right: string, flagMismatches = true) =>
    request<CrossVerifyReport>("/documents/cross-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ left_document_id: left, right_document_id: right, flag_mismatches: flagMismatches }),
    }),
  fileUrl: (id: string) => `${BASE}/documents/${id}/file`,
  approve: (id: string, reviewer?: string) =>
    request<{ success: boolean; status: string; stage: string; vector_stored?: boolean }>(`/documents/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewer }),
    }),
  reconcile: (id: string, payload: { subtotal?: number; tax?: number; total?: number; action?: string; reviewer?: string }) =>
    request<{ success: boolean; status: string; stage: string; vector_stored?: boolean }>(`/documents/${id}/reconcile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  reject: (id: string, reason?: string, reviewer?: string) =>
    request<{ success: boolean; status: string; stage: string; reason?: string }>(`/documents/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, reviewer }),
    }),
  rerunOcr: (id: string) =>
    request<{ success: boolean; message: string }>(`/documents/${id}/re-ocr`, { method: "POST" }),
  batchApprove: (docIds: string[], reviewer?: string) =>
    request<{ count: number; results: any[] }>("/documents/batch-approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document_ids: docIds, reviewer }),
    }),
  deleteAllDocuments: () =>
    request<{ success: boolean }>("/documents", { method: "DELETE" }),
  getHistory: (id: string) => request<any[]>(`/documents/${id}/history`),
  wakeup: () => request<{ status: string; backend: string; ocr_model: any }>("/wakeup"),
  health: () => request<any>("/health"),
};
