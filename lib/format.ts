import type { InvoiceData, Issue } from "./types";

export function money(value: number | null | undefined, currency?: string | null): string {
  if (value === null || value === undefined) return "—";
  const n = value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${n}` : n;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function duration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} m ${Math.round((ms % 60_000) / 1000)} s`;
}

export function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export const STATUS_LABEL: Record<string, string> = {
  queued: "Queued", processing: "Processing", completed: "Completed", needs_review: "Needs review", failed: "Failed",
};

export const STAGE_LABEL: Record<string, string> = {
  queued: "Waiting in queue", reading: "Reading pages", ocr: "Running OCR", extracting: "Extracting fields",
  validating: "Validating", indexing: "Indexing for search", done: "Done", failed: "Failed",
};

export type ConfidenceLevel = "high" | "medium" | "low" | "none";
export function confidenceLevel(c: number | undefined, hasValue: boolean): ConfidenceLevel {
  if (!hasValue) return "none";
  if (c === undefined) return "medium";
  if (c >= 0.8) return "high";
  if (c >= 0.6) return "medium";
  return "low";
}

export function issuesByField(issues: Issue[]): Record<string, Issue[]> {
  const out: Record<string, Issue[]> = {};
  for (const i of issues) {
    if (i.severity === "info") continue;
    (out[i.field ?? "_general"] ??= []).push(i);
  }
  return out;
}

/** Parse a text input into the value type of an invoice field. Returns undefined for an invalid number. */
export function parseField(field: keyof InvoiceData, raw: string): string | number | null | undefined {
  const t = raw.trim();
  if (t === "") return null;
  if (field === "subtotal" || field === "tax" || field === "total") {
    const n = Number(t.replace(/,/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  if (field === "currency") return t.toUpperCase();
  return t;
}

/** Fields whose edited value differs from the current one (shallow, line_items compared by JSON). */
export function diffFields(current: InvoiceData, draft: InvoiceData): Partial<InvoiceData> {
  const out: Record<string, unknown> = {};
  (Object.keys(draft) as (keyof InvoiceData)[]).forEach((k) => {
    if (JSON.stringify(current[k]) !== JSON.stringify(draft[k])) out[k] = draft[k];
  });
  return out as Partial<InvoiceData>;
}
