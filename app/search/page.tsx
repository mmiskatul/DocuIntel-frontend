"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { DocTable } from "@/components/DocTable";
import { DocModal } from "@/components/DocModal";
import { StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { DocFilters, DocumentOut, RAGResult, SearchHit } from "@/lib/types";

type Mode = "rag" | "hybrid" | "filters";
const MODES: [Mode, string, string][] = [
  ["rag", "⚡ AI Analyst (RAG)", "LangChain vector retrieval + GPT-4o-mini answering with citations"],
  ["hybrid", "🔍 Smart Search", "Semantic vector embeddings + keyword matching"],
  ["filters", "📊 Structured Filters", "Filter by supplier, date range, and amount"],
];

const EXAMPLE_QUERIES = [
  "What is the total expenditure across all invoices?",
  "List all vendor names and their invoice numbers",
  "Find invoices above $1,000",
  "Show software and cloud infrastructure expenses",
];

export default function SearchPage() {
  const [mode, setMode] = useState<Mode>("rag");
  const [q, setQ] = useState("");
  const [f, setF] = useState<Record<string, string>>({});
  const [needsReview, setNeedsReview] = useState(false);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [docs, setDocs] = useState<DocumentOut[] | null>(null);
  const [ragResult, setRagResult] = useState<RAGResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeQueryInfo, setActiveQueryInfo] = useState<string | null>(null);

  // Document inspection modal state
  const [inspectDoc, setInspectDoc] = useState<DocumentOut | null>(null);

  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function openDocById(docId: string) {
    try {
      const d = await api.getDocument(docId);
      setInspectDoc(d);
    } catch (err: any) {
      alert(`Could not load document: ${err.message}`);
    }
  }

  async function executeSearch(queryText: string, searchMode = mode) {
    setBusy(true);
    setError(null);
    setHits(null);
    setDocs(null);
    setRagResult(null);
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
      } else if (searchMode === "rag") {
        if (!queryText.trim()) {
          setError("Please enter a question to ask the AI Financial Analyst (RAG).");
          return;
        }
        setActiveQueryInfo("Querying LangChain pgvector cosine retrieval + OpenAI GPT-4o-mini synthesis...");
        const rag = await api.ragSearch(queryText.trim());
        setRagResult(rag);
        setHits(rag.hits || []);
      } else {
        if (!queryText.trim()) {
          setError("Please enter a search query or select an example prompt below.");
          return;
        }
        setActiveQueryInfo("Executing semantic vector similarity and keyword search...");
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
    setMode("rag");
    void executeSearch(query, "rag");
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
      "Relevance Score",
      "Snippet",
    ];

    const rows = hits.map((h) => {
      const doc = h.document || ({} as any);
      const sum = doc.summary || ({} as any);
      return [
        `"${h.document_id}"`,
        `"${doc.filename || (h as any).filename || "Document"}"`,
        `"${doc.status || "completed"}"`,
        `"${sum.supplier_name || (h as any).supplier_name || "—"}"`,
        `"${sum.invoice_number || (h as any).invoice_number || "—"}"`,
        `"${sum.invoice_date || doc.created_at?.slice(0, 10) || ""}"`,
        sum.total ?? (h as any).total ?? 0,
        `"${sum.currency || "USD"}"`,
        `"${h.match || "semantic"}"`,
        (h.score || 0).toFixed(2),
        `"${(h.snippet || (h as any).text || "").replace(/"/g, '""')}"`,
      ];
    });

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
    <div style={{ maxWidth: 1100, margin: "0 auto", paddingBottom: 60 }}>
      {/* Page Header */}
      <div className="page-head">
        <div>
          <h1>AI Search &amp; RAG Analyst</h1>
          <div className="muted">
            Ask natural language questions across all indexed invoices and documents using LangChain pgvector RAG.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <Link href="/" className="btn">
            ← Back to Documents
          </Link>
        </div>
      </div>

      {/* Mode Selector Tabs */}
      <div className="seg" role="tablist" style={{ marginBottom: 16 }}>
        {MODES.map(([m, label, hint]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={mode === m ? "on" : ""}
            onClick={() => {
              setMode(m);
              setError(null);
            }}
            title={hint}
            style={{ fontSize: 13, padding: "8px 16px" }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search Input Bar Form */}
      <form onSubmit={run} className="card" style={{ marginBottom: 20, padding: 20 }}>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>
            <input
              type="search"
              placeholder={
                mode === "rag"
                  ? "Ask any question (e.g. What is our total spend? What are the payment terms on the latest invoice?)"
                  : mode === "filters"
                  ? "Optional text query..."
                  : "Search documents by keywords, supplier, or invoice numbers..."
              }
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search query"
              style={{ width: "100%", height: 42, fontSize: 14 }}
            />
          </div>
          <button
            className="btn btn-primary"
            disabled={busy}
            style={{ height: 42, padding: "0 24px", fontWeight: 600 }}
          >
            {busy ? (mode === "rag" ? "Synthesizing RAG..." : "Searching...") : mode === "rag" ? "⚡ Ask AI (RAG)" : "Search"}
          </button>
        </div>

        {/* Quick Example Prompt Pills */}
        {mode !== "filters" && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600, marginBottom: 8 }}>
              Try sample questions:
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
            <div className="field">
              <label>Supplier</label>
              <input value={f.supplier ?? ""} onChange={(e) => set("supplier", e.target.value)} />
            </div>
            <div className="field">
              <label>Invoice number</label>
              <input value={f.invoice_number ?? ""} onChange={(e) => set("invoice_number", e.target.value)} />
            </div>
            <div className="field">
              <label>Status</label>
              <select value={f.status ?? ""} onChange={(e) => set("status", e.target.value)}>
                <option value="">Any</option>
                <option value="completed">Completed</option>
                <option value="needs_review">Needs review</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div className="field">
              <label>Min total ($)</label>
              <input className="num" type="number" value={f.min_total ?? ""} onChange={(e) => set("min_total", e.target.value)} />
            </div>
            <div className="field">
              <label>Max total ($)</label>
              <input className="num" type="number" value={f.max_total ?? ""} onChange={(e) => set("max_total", e.target.value)} />
            </div>
          </div>
        )}
      </form>

      {/* Query Status / Info Banner */}
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

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* RAG Answer Box */}
      {ragResult && (
        <div
          className="card"
          style={{
            padding: "20px 24px",
            background: "#ffffff",
            border: "1.5px solid #3b82f6",
            borderRadius: 12,
            marginBottom: 20,
            boxShadow: "0 4px 14px rgba(59, 130, 246, 0.08)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 22 }}>🤖</span>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" }}>
                AI Financial Analyst Answer
              </h3>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span
                style={{
                  background: "#dbeafe",
                  color: "#1d4ed8",
                  padding: "3px 10px",
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                Latency: {ragResult.latency_ms || 45}ms
              </span>
              <span
                style={{
                  background: "#f1f5f9",
                  color: "#475569",
                  padding: "3px 10px",
                  borderRadius: 12,
                  fontSize: 11,
                  fontWeight: 500,
                  border: "1px solid #e2e8f0",
                }}
              >
                Engine: {ragResult.provider_used || "LangChain + GPT-4o-mini"}
              </span>
            </div>
          </div>

          <div
            style={{
              fontSize: 14.5,
              lineHeight: 1.65,
              color: "#1e293b",
              background: "#f8fafc",
              padding: "16px 20px",
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              whiteSpace: "pre-line",
            }}
          >
            {ragResult.answer}
          </div>

          {/* Source Citations */}
          {ragResult.citations && ragResult.citations.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 8, textTransform: "uppercase" }}>
                Grounding Sources ({ragResult.citations.length}):
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {ragResult.citations.map((c) => (
                  <button
                    key={c.document_id}
                    type="button"
                    onClick={() => openDocById(c.document_id)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      background: "#ffffff",
                      border: "1px solid #cbd5e1",
                      borderRadius: 6,
                      padding: "5px 12px",
                      fontSize: 12,
                      color: "#0369a1",
                      fontWeight: 600,
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                    title="Click to inspect document"
                  >
                    <span>📄 {c.filename}</span>
                    {c.total != null && (
                      <span style={{ color: "#047857", fontWeight: 700 }}>
                        {money(c.total, c.currency)}
                      </span>
                    )}
                    <span style={{ color: "#64748b", fontSize: 11 }}>
                      ({(c.similarity * 100).toFixed(0)}% match)
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Search Hits Table */}
      {hits && (
        <div className="card card-flush">
          <div
            className="card-head"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
              {hits.length} result{hits.length === 1 ? "" : "s"} found
            </h2>
            {hits.length > 0 && (
              <button
                type="button"
                onClick={exportHitsCsv}
                className="btn btn-sm"
              >
                ⤓ Export to CSV
              </button>
            )}
          </div>

          {!hits.length ? (
            <div className="empty" style={{ padding: "40px 20px", textAlign: "center" }}>
              Nothing matched your query. Try different terms or ask a question in RAG mode.
            </div>
          ) : (
            <div className="table-wrap">
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#fafbfc", borderBottom: "1px solid #e2e8f0", fontSize: 12, color: "#64748b" }}>
                    <th style={{ padding: "10px 14px" }}>Document</th>
                    <th style={{ padding: "10px 14px" }}>Match</th>
                    <th style={{ padding: "10px 14px" }}>Invoice #</th>
                    <th style={{ padding: "10px 14px" }}>Supplier / Vendor</th>
                    <th style={{ padding: "10px 14px" }}>Total</th>
                    <th style={{ padding: "10px 14px" }}>Status</th>
                    <th style={{ padding: "10px 14px", textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {hits.map((h) => {
                    const doc = h.document || ({} as any);
                    const sum = doc.summary || ({} as any);
                    const filename = doc.filename || (h as any).filename || "Document";
                    const supplier = sum.supplier_name || (h as any).supplier_name || "—";
                    const invNumber = sum.invoice_number || (h as any).invoice_number || "—";
                    const totalVal = sum.total ?? (h as any).total ?? null;
                    const currency = sum.currency || (h as any).currency || "USD";
                    const statusVal = doc.status || "completed";
                    const snippet = h.snippet || (h as any).text || "";

                    return (
                      <tr key={h.document_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ minWidth: 220, padding: "12px 14px" }}>
                          <button
                            type="button"
                            onClick={() => openDocById(h.document_id)}
                            style={{
                              background: "none",
                              border: "none",
                              padding: 0,
                              color: "#0b63b8",
                              fontWeight: 600,
                              cursor: "pointer",
                              textAlign: "left",
                              fontSize: 13.5,
                            }}
                          >
                            {filename}
                          </button>
                          {snippet && (
                            <div
                              style={{
                                color: "#64748b",
                                fontSize: 12,
                                marginTop: 4,
                                maxWidth: 460,
                                lineHeight: 1.4,
                              }}
                            >
                              {snippet}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <span
                            style={{
                              display: "inline-block",
                              background: "#eff6ff",
                              color: "#1d4ed8",
                              border: "1px solid #bfdbfe",
                              padding: "2px 8px",
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 600,
                            }}
                          >
                            {(h.match || "SEMANTIC").toUpperCase()}
                          </span>
                          <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>
                            {Math.round((h.score || 0) * 100)}% relevance
                          </div>
                        </td>
                        <td style={{ padding: "12px 14px", fontWeight: 500, fontSize: 13 }}>
                          {invNumber}
                        </td>
                        <td style={{ padding: "12px 14px", fontWeight: 500, fontSize: 13 }}>
                          {supplier}
                        </td>
                        <td style={{ padding: "12px 14px", fontWeight: 600, fontSize: 13 }}>
                          {money(totalVal, currency)}
                        </td>
                        <td style={{ padding: "12px 14px" }}>
                          <StatusBadge status={statusVal} />
                        </td>
                        <td style={{ padding: "12px 14px", textAlign: "right" }}>
                          <button
                            type="button"
                            onClick={() => openDocById(h.document_id)}
                            className="btn btn-sm"
                            style={{ padding: "3px 8px", fontSize: 11.5 }}
                          >
                            View
                          </button>
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

      {/* Structured Docs Table (Filters mode) */}
      {docs && (
        <div className="card card-flush">
          <div className="card-head">
            <h2 style={{ margin: 0, fontSize: 15 }}>
              {docs.length} document{docs.length === 1 ? "" : "s"} found
            </h2>
          </div>
          <DocTable docs={docs} onViewDoc={(d) => setInspectDoc(d)} />
        </div>
      )}

      {/* Bottom Global Enterprise Footer */}
      <div
        style={{
          marginTop: 40,
          paddingTop: 20,
          borderTop: "1px solid #e2e8f0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          fontSize: 12,
          color: "#64748b",
        }}
      >
        <div>
          <strong style={{ color: "#334155" }}>DocuIntel Enterprise v3.2</strong> • LangChain Multi-Modal Agent Engine Active
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <a href="#" onClick={(e) => e.preventDefault()} style={{ color: "#64748b", textDecoration: "none" }}>
            API Documentation
          </a>
          <a href="#" onClick={(e) => e.preventDefault()} style={{ color: "#64748b", textDecoration: "none" }}>
            Vector Index Status
          </a>
          <a href="#" onClick={(e) => e.preventDefault()} style={{ color: "#64748b", textDecoration: "none" }}>
            Security &amp; Compliance (SOC2)
          </a>
          <a href="#" onClick={(e) => e.preventDefault()} style={{ color: "#64748b", textDecoration: "none" }}>
            Support
          </a>
        </div>
      </div>

      {/* Document Inspector Modal */}
      {inspectDoc && (
        <DocModal
          doc={inspectDoc}
          onClose={() => setInspectDoc(null)}
          onDeleted={() => {
            setInspectDoc(null);
            if (q) void executeSearch(q);
          }}
        />
      )}
    </div>
  );
}
