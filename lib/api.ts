import type {
  CrossVerifyReport, DocFilters, DocumentOut, EventOut, InvoiceData, ResultOut, SearchHit, Stats, UploadItem,
} from "./types";

// Default to the same-origin Next.js proxy (app/api/[...path]); set NEXT_PUBLIC_API_URL only to call the backend directly.
const BASE = process.env.NEXT_PUBLIC_API_URL ? `${process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "")}/api` : "/api";

/** An error from the backend (or from reaching it), with everything needed to show and report it exactly. */
export class ApiError extends Error {
  constructor(
    public status: number,            // HTTP status; 0 = the server could not be reached at all
    message: string,                  // readable text, taken from the backend's `detail`
    public code: string = "",         // backend error code: validation_error, database_unavailable, conflict, internal_error, ...
    public requestId: string = "",    // matches the traceback in the backend log
    public detail: unknown = null,    // the raw `detail` (a list of field errors for validation failures)
  ) {
    super(message);
    this.name = "ApiError";
  }
  /** Worth retrying automatically: the server or database was busy or unreachable, not a mistake in the request. */
  get retryable(): boolean {
    return this.status === 0 || this.status === 502 || this.status === 503 || this.status === 504;
  }
}

const STATUS_TEXT: Record<number, string> = {
  400: "The request was not valid.", 401: "Access denied: the API key is missing or wrong.", 403: "You are not allowed to do this.",
  404: "Not found.", 409: "This conflicts with the current state of the data.", 413: "The file is too large.",
  415: "This file type is not supported.", 422: "Some of the values are not valid.", 429: "Too many requests; wait a moment.",
  500: "The server hit an unexpected error.", 502: "The backend could not be reached.", 503: "The service is temporarily unavailable.",
  504: "The backend took too long to answer.",
};

/** FastAPI sends a plain string for most errors and a list of {loc, msg} for validation errors; show either as readable text. */
export function explain(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((d) => {
      if (d && typeof d === "object" && "msg" in d) {
        const where = Array.isArray((d as any).loc) ? (d as any).loc.filter((x: unknown) => x !== "query" && x !== "body").join(".") : "";
        return where ? `${where}: ${(d as any).msg}` : String((d as any).msg);
      }
      return typeof d === "string" ? d : JSON.stringify(d);
    });
    if (parts.length) return parts.join("; ");
  }
  return JSON.stringify(detail);
}

const TIMEOUT_MS = 60_000;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  // Uploads can legitimately take long, so only requests without a file body get a timeout
  const signal = init?.signal ?? (init?.body instanceof FormData ? undefined : AbortSignal.timeout(TIMEOUT_MS));
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { cache: "no-store", ...init, signal });
  } catch (err) {
    const timedOut = err instanceof DOMException && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new ApiError(
      0,
      timedOut ? "The server took too long to answer. Try again." : "Cannot reach the server. Check your connection and try again.",
      timedOut ? "timeout" : "network_error",
    );
  }

  if (!res.ok) {
    const headerId = res.headers.get("x-request-id") || "";
    let message = STATUS_TEXT[res.status] || res.statusText || `Request failed (${res.status})`;
    let code = "", requestId = headerId, detail: unknown = null;
    try {
      const body = await res.json();
      detail = body.detail ?? null;
      message = typeof body.message === "string" ? body.message : explain(body.detail ?? body);
      code = typeof body.error === "string" ? body.error : "";
      requestId = body.request_id || headerId;
    } catch { /* not JSON (for example an HTML error page from a gateway): keep the status text */ }
    // Server-side failures carry a reference the operator can look up in the backend log
    if (res.status >= 500 && requestId) message = `${message} (ref ${requestId})`;
    throw new ApiError(res.status, message, code, requestId, detail);
  }
  if (res.status === 204) return undefined as T;
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError(res.status, "The server sent a response that could not be read.", "bad_response");
  }
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
  reprocessAllFailed: () => request<{ success: boolean; requeued_count: number; requeued_document_ids: string[] }>("/documents/reprocess-failed", { method: "POST" }),
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
  search: (q: string, mode: "keyword" | "semantic" | "hybrid" | "exact", limit = 20) =>
    request<SearchHit[]>(`/search${buildQuery({ q, mode, limit })}`),
  ragSearch: (q: string) =>
    request<import("./types").RAGResult>(`/search/rag${buildQuery({ q })}`),
  stats: () => request<Stats>("/stats"),
  crossVerify: (left: string, right: string, flagMismatches = true) =>
    request<CrossVerifyReport>("/documents/cross-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ left_document_id: left, right_document_id: right, flag_mismatches: flagMismatches }),
    }),
  fileUrl: (id: string) => `${BASE}/documents/${id}/file`,
  pageImageUrl: (id: string, page: number) => `${BASE}/documents/${id}/page/${page}/image?scale=2`,
  approve: (id: string, reviewer?: string) =>
    request<{ success: boolean; status: string; stage: string; vector_stored?: boolean; original_removed?: boolean }>(`/documents/${id}/approve`, {
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
