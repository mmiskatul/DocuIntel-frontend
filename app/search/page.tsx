"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { DocTable } from "@/components/DocTable";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { DocFilters, DocumentOut, SearchHit } from "@/lib/types";

type Mode = "hybrid" | "semantic" | "keyword" | "filters";
const MODES: [Mode, string, string][] = [
  ["hybrid", "Smart search", "Natural language financial filters + pgvector"],
  ["semantic", "Dense Semantic", "Vector similarity via BAAI/bge-small-en-v1.5"],
  ["keyword", "Keyword Exact", "Exact filename, supplier & invoice # matches"],
  ["filters", "Structured Filters", "Explicit supplier, date & amount bounds"],
];

const EXAMPLE_QUERIES = [
  "Find invoices from supplier HellasFresh above €1,000",
  "Find invoices from supplier ABC above ৳50,000",
  "Show invoices with tax discrepancies",
  "Find invoices that do not have a matching spreadsheet record",
  "Cloud infrastructure & data integration",
];

export default function SearchPage() {
  const [mode, setMode] = useState<Mode>("hybrid");
  const [q, setQ] = useState("");
  const [f, setF] = useState<Record<string, string>>({});
  const [needsReview, setNeedsReview] = useState(false);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [docs, setDocs] = useState<DocumentOut[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeQueryInfo, setActiveQueryInfo] = useState<string | null>(null);

  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function executeSearch(queryText: string, searchMode = mode) {
    setBusy(true);
    setError(null);
    setHits(null);
    setDocs(null);
    setActiveQueryInfo(null);

    try {
      if (searchMode === "filters") {
        const filters: DocFilters = {
          q: queryText || undefined,
          supplier: f.supplier || undefined,
          invoice_number: f.invoice_number || undefined,
          status: f.status || undefined,
          date_from: f.date_from || undefined,
          date_to: f.date_to || undefined,
          min_total: f.min_total ? Number(f.min_total) : undefined,
          max_total: f.max_total ? Number(f.max_total) : undefined,
          needs_review: needsReview || undefined,
        };
        const results = await api.listDocuments(filters);
        setDocs(results);
      } else {
        if (!queryText.trim()) {
          setError("Please enter a query or select an example prompt below.");
          return;
        }

        // Detect financial query interpretation
        const lower = queryText.toLowerCase();
        if (lower.includes("above") || lower.includes("tax") || lower.includes("spreadsheet") || lower.includes("supplier")) {
          setActiveQueryInfo(`Natural-language financial constraints detected. Applying deterministic arithmetic verification + pgvector semantic matching.`);
        }

        const results = await api.search(queryText.trim(), searchMode);
        setHits(results);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search query failed");
    } finally {
      setBusy(false);
    }
  }

  function run(e: FormEvent) {
    e.preventDefault();
    void executeSearch(q, mode);
  }

  function handleExampleClick(query: string) {
    setQ(query);
    setMode("hybrid");
    void executeSearch(query, "hybrid");
  }

  function exportHitsCsv() {
    if (!hits || !hits.length) return;
    const headers = [
      "Document ID",
      "Filename",
      "Status",
      "Supplier",
      "Invoice Number",
      "Date",
      "Total",
      "Currency",
      "Match Mode",
      "Confidence Score",
      "Evidence Snippet",
    ];

    const rows = hits.map((h) => [
      `"${h.document_id}"`,
      `"${h.document.filename}"`,
      `"${h.document.status}"`,
      `"${h.document.summary.supplier_name || "—"}"`,
      `"${h.document.summary.invoice_number || "—"}"`,
      `"${h.document.summary.invoice_date || h.document.created_at.slice(0, 10)}"`,
      h.document.summary.total ?? 0,
      `"${h.document.summary.currency || "USD"}"`,
      `"${h.match}"`,
      h.score.toFixed(2),
      `"${(h.snippet || "").replace(/"/g, '""')}"`,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `search_results_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Natural-Language Document Search</h1>
          <div className="muted">
            Search invoices, purchase orders, and receipts with natural-language financial queries, keyword matches, or Supabase pgvector semantic search.
          </div>
        </div>
      </div>

      <form className="card" onSubmit={run} style={{ padding: "20px 24px" }}>
        {/* Search Mode Tabs */}
        <div className="row" style={{ marginBottom: 14 }}>
          <div className="seg" role="tablist">
            {MODES.map(([m, label]) => (
              <button
                type="button"
                key={m}
                role="tab"
                aria-selected={mode === m}
                className={mode === m ? "on" : ""}
                onClick={() => {
                  setMode(m);
                  setHits(null);
                  setDocs(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="muted small">{MODES.find((m) => m[0] === mode)?.[2]}</span>
        </div>

        {/* Search Bar Input */}
        <div className="row" style={{ gap: 12 }}>
          <div style={{ position: "relative", flex: "1 1 300px" }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#64748b"
              strokeWidth="2"
              style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              style={{ paddingLeft: 38, height: 42, fontSize: 14, borderRadius: 8 }}
              autoFocus
              placeholder={
                mode === "filters"
                  ? "Optional text filter..."
                  : "e.g. Find invoices from supplier HellasFresh above €1,000"
              }
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search query"
            />
          </div>
          <button className="btn btn-primary" disabled={busy} style={{ height: 42, padding: "0 24px" }}>
            {busy ? "Searching..." : "Search"}
          </button>
        </div>

        {/* Quick Example Prompt Pills (Pillar 5 Specifications) */}
        {mode !== "filters" && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, marginBottom: 8 }}>
              Try sample natural-language queries:
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {EXAMPLE_QUERIES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => handleExampleClick(example)}
                  style={{
                    background: "#f1f5f9",
                    border: "1px solid #e2e8f0",
                    color: "#334155",
                    fontSize: 12,
                    fontWeight: 500,
                    padding: "5px 12px",
                    borderRadius: 20,
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = "#e2e8f0";
                    e.currentTarget.style.color = "#0b63b8";
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = "#f1f5f9";
                    e.currentTarget.style.color = "#334155";
                  }}
                >
                  💬 {example}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Structured Filter Grid (if mode === 'filters') */}
        {mode === "filters" && (
          <div className="form-grid" style={{ marginTop: 16 }}>
            <Field label="Supplier">
              <input value={f.supplier ?? ""} onChange={(e) => set("supplier", e.target.value)} />
            </Field>
            <Field label="Invoice number">
              <input value={f.invoice_number ?? ""} onChange={(e) => set("invoice_number", e.target.value)} />
            </Field>
            <Field label="Status">
              <select value={f.status ?? ""} onChange={(e) => set("status", e.target.value)}>
                <option value="">Any</option>
                <option value="completed">Completed</option>
                <option value="needs_review">Needs review</option>
                <option value="failed">Failed</option>
              </select>
            </Field>
            <Field label="Invoice date from">
              <input type="date" value={f.date_from ?? ""} onChange={(e) => set("date_from", e.target.value)} />
            </Field>
            <Field label="Invoice date to">
              <input type="date" value={f.date_to ?? ""} onChange={(e) => set("date_to", e.target.value)} />
            </Field>
            <Field label="Min total">
              <input className="num" inputMode="decimal" value={f.min_total ?? ""} onChange={(e) => set("min_total", e.target.value)} />
            </Field>
            <Field label="Max total">
              <input className="num" inputMode="decimal" value={f.max_total ?? ""} onChange={(e) => set("max_total", e.target.value)} />
            </Field>
            <label className="checkbox" style={{ alignSelf: "end", paddingBottom: 8 }}>
              <input type="checkbox" checked={needsReview} onChange={(e) => setNeedsReview(e.target.checked)} />
              Needs review only
            </label>
          </div>
        )}
      </form>

      {/* Query Interpretation Alert Banner */}
      {activeQueryInfo && (
        <div
          style={{
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            color: "#1e40af",
            padding: "10px 16px",
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ fontSize: 16 }}>⚡</span>
          <span>{activeQueryInfo}</span>
        </div>
      )}

      {error && <div className="alert alert-error">{error}</div>}

      {/* Search Hits Table */}
      {hits && (
        <div className="card card-flush">
          <div
            className="card-head"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>
              {hits.length} result{hits.length === 1 ? "" : "s"} found
            </h2>
            {hits.length > 0 && (
              <button
                type="button"
                onClick={exportHitsCsv}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  background: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: 6,
                  padding: "5px 12px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "#334155",
                  cursor: "pointer",
                }}
              >
                <span>⤓</span> Export Filtered Results to CSV
              </button>
            )}
          </div>

          {!hits.length ? (
            <div className="empty">
              Nothing matched your query. Try different words or click one of the suggested sample queries above.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Match Signal</th>
                    <th>Invoice #</th>
                    <th>Supplier / Vendor</th>
                    <th className="num">Total Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {hits.map((h) => {
                    const matchStyle =
                      h.match === "filters"
                        ? { bg: "#e0f2fe", color: "#0284c7", border: "#bae6fd" }
                        : h.match === "hybrid"
                        ? { bg: "#dcfce7", color: "#16a34a", border: "#bbf7d0" }
                        : h.match === "semantic"
                        ? { bg: "#ede9fe", color: "#7c3aed", border: "#ddd6fe" }
                        : { bg: "#f1f5f9", color: "#475569", border: "#e2e8f0" };

                    return (
                      <tr key={h.document_id}>
                        <td style={{ minWidth: 220 }}>
                          <Link href={`/documents/${h.document_id}`}>
                            <strong>{h.document.filename}</strong>
                          </Link>
                          {h.snippet && (
                            <div
                              style={{
                                color: "#64748b",
                                fontSize: 12,
                                marginTop: 4,
                                maxWidth: 440,
                                lineHeight: 1.4,
                              }}
                            >
                              {h.page ? `Page ${h.page} · ` : ""}
                              {h.snippet}
                            </div>
                          )}
                        </td>
                        <td>
                          <span
                            style={{
                              display: "inline-block",
                              background: matchStyle.bg,
                              color: matchStyle.color,
                              border: `1px solid ${matchStyle.border}`,
                              padding: "2px 8px",
                              borderRadius: 12,
                              fontSize: 11.5,
                              fontWeight: 600,
                            }}
                          >
                            {h.match.toUpperCase()}
                          </span>
                          <div className="muted small" style={{ marginTop: 3 }}>
                            Relevance: {(h.score * 100).toFixed(0)}%
                          </div>
                        </td>
                        <td style={{ fontWeight: 500 }}>
                          {h.document.summary.invoice_number ?? <span className="muted">—</span>}
                        </td>
                        <td style={{ fontWeight: 500 }}>
                          {h.document.summary.supplier_name ?? <span className="muted">—</span>}
                        </td>
                        <td className="num nowrap" style={{ fontWeight: 600, color: "#0f172a" }}>
                          {money(h.document.summary.total, h.document.summary.currency)}
                        </td>
                        <td>
                          <StatusBadge status={h.document.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Structured Docs Table */}
      {docs && (
        <div className="card card-flush">
          <div className="card-head">
            <h2 style={{ margin: 0 }}>
              {docs.length} document{docs.length === 1 ? "" : "s"}
            </h2>
          </div>
          {docs.length ? <DocTable docs={docs} /> : <div className="empty">No documents match these filters.</div>}
        </div>
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="field">{label}</label>
      {children}
    </div>
  );
}