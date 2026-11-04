"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, ArrowUpRight, Download, FileSearch, FileText, Loader2, MessageSquareText, Search, Sparkles } from "lucide-react";
import { DocTable } from "@/components/DocTable";
import { StatusBadge } from "@/components/StatusBadge";
import { money } from "@/lib/format";
import type { DocFilters } from "@/lib/types";
import { useAppDispatch, useAppSelector } from "@/store";
import { clearRecent, runFilterSearch, runRagQuery, runSearch, setMode, setQuery, type SearchMode } from "@/store/searchSlice";

const MODES: { id: SearchMode; label: string; hint: string; icon: typeof Search }[] = [
  { id: "rag", label: "Ask a question", hint: "Get an answer written from your documents, with the sources it used", icon: MessageSquareText },
  { id: "hybrid", label: "Find documents", hint: "Match by meaning and by exact words together", icon: FileSearch },
  { id: "filters", label: "Filter", hint: "Narrow by supplier, status or amount", icon: Search },
];

const FIND_MODES: SearchMode[] = ["hybrid", "semantic", "keyword", "exact"];
const FIND_BY: { id: SearchMode; label: string; hint: string }[] = [
  { id: "hybrid", label: "Smart", hint: "Meaning and exact words together; an exact ID or invoice number always comes first" },
  { id: "semantic", label: "Meaning", hint: "Finds documents about the same thing, even with different words" },
  { id: "keyword", label: "Words", hint: "Finds documents containing your words in the name, parties or text" },
  { id: "exact", label: "Exact", hint: "One specific ID, invoice number, supplier or amount; or fields like supplier:Acme total:1200" },
];

const EXAMPLES = [
  "What is the total across all invoices?",
  "Which suppliers have we been invoiced by?",
  "Which invoices are over 1,000?",
  "Show software and cloud expenses",
];

export default function SearchPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { query: q, mode, hits, docs, ragResult, loading, ragLoading, error: reduxError, recent } = useAppSelector((s) => s.search);

  // Render the default mode on the server and first client pass so the HTML matches
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const activeMode: SearchMode = mounted ? mode || "rag" : "rag";

  const [f, setF] = useState<Record<string, string>>({});
  const [needsReview, setNeedsReview] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const busy = loading || ragLoading;
  const error = localError || reduxError;
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const open = (id: string) => router.push(`/documents/${id}`);

  // Arrive from a link such as /search?q=invoice.pdf
  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q");
    if (initial) { dispatch(setQuery(initial)); dispatch(setMode("hybrid")); void execute(initial, "hybrid"); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function execute(text: string, m: SearchMode = activeMode) {
    setLocalError(null);
    try {
      if (m === "filters") {
        const filters: DocFilters = {
          q: text || undefined, supplier: f.supplier || undefined, invoice_number: f.invoice_number || undefined,
          status: f.status || undefined, date_from: f.date_from || undefined, date_to: f.date_to || undefined,
          min_total: f.min_total ? Number(f.min_total) : undefined, max_total: f.max_total ? Number(f.max_total) : undefined,
          needs_review: needsReview || undefined,
        };
        await dispatch(runFilterSearch(filters)).unwrap();
      } else if (!text.trim()) {
        setLocalError(m === "rag" ? "Type a question first." : "Type something to search for.");
      } else if (m === "rag") {
        await dispatch(runRagQuery({ q: text.trim() })).unwrap();
      } else {
        await dispatch(runSearch({ q: text.trim(), mode: FIND_MODES.includes(m) ? (m as "hybrid" | "semantic" | "keyword" | "exact") : "hybrid" })).unwrap();
      }
    } catch (err: any) {
      // a failed search store thunk throws its message as plain text, not as an Error
      setLocalError(typeof err === "string" ? err : err?.message || "The search failed. Try again.");
    }
  }

  const submit = (e: FormEvent) => { e.preventDefault(); void execute(q); };

  function exportHits() {
    if (!hits?.length) return;
    const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Document ID", "Filename", "Status", "Supplier", "Invoice number", "Invoice date", "Total", "Currency", "Match", "Relevance", "Snippet"].map(cell).join(",");
    const rows = hits.map((h) => {
      const d = h.document, s = d?.summary;
      return [h.document_id, d?.filename, d?.status, s?.supplier_name, s?.invoice_number, s?.invoice_date, s?.total, s?.currency, h.match, (h.score ?? 0).toFixed(2), h.snippet].map(cell).join(",");
    });
    const url = URL.createObjectURL(new Blob([[head, ...rows].join("\r\n")], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `search_results_${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const placeholder =
    activeMode === "rag" ? "Ask anything, e.g. Which supplier did we pay the most?"
    : activeMode === "filters" ? "Optional words to look for"
    : activeMode === "exact" ? "An ID, invoice number or supplier, or fields: supplier:Acme total:1200"
    : activeMode === "semantic" ? "Describe what you are looking for, e.g. cloud hosting costs"
    : "Search by supplier, invoice number or what the invoice is for";

  return (
    <div suppressHydrationWarning>
      <div className="page-head">
        <div>
          <h1 className="page-title">Search</h1>
          <p className="page-sub">Ask questions in plain language, or find the document you need. Answers are written from verified documents.</p>
        </div>
      </div>

      <div className="seg" role="tablist" aria-label="Search type" style={{ marginBottom: 14 }}>
        {MODES.map(({ id, label, hint, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={id === "hybrid" ? FIND_MODES.includes(activeMode) : activeMode === id} title={hint}
            onClick={() => { if (!(id === "hybrid" && FIND_MODES.includes(activeMode))) dispatch(setMode(id)); setLocalError(null); }}>
            <Icon size={14} />{label}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="card card-pad" style={{ position: "relative", overflow: "hidden" }} aria-busy={busy}>
        {busy && <div className="progress-indeterminate" aria-hidden="true" />}
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <label className="search-box" style={{ flex: 1 }}>
            <Search size={15} />
            <input className="input" type="search" placeholder={placeholder} value={q} aria-label="Search" onChange={(e) => dispatch(setQuery(e.target.value))} style={{ height: 40 }} />
          </label>
          <button className="btn btn-primary" style={{ height: 40 }} disabled={busy}>
            {busy ? <><Loader2 size={15} className="spin" /> {activeMode === "rag" ? "Reading…" : "Searching…"}</> : activeMode === "rag" ? <><Sparkles size={15} /> Ask</> : "Search"}
          </button>
        </div>

        {FIND_MODES.includes(activeMode) && (
          <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }} role="group" aria-label="Search by">
            <span className="eyebrow">Search by</span>
            <div className="seg">
              {FIND_BY.map(({ id, label, hint }) => (
                <button key={id} type="button" title={hint} aria-pressed={activeMode === id}
                  className={activeMode === id ? "active" : undefined}
                  onClick={() => { dispatch(setMode(id)); setLocalError(null); if (q.trim()) void execute(q, id); }}>{label}</button>
              ))}
            </div>
          </div>
        )}

        {activeMode !== "filters" && recent.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <span className="eyebrow">Recent</span>
              <button type="button" className="link small" onClick={() => dispatch(clearRecent())}>Clear</button>
            </div>
            <div className="chips">
              {recent.map((r) => (
                <button key={r} type="button" className="chip" onClick={() => { dispatch(setQuery(r)); void execute(r, activeMode); }}>{r}</button>
              ))}
            </div>
          </div>
        )}

        {activeMode !== "filters" && (
          <div style={{ marginTop: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>Try one</div>
            <div className="chips">
              {EXAMPLES.map((ex) => (
                <button key={ex} type="button" className="chip" onClick={() => { dispatch(setQuery(ex)); dispatch(setMode("rag")); void execute(ex, "rag"); }}>{ex}</button>
              ))}
            </div>
          </div>
        )}

        {activeMode === "filters" && (
          <div className="form-grid" style={{ marginTop: 16 }}>
            <label className="field"><span>Supplier</span><input className="input" value={f.supplier ?? ""} onChange={(e) => set("supplier", e.target.value)} /></label>
            <label className="field"><span>Invoice number</span><input className="input" value={f.invoice_number ?? ""} onChange={(e) => set("invoice_number", e.target.value)} /></label>
            <label className="field"><span>Status</span>
              <select className="select" value={f.status ?? ""} onChange={(e) => set("status", e.target.value)}>
                <option value="">Any</option><option value="completed">Verified</option><option value="needs_review">Needs review</option>
                <option value="rejected">Rejected</option><option value="failed">Failed</option>
              </select>
            </label>
            <label className="field"><span>Date from</span><input className="input" type="date" value={f.date_from ?? ""} onChange={(e) => set("date_from", e.target.value)} /></label>
            <label className="field"><span>Date to</span><input className="input" type="date" value={f.date_to ?? ""} onChange={(e) => set("date_to", e.target.value)} /></label>
            <label className="field"><span>Smallest total</span><input className="input num" type="number" value={f.min_total ?? ""} onChange={(e) => set("min_total", e.target.value)} /></label>
            <label className="field"><span>Largest total</span><input className="input num" type="number" value={f.max_total ?? ""} onChange={(e) => set("max_total", e.target.value)} /></label>
            <label className="check" style={{ alignSelf: "end", height: 34 }}><input type="checkbox" checked={needsReview} onChange={(e) => setNeedsReview(e.target.checked)} /> Needs review only</label>
          </div>
        )}
      </form>

      {error && <div className="alert alert-error" role="alert" style={{ marginTop: 16 }}><AlertTriangle size={16} /><div>{error}</div></div>}

      {ragLoading && <AnswerSkeleton />}
      {loading && <ResultsSkeleton filters={activeMode === "filters"} />}

      {ragResult && (
        <section className="card" style={{ marginTop: 16 }} aria-label="Answer">
          <div className="card-head">
            <h2 className="card-title"><Sparkles size={16} /> Answer</h2>
          </div>
          <div className="card-body">
            <p className="answer">{ragResult.answer}</p>
            {ragResult.citations?.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Sources ({ragResult.citations.length})</div>
                <div className="chips">
                  {ragResult.citations.map((c) => (
                    <button key={c.document_id} type="button" className="cite" onClick={() => open(c.document_id)} title="Open this document">
                      <FileText size={14} /> <span>{c.filename}</span>
                      {c.total != null && <span className="mono muted">{money(c.total, c.currency)}</span>}
                      <span className="muted small">{Math.round(c.similarity * 100)}% match</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {hits && (
        <section className="card" style={{ marginTop: 16 }} aria-label="Results">
          <div className="card-head">
            <h2 className="card-title">{hits.length} result{hits.length === 1 ? "" : "s"}</h2>
            {hits.length > 0 && <button type="button" className="btn btn-sm" onClick={exportHits}><Download size={14} /> Export CSV</button>}
          </div>
          {!hits.length ? (
            <div className="empty"><FileSearch size={36} /><strong>Nothing matched</strong>Try other words, or switch to “Ask a question”.</div>
          ) : (
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Document</th><th>Match</th><th>Invoice no.</th><th>Supplier</th><th className="num">Total</th><th>Status</th><th><span className="sr-only">Open</span></th></tr></thead>
                <tbody>
                  {hits.map((h) => {
                    const d = h.document, s = d?.summary;
                    return (
                      <tr key={h.document_id}>
                        <td style={{ maxWidth: 360 }}>
                          <button type="button" className="doc-name link" onClick={() => open(h.document_id)} style={{ textAlign: "left" }}>{d?.filename || "Document"}</button>
                          {h.snippet && <div className="hit-snippet">{h.snippet}</div>}
                        </td>
                        <td><span className="tag">{h.match === "exact" || h.matched_exact ? "exact match" : h.match}</span><div className="cell-sub mono">{Math.round((h.score ?? 0) * 100)}% relevant</div></td>
                        <td className="mono">{s?.invoice_number || <span className="muted">—</span>}</td>
                        <td>{s?.supplier_name || <span className="muted">—</span>}</td>
                        <td className="num">{s?.total != null ? money(s.total, s.currency) : <span className="muted">—</span>}</td>
                        <td>{d?.status && <StatusBadge status={d.status} />}</td>
                        <td><button type="button" className="btn-icon" aria-label="Open document" onClick={() => open(h.document_id)}><ArrowUpRight size={16} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {docs && (
        <section className="card" style={{ marginTop: 16 }} aria-label="Matching documents">
          <div className="card-head"><h2 className="card-title">{docs.length} document{docs.length === 1 ? "" : "s"}</h2></div>
          <DocTable docs={docs} onViewDoc={(d) => open(d.id)} emptyHint="No document matches these filters." />
        </section>
      )}
    </div>
  );
}

/** Shown while a question is being answered: the answer card with moving placeholder lines. */
function AnswerSkeleton() {
  return (
    <section className="card" style={{ marginTop: 16 }} role="status" aria-live="polite" aria-label="Reading your documents">
      <div className="card-head">
        <h2 className="card-title"><Sparkles size={16} /> Answer</h2>
        <span className="thinking">Reading your documents<span className="dots" aria-hidden="true"><i /><i /><i /></span></span>
      </div>
      <div className="card-body" style={{ display: "grid", gap: 11 }}>
        <div className="skeleton" style={{ height: 15, width: "94%" }} />
        <div className="skeleton" style={{ height: 15, width: "88%" }} />
        <div className="skeleton" style={{ height: 15, width: "76%" }} />
        <div className="skeleton" style={{ height: 15, width: "58%" }} />
        <div className="row" style={{ marginTop: 10 }}>
          <div className="skeleton" style={{ height: 34, width: 210, borderRadius: 8 }} />
          <div className="skeleton" style={{ height: 34, width: 180, borderRadius: 8 }} />
          <div className="skeleton" style={{ height: 34, width: 230, borderRadius: 8 }} />
        </div>
      </div>
    </section>
  );
}

/** Shown while documents are being searched: the results card with moving placeholder rows. */
function ResultsSkeleton({ filters }: { filters: boolean }) {
  return (
    <section className="card" style={{ marginTop: 16 }} role="status" aria-live="polite" aria-label="Searching">
      <div className="card-head">
        <h2 className="card-title">{filters ? "Filtering" : "Searching"}<span className="dots" aria-hidden="true"><i /><i /><i /></span></h2>
      </div>
      <div style={{ padding: 16, display: "grid", gap: 14 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr 1fr 1.2fr .8fr", gap: 18, alignItems: "center" }}>
            <div style={{ display: "grid", gap: 7 }}>
              <div className="skeleton" style={{ height: 14, width: "70%" }} />
              <div className="skeleton" style={{ height: 11, width: "95%" }} />
            </div>
            <div className="skeleton" style={{ height: 14 }} />
            <div className="skeleton" style={{ height: 14 }} />
            <div className="skeleton" style={{ height: 14 }} />
            <div className="skeleton" style={{ height: 22, borderRadius: 999 }} />
          </div>
        ))}
      </div>
    </section>
  );
}
