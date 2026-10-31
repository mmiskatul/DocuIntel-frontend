"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, ChevronLeft, ChevronRight, FileSearch, Info, Loader2,
  Minus, Pencil, Plus, RotateCw, ShieldX, Trash2, X, XCircle,
} from "lucide-react";
import FilePreview from "@/components/FilePreview";
import { ProgressBar, StatusBadge } from "@/components/StatusBadge";
import { api } from "@/lib/api";
import { bytes, fileKind, money, shortDate } from "@/lib/format";
import { IN_FLIGHT, type DocumentOut, type ResultOut } from "@/lib/types";

const REVIEWER = "reviewer@docuintel.com";
type Notice = { type: "success" | "error" | "info"; text: string };
type ViewMode = "preview" | "page_text" | "all_text";

// Splits the stored OCR text into pages ("--- Page N ---" markers)
function parsePagesFromText(rawText: string): Record<number, string> {
  const pages: Record<number, string> = {};
  if (!rawText) return pages;
  const parts = rawText.split(/--- Page (\d+) ---/);
  if (parts.length > 1) {
    for (let i = 1; i < parts.length; i += 2) pages[parseInt(parts[i], 10)] = parts[i + 1]?.trim() || "";
  } else {
    pages[1] = rawText.trim();
  }
  return pages;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export default function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: docId } = use(params);
  const router = useRouter();

  const [doc, setDoc] = useState<DocumentOut | null>(null);
  const [results, setResults] = useState<ResultOut[]>([]);
  const [invoiceIdx, setInvoiceIdx] = useState(0);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [zoom, setZoom] = useState(100);

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [customTotal, setCustomTotal] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [edit, setEdit] = useState({ supplier_name: "", customer_name: "", invoice_date: "", invoice_number: "", subtotal: "", tax: "", total: "", currency: "USD" });

  const loadData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const [d, r, h] = await Promise.all([
        api.getDocument(docId),
        api.getResults(docId).catch(() => []),
        api.getHistory(docId).catch(() => []),
      ]);
      setDoc(d);
      setResults(r || []);
      setHistory(h || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Could not load this document.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [docId]);

  useEffect(() => { void loadData(); }, [loadData]);

  // Follow a document that is still being processed (first upload or a re-run)
  const inFlight = !!doc && IN_FLIGHT.includes(doc.status);
  useEffect(() => {
    if (!inFlight) return;
    const t = setInterval(() => void loadData(true), 2500);
    return () => clearInterval(t);
  }, [inFlight, loadData]);

  if (loading) {
    return (
      <div className="stack" aria-busy="true">
        <div className="skeleton" style={{ height: 34, width: 320 }} />
        <div className="skeleton" style={{ height: 80 }} />
        <div className="workspace"><div className="skeleton" style={{ height: 560 }} /><div className="skeleton" style={{ height: 560 }} /></div>
      </div>
    );
  }
  if (error || !doc) {
    return (
      <div className="card empty" style={{ maxWidth: 520, margin: "40px auto" }}>
        <XCircle size={36} />
        <strong>We could not open this document</strong>
        <p>{error || "It may have been deleted."}</p>
        <Link href="/" className="btn btn-primary" style={{ marginTop: 16 }}><ArrowLeft size={15} /> Back to documents</Link>
      </div>
    );
  }

  // ------------------------------------------------------------------ derived values
  const current = results[Math.min(invoiceIdx, Math.max(results.length - 1, 0))] as ResultOut | undefined;
  const data: any = current?.data || {};
  const rawText: string = data.raw_text || (current as any)?.raw_text || "";
  const pageTexts = parsePagesFromText(rawText);
  const totalPages = Math.max(doc.page_count || 1, Object.keys(pageTexts).length);

  const supplier: string | null = data.supplier_name || doc.summary?.supplier_name || null;
  const customer: string | null = data.customer_name || doc.summary?.customer_name || null;
  const invoiceDate: string | null = data.invoice_date || doc.summary?.invoice_date || null;
  const invoiceNo: string | null = data.invoice_number || doc.summary?.invoice_number || null;
  const subtotal: number | null = data.subtotal != null ? Number(data.subtotal) : null;
  const tax: number | null = data.tax != null ? Number(data.tax) : null;
  const total: number | null = data.total != null ? Number(data.total) : doc.summary?.total != null ? Number(doc.summary.total) : null;
  const currency: string = data.currency || doc.summary?.currency || "USD";
  const lineItems: any[] = data.line_items || [];
  const documentType: string = data.document_type || "document";
  const confidence = current?.overall_confidence;

  const isRejected = doc.status === "rejected" || data.is_supported_format === false;
  const rejectionReason = doc.error || data.rejection_reason || (isRejected ? `This does not look like an invoice, waybill or receipt (read as: ${documentType}).` : null);
  const issues: any[] = data.issues || current?.issues || [];
  const errorIssues = issues.filter((i) => i.severity === "error");
  const needsReview = (doc.status === "needs_review" || errorIssues.length > 0) && doc.status !== "completed";

  // Arithmetic: subtotal + tax should equal the stated total (or, without a subtotal, the sum of the lines)
  let expected: number | null = null;
  let basis = "Subtotal + tax";
  if (subtotal !== null && total !== null) expected = round2(subtotal + (tax ?? 0));
  else if (subtotal === null && total !== null && lineItems.length) {
    const lines = lineItems.reduce((a, i) => a + (Number(i.amount) || 0), 0);
    if (lines > 0) { expected = round2(lines + (tax ?? 0)); basis = "Sum of line items + tax"; }
  }
  const variance = expected !== null && total !== null ? round2(total - expected) : null;
  const mathOff = variance !== null && Math.abs(variance) > 0.05;
  const needsAction = mathOff && doc.status !== "completed";
  const lineSum = lineItems.length ? round2(lineItems.reduce((a, i) => a + (Number(i.amount) || 0), 0)) : null;
  const linesOff = lineSum !== null && subtotal !== null && Math.abs(lineSum - subtotal) > 0.05;

  const ok = (m: string) => setNotice({ type: "success", text: m });
  const fail = (m: string) => setNotice({ type: "error", text: m });

  const run = async (fn: () => Promise<void>, errPrefix: string) => {
    setBusy(true);
    try { await fn(); } catch (err: any) { fail(`${errPrefix}: ${err.message}`); } finally { setBusy(false); }
  };

  // ------------------------------------------------------------------ actions
  const approve = () => run(async () => {
    await api.approve(doc.id, REVIEWER);
    ok("Approved. The document is verified and now searchable.");
    await loadData(true);
  }, "Could not approve");

  const applySum = () => expected !== null && run(async () => {
    await api.reconcile(doc.id, { subtotal: subtotal ?? undefined, tax: tax ?? undefined, total: expected!, action: "apply_sum", reviewer: REVIEWER });
    ok(`Total corrected to ${money(expected, currency)} and the document is verified.`);
    await loadData(true);
  }, "Could not apply the calculated total");

  const keepStated = () => total !== null && run(async () => {
    await api.reconcile(doc.id, { subtotal: subtotal ?? undefined, tax: tax ?? undefined, total, action: "override", reviewer: REVIEWER });
    ok(`Stated total of ${money(total, currency)} accepted and the document is verified.`);
    await loadData(true);
  }, "Could not accept the stated total");

  const saveCustomTotal = () => customTotal && run(async () => {
    await api.reconcile(doc.id, { total: parseFloat(customTotal), action: "manual", reviewer: REVIEWER } as any);
    ok(`Total set to ${money(parseFloat(customTotal), currency)} and the document is verified.`);
    setManualOpen(false);
    setCustomTotal("");
    await loadData(true);
  }, "Could not save the total");

  const reject = async () => {
    if (!confirm("Reject this document? It will be excluded from search.")) return;
    await run(async () => {
      await api.reject(doc.id, "Not a supported invoice, waybill or receipt.", REVIEWER);
      fail("Rejected. The document is excluded from search.");
      await loadData(true);
    }, "Could not reject");
  };

  const remove = async () => {
    if (!confirm(`Delete ${doc.filename}? This cannot be undone.`)) return;
    try { await api.deleteDocument(doc.id); router.push("/"); } catch (err: any) { fail(`Could not delete: ${err.message}`); }
  };

  const rerun = () => run(async () => {
    await api.rerunOcr(doc.id);
    setNotice({ type: "info", text: "Reading the document again. This page updates when it finishes." });
    await loadData(true);
  }, "Could not restart processing");

  const startEdit = () => {
    setEdit({
      supplier_name: supplier || "", customer_name: customer || "", invoice_date: invoiceDate || "", invoice_number: invoiceNo || "",
      subtotal: subtotal !== null ? String(subtotal) : "", tax: tax !== null ? String(tax) : "", total: total !== null ? String(total) : "", currency,
    });
    setEditMode(true);
  };

  const saveEdit = () => run(async () => {
    const c: Record<string, any> = {
      supplier_name: edit.supplier_name.trim() || undefined, customer_name: edit.customer_name.trim() || undefined,
      invoice_date: edit.invoice_date.trim() || undefined, invoice_number: edit.invoice_number.trim() || undefined,
      currency: edit.currency.trim().toUpperCase() || "USD",
    };
    if (edit.subtotal !== "") c.subtotal = parseFloat(edit.subtotal);
    if (edit.tax !== "") c.tax = parseFloat(edit.tax);
    if (edit.total !== "") c.total = parseFloat(edit.total);
    await api.correctDocument(doc.id, c, undefined, current?.id);
    ok("Corrections saved.");
    setEditMode(false);
    await loadData(true);
  }, "Could not save corrections");

  // ------------------------------------------------------------------ view helpers
  const kind = fileKind(doc.file_type, doc.filename);
  const verdict = isRejected
    ? { tone: "bad", icon: <ShieldX size={18} />, title: "Rejected: not a billing document", text: rejectionReason }
    : doc.status === "failed"
    ? { tone: "bad", icon: <XCircle size={18} />, title: "Processing failed", text: doc.error || "The file could not be read. Try processing it again." }
    : inFlight
    ? { tone: "work", icon: <Loader2 size={18} className="spin" />, title: doc.status === "queued" ? "Waiting in the queue" : "Reading this document", text: "Results appear here as soon as extraction finishes." }
    : doc.status === "completed"
    ? { tone: "ok", icon: <CheckCircle2 size={18} />, title: "Verified and searchable", text: "The extracted values were checked and the document is indexed for search." }
    : { tone: "review", icon: <AlertTriangle size={18} />, title: "Needs your review", text: errorIssues.length ? "Check the flagged values below against the original page, then approve or correct them." : "Confirm the values against the original page, then approve." };

  const fact = (label: string, value: string | null, mono = false, wide = false) => (
    <div className={`fact${wide ? " wide" : ""}`}>
      <dt>{label}</dt>
      <dd className={`${value ? "" : "missing"}${mono ? " mono" : ""}`}>{value || "Not found"}</dd>
    </div>
  );
  const input = (key: keyof typeof edit, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field">
      <span>{label}</span>
      <input className={`input${props.type === "number" ? " num" : ""}`} value={edit[key]} onChange={(e) => setEdit({ ...edit, [key]: e.target.value })} {...props} />
    </label>
  );
  const confTone = confidence == null ? "" : confidence >= 0.8 ? "" : confidence >= 0.6 ? "mid" : "low";
  const range = (r: ResultOut): number[] | null => (r.data as any)?.page_range || null;

  return (
    <div>
      {/* ---------------------------------------------------------------- header */}
      <Link href="/" className="back"><ArrowLeft size={15} /> All documents</Link>
      <div className="page-head" style={{ marginBottom: 16 }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="page-title truncate" style={{ fontSize: 26 }} title={doc.filename}>{doc.filename}</h1>
          <div className="row" style={{ marginTop: 8, gap: 8 }}>
            <StatusBadge status={doc.status} />
            <span className={`tag ${({ pdf: "pdf", image: "img", sheet: "xls", other: "" } as const)[kind.kind]}`}>{kind.label}</span>
            <span className="muted small mono">{bytes(doc.size_bytes)} · {totalPages} page{totalPages === 1 ? "" : "s"} · uploaded {shortDate(doc.created_at)}</span>
          </div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="btn" onClick={rerun} disabled={busy || inFlight}><RotateCw size={15} /> Read again</button>
          {!isRejected && doc.status !== "completed" && <button type="button" className="btn btn-danger" onClick={reject} disabled={busy}><X size={15} /> Reject</button>}
          <button type="button" className="btn btn-danger" onClick={remove} disabled={busy}><Trash2 size={15} /> Delete</button>
          {!isRejected && doc.status !== "completed" && doc.status !== "failed" && !inFlight && (
            <button type="button" className="btn btn-verify" onClick={approve} disabled={busy}><Check size={15} /> Approve</button>
          )}
        </div>
      </div>

      <div className={`verdict ${verdict.tone}`} role="status">
        <span className="v-icon">{verdict.icon}</span>
        <div style={{ flex: 1 }}>
          <h2>{verdict.title}</h2>
          {verdict.text && <p>{verdict.text}</p>}
          {inFlight && <div style={{ marginTop: 10, maxWidth: 360 }}><ProgressBar doc={doc} /></div>}
        </div>
        {confidence != null && !isRejected && !inFlight && (
          <div className="confidence" title="Estimated from how many key fields were found and how well the page could be read. It is a guide, not a probability.">
            <div>
              <div className="eyebrow">Confidence</div>
              <div className="mono" style={{ fontWeight: 600, fontSize: 18 }}>{Math.round(confidence * 100)}%</div>
            </div>
            <span className={`bar ${confTone}`}><i style={{ width: `${Math.round(confidence * 100)}%` }} /></span>
          </div>
        )}
      </div>

      {results.length > 1 && (
        <div className="invoice-tabs" role="tablist" aria-label="Invoices in this document">
          <span className="muted small" style={{ marginRight: 4 }}>{results.length} invoices in this file</span>
          {results.map((r, i) => {
            const pr = range(r);
            return (
              <button key={r.id ?? i} type="button" role="tab" aria-selected={i === invoiceIdx}
                onClick={() => { setInvoiceIdx(i); setEditMode(false); if (pr) setCurrentPage(pr[0]); }}>
                {r.data?.invoice_number || `Invoice ${i + 1}`}
                {pr ? ` · p.${pr[0]}${pr[1] !== pr[0] ? `–${pr[1]}` : ""}` : ""}
                {r.needs_review && !r.reviewed && <AlertTriangle size={13} aria-label="needs review" />}
              </button>
            );
          })}
        </div>
      )}

      {notice && (
        <div className={`alert alert-${notice.type === "error" ? "error" : notice.type === "info" ? "info" : "ok"}`} role="status">
          {notice.type === "error" ? <AlertTriangle size={16} /> : notice.type === "info" ? <Info size={16} /> : <CheckCircle2 size={16} />}
          <div>{notice.text}</div>
          <button type="button" className="btn-icon" aria-label="Dismiss" onClick={() => setNotice(null)}><X size={15} /></button>
        </div>
      )}

      <div className="workspace">
        {/* ---------------------------------------------------------------- source page */}
        <section className="card viewer" aria-label="Original document">
          <div className="viewer-bar">
            <div className="stepper">
              <button type="button" className="btn-icon" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}><ChevronLeft size={17} /></button>
              <span className="pos">Page {currentPage} of {totalPages}</span>
              <button type="button" className="btn-icon" aria-label="Next page" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}><ChevronRight size={17} /></button>
            </div>
            {viewMode === "preview" && (
              <div className="stepper">
                <button type="button" className="btn-icon" aria-label="Zoom out" disabled={zoom <= 50} onClick={() => setZoom((z) => Math.max(50, z - 10))}><Minus size={15} /></button>
                <span className="pos mono" style={{ minWidth: 48 }}>{zoom}%</span>
                <button type="button" className="btn-icon" aria-label="Zoom in" disabled={zoom >= 200} onClick={() => setZoom((z) => Math.min(200, z + 10))}><Plus size={15} /></button>
              </div>
            )}
            <div className="seg" role="tablist" aria-label="View">
              <button type="button" role="tab" aria-selected={viewMode === "preview"} onClick={() => setViewMode("preview")}>Page</button>
              <button type="button" role="tab" aria-selected={viewMode === "page_text"} onClick={() => setViewMode("page_text")}>Page text</button>
              <button type="button" role="tab" aria-selected={viewMode === "all_text"} onClick={() => setViewMode("all_text")}>All text</button>
            </div>
          </div>
          <div className="canvas">
            {viewMode === "preview" ? (
              <FilePreview imageUrl={api.pageImageUrl(doc.id, currentPage)} fileUrl={api.fileUrl(doc.id)} fileType={doc.file_type || ""} filename={doc.filename} page={currentPage} zoom={zoom} />
            ) : (
              <pre className="canvas-text">
                {viewMode === "page_text"
                  ? pageTexts[currentPage] || `No text was read from page ${currentPage}.`
                  : rawText || "No text was read from this document."}
              </pre>
            )}
          </div>
        </section>

        {/* ---------------------------------------------------------------- review */}
        <div className="stack">
          {needsReview && !isRejected && (issues.length > 0 || needsAction) && (
            <section className="card" aria-label="Issues to resolve">
              <div className="card-head">
                <h2 className="card-title"><AlertTriangle size={16} style={{ color: "var(--review)" }} /> {issues.length || 1} thing{issues.length === 1 ? "" : "s"} to check</h2>
              </div>
              <div className="card-body">
                {issues.length > 0 && (
                  <ul className="issues" style={{ marginTop: 0 }}>
                    {issues.map((iss, i) => (
                      <li key={i} style={{ background: "var(--ground)" }}>
                        {iss.severity === "error"
                          ? <XCircle size={15} style={{ color: "var(--reject)", flex: "none", marginTop: 3 }} />
                          : <AlertTriangle size={15} style={{ color: "var(--review)", flex: "none", marginTop: 3 }} />}
                        <div><div className="code">{iss.code}</div>{iss.message}</div>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="actions-row">
                  {needsAction && expected !== null && <button type="button" className="btn btn-primary" onClick={applySum} disabled={busy}>Use calculated total {money(expected, currency)}</button>}
                  {needsAction && total !== null && <button type="button" className="btn" onClick={keepStated} disabled={busy}>Keep stated total {money(total, currency)}</button>}
                  <button type="button" className="btn" onClick={() => setManualOpen(!manualOpen)}><Pencil size={14} /> Enter a total</button>
                  <button type="button" className="btn btn-verify" onClick={approve} disabled={busy}><Check size={15} /> Approve as it is</button>
                </div>
                {manualOpen && (
                  <div className="row" style={{ marginTop: 12 }}>
                    <label className="field" style={{ width: 180 }}>
                      <span>Correct total ({currency})</span>
                      <input className="input num" type="number" step="0.01" placeholder="0.00" value={customTotal} onChange={(e) => setCustomTotal(e.target.value)} />
                    </label>
                    <button type="button" className="btn btn-verify" style={{ alignSelf: "flex-end" }} disabled={busy || !customTotal} onClick={saveCustomTotal}>Save and approve</button>
                  </div>
                )}
              </div>
            </section>
          )}

          {isRejected && (
            <section className="card card-body">
              <p><strong>Why it was rejected:</strong> {rejectionReason}</p>
              <p className="muted" style={{ marginTop: 8 }}>Rejected documents are kept out of search. If the document is valid, read it again; if not, delete it.</p>
            </section>
          )}

          {/* ------------------------------------------------ key facts */}
          <section className="card" aria-label="Extracted fields">
            <div className="card-head">
              <h2 className="card-title">Extracted fields</h2>
              {!isRejected && !inFlight && (
                editMode
                  ? <button type="button" className="btn btn-sm" onClick={() => setEditMode(false)}>Cancel</button>
                  : <button type="button" className="btn btn-sm" onClick={startEdit}><Pencil size={13} /> Edit values</button>
              )}
            </div>
            {editMode ? (
              <form className="card-body" onSubmit={(e) => { e.preventDefault(); void saveEdit(); }}>
                <div className="form-grid">
                  {input("supplier_name", "Supplier", { placeholder: "Acme Corp" })}
                  {input("customer_name", "Customer")}
                  {input("invoice_number", "Invoice number")}
                  {input("invoice_date", "Invoice date", { placeholder: "YYYY-MM-DD" })}
                  {input("subtotal", "Subtotal", { type: "number", step: "0.01" })}
                  {input("tax", "Tax", { type: "number", step: "0.01" })}
                  {input("total", "Total", { type: "number", step: "0.01" })}
                  {input("currency", "Currency", { maxLength: 3, placeholder: "USD" })}
                </div>
                <div className="row" style={{ marginTop: 16 }}>
                  <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save corrections"}</button>
                  <button type="button" className="btn" onClick={() => setEditMode(false)}>Cancel</button>
                </div>
              </form>
            ) : (
              <dl className="facts" style={{ margin: 0 }}>
                {fact("Supplier", supplier, false, true)}
                {fact("Customer", customer)}
                {fact("Invoice number", invoiceNo, true)}
                {fact("Invoice date", invoiceDate, true)}
                {fact("Currency", currency, true)}
              </dl>
            )}
          </section>

          {/* ------------------------------------------------ the ledger (signature) */}
          {!isRejected && (
            <section className="card" aria-label="Reconciliation">
              <div className="card-head">
                <h2 className="card-title">Reconciliation</h2>
                <span className="eyebrow">Amounts in {currency}</span>
              </div>
              <dl className="ledger" style={{ margin: 0 }}>
                <div className="ledger-row"><dt>Subtotal</dt><dd>{subtotal !== null ? money(subtotal) : "—"}</dd></div>
                <div className="ledger-row"><dt>Tax</dt><dd>{tax !== null ? money(tax) : "—"}</dd></div>
                {expected !== null && <div className="ledger-row sum"><dt>{basis}</dt><dd>{money(expected)}</dd></div>}
                <div className="ledger-row total"><dt>Total stated</dt><dd>{total !== null ? money(total) : "—"}</dd></div>
              </dl>
              <div style={{ padding: "0 20px 18px" }}>
                {variance === null ? (
                  <div className="ledger-check off"><Info size={15} /> Not enough figures to check the arithmetic.</div>
                ) : mathOff ? (
                  <div className="ledger-check off">
                    <AlertTriangle size={15} />
                    {doc.status === "completed" ? "Stated total accepted by a reviewer" : "Stated total does not match the figures above"}
                    <span className="mono">{variance > 0 ? "+" : "−"}{money(Math.abs(variance))}</span>
                  </div>
                ) : (
                  <div className="ledger-check ok"><CheckCircle2 size={15} /> The figures add up</div>
                )}
              </div>
            </section>
          )}

          {/* ------------------------------------------------ line items */}
          {!isRejected && (
            <section className="card" aria-label="Line items">
              <div className="card-head">
                <h2 className="card-title">Line items</h2>
                <span className="muted small">{lineItems.length} found</span>
              </div>
              {lineItems.length === 0 ? (
                <div className="empty" style={{ padding: "28px 20px" }}>No itemised lines were found. Check the page text.</div>
              ) : (
                <div className="table-wrap">
                  <table className="t">
                    <thead>
                      <tr><th>Description</th><th className="num">Qty</th><th className="num">Unit price</th><th className="num">Amount</th></tr>
                    </thead>
                    <tbody>
                      {lineItems.map((it, i) => (
                        <tr key={i}>
                          <td>{it.description || "Item"}</td>
                          <td className="num">{it.quantity ?? "—"}</td>
                          <td className="num">{it.unit_price != null ? money(Number(it.unit_price)) : "—"}</td>
                          <td className="num">{it.amount != null ? money(Number(it.amount)) : "—"}</td>
                        </tr>
                      ))}
                      {lineSum !== null && (
                        <tr>
                          <td colSpan={3} className="muted" style={{ textAlign: "right" }}>
                            Lines add up to{linesOff ? ` — the subtotal says ${money(subtotal)}` : ""}
                          </td>
                          <td className="num" style={{ fontWeight: 600, color: linesOff ? "var(--review-ink)" : undefined }}>{money(lineSum)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* ------------------------------------------------ activity */}
          <section className="card" id="activity" aria-label="Activity">
            <div className="card-head"><h2 className="card-title"><FileSearch size={16} /> Activity</h2></div>
            {history.length ? (
              <ol className="timeline">
                {[...history].reverse().map((h, i) => (
                  <li key={i}>
                    <span><b>{h.action}</b> — {h.message}</span>
                    <time>{h.timestamp ? new Date(h.timestamp).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : ""}</time>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="empty" style={{ padding: "24px 20px" }}>No activity recorded yet.</div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
