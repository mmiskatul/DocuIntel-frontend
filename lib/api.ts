import type {
  DocFilters, DocumentOut, EventOut, InvoiceData, PageOut, ResultOut, SearchHit, Stats, UploadItem,
} from "./types";

const API_HOST = typeof window !== "undefined"
  ? (process.env.NEXT_PUBLIC_API_URL || "")
  : (process.env.NEXT_PUBLIC_API_URL || process.env.BACKEND_URL || "");
const BASE = API_HOST ? `${API_HOST.replace(/\/$/, "")}/api` : "/api";

export const OCR_HOST = typeof window !== "undefined"
  ? (process.env.NEXT_PUBLIC_OCR_URL || "https://task-ocr-model.onrender.com")
  : (process.env.NEXT_PUBLIC_OCR_URL || "https://task-ocr-model.onrender.com");

export async function pingOcrService(): Promise<boolean> {
  try {
    const res = await fetch(`${OCR_HOST}/health`, { method: "GET", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

const TOKEN_KEY = "docuintel_jwt_token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers || {});
  const token = getStoredToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${BASE}${path}`, {
    cache: "no-store",
    ...init,
    headers,
  });

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
  // Auth API
  login: async (email: string, password: string) => {
    const data = await request<{ access_token: string; token_type: string; user: any }>("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(data.access_token);
    return data;
  },
  register: async (email: string, password: string, name?: string) => {
    const data = await request<{ access_token: string; token_type: string; user: any }>("/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });
    setStoredToken(data.access_token);
    return data;
  },
  logout: () => {
    setStoredToken(null);
  },
  getMe: () => request<{ authenticated: boolean; user: any }>("/auth/me"),

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
  getPages: (id: string, offset = 0, limit = 50) => request<PageOut[]>(`/documents/${id}/pages${buildQuery({ offset, limit })}`),
  getEvents: (id: string) => request<EventOut[]>(`/documents/${id}/events`),
  reprocess: (id: string, force = false) =>
    request<DocumentOut>(`/documents/${id}/reprocess${buildQuery({ force })}`, { method: "POST" }),
  reprocessAllFailed: () => request<{ requeued: number }>("/documents/reprocess-failed", { method: "POST" }),
  deleteDocument: (id: string) => request<void>(`/documents/${id}`, { method: "DELETE" }),
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
  fileUrl: (id: string) => `${BASE}/documents/${id}/file`,
  approve: (id: string, reviewer?: string) =>
    request<{ success: boolean; status: string; stage: string }>(`/documents/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewer }),
    }),
  reconcile: (sourceIds: string[] = []) =>
    request<{
      summary: { total_sources: number; total_transactions: number; matched_count: number; flagged_count: number; unexplained_difference: number; period: string };
      sources: Array<{ id: string; filename: string; type: string; count: number; status: string }>;
      discrepancies: Array<{
        id: string;
        transaction: string;
        ledger_amount: number | null;
        bank_amount: number | null;
        ledger_date?: string;
        bank_date?: string;
        flag_type: "UNMATCHED" | "DUPLICATE" | "TIMING DIFF" | "MISSING RECEIPT";
        difference: number;
        notes: string;
      }>;
    }>("/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_ids: sourceIds }),
    }),
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
