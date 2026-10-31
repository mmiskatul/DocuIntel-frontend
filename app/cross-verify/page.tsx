"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, GitCompareArrows, Info, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { CrossVerifyReport, DocumentOut } from "@/lib/types";

const VERDICT: Record<CrossVerifyReport["verdict"], { tone: string; title: string; icon: React.ReactNode }> = {
  match: { tone: "ok", title: "Every shared invoice matches", icon: <CheckCircle2 size={18} /> },
  discrepancies_found: { tone: "review", title: "Differences found", icon: <AlertTriangle size={18} /> },
  no_comparable_invoices: { tone: "work", title: "No invoice numbers in common", icon: <Info size={18} /> },
};

const FIELD_LABEL: Record<string, string> = {
  supplier_name: "Supplier", customer_name: "Customer", invoice_date: "Invoice date", currency: "Currency",
  subtotal: "Subtotal", tax: "Tax", total: "Total",
};
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "number" ? money(v) : String(v));

export default function CrossVerifyPage() {
  const [docs, setDocs] = useState<DocumentOut[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [flag, setFlag] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<CrossVerifyReport | null>(null);

  useEffect(() => {
    api.listDocuments({ limit: 200 })
      .then((all) => setDocs(all.filter((d) => d.status === "completed" || d.status === "needs_review")))
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }, []);

  const run = async () => {
    setBusy(true);
    setError(null);
    setReport(null);
    try { setReport(await api.crossVerify(left, right, flag)); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const options = (exclude: string) => docs.filter((d) => d.id !== exclude).map((d) => <option key={d.id} value={d.id}>{d.filename}</option>);
  const v = report && VERDICT[report.verdict];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Cross-verify</h1>
          <p className="page-sub">
            Compare two processed documents invoice by invoice: a PDF against another PDF, or against an Excel or CSV ledger.
            Invoices are paired by invoice number, then supplier, date, currency and amounts are compared.
          </p>
        </div>
      </div>

      <section className="card card-pad">
        <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
          <label className="field"><span>Document A</span>
            <select className="select" value={left} onChange={(e) => setLeft(e.target.value)}><option value="">Choose a document</option>{options(right)}</select>
          </label>
          <label className="field"><span>Document B</span>
            <select className="select" value={right} onChange={(e) => setRight(e.target.value)}><option value="">Choose a document</option>{options(left)}</select>
          </label>
        </div>
        <div className="row" style={{ marginTop: 16, justifyContent: "space-between" }}>
          <label className="check"><input type="checkbox" checked={flag} onChange={(e) => setFlag(e.target.checked)} /> Send mismatched invoices to review</label>
          <button type="button" className="btn btn-primary" disabled={!left || !right || busy} onClick={run}>
            {busy ? <><Loader2 size={15} className="spin" /> Comparing…</> : <><GitCompareArrows size={15} /> Compare</>}
          </button>
        </div>
      </section>

      {loaded && docs.length < 2 && !error && (
        <p className="muted" style={{ marginTop: 14 }}>You need at least two processed documents. <Link href="/" className="link">Upload documents</Link> first.</p>
      )}
      {error && <div className="alert alert-error" role="alert" style={{ marginTop: 16 }}><AlertTriangle size={16} /><div>{error}</div></div>}

      {report && v && (
        <div className="stack" style={{ marginTop: 16 }}>
          <div className={`verdict ${v.tone}`} role="status" style={{ marginBottom: 0 }}>
            <span className="v-icon">{v.icon}</span>
            <div>
              <h2>{v.title}</h2>
              <p className="mono">
                {report.summary.matched} matched · {report.summary.mismatched} different · {report.summary.only_in_left} only in A · {report.summary.only_in_right} only in B
                {report.flagged_results > 0 && ` · ${report.flagged_results} sent to review`}
              </p>
            </div>
          </div>

          {report.mismatched.length > 0 && (
            <section className="card" aria-label="Differences">
              <div className="card-head"><h2 className="card-title">Differences</h2></div>
              <div className="table-wrap">
                <table className="t">
                  <thead>
                    <tr><th>Invoice</th><th>Field</th><th className="num">A · {report.left_document.filename}</th><th className="num">B · {report.right_document.filename}</th><th className="num">Gap</th></tr>
                  </thead>
                  <tbody>
                    {report.mismatched.flatMap((m) => m.differences.map((d, i) => (
                      <tr key={`${m.invoice_number}-${d.field}-${i}`}>
                        <td className="mono">{i === 0 ? m.invoice_number : ""}</td>
                        <td>
                          <span className={`badge ${d.severity === "error" ? "b-failed" : "b-needs_review"}`}>{FIELD_LABEL[d.field] ?? d.field.replace("_", " ")}</span>
                        </td>
                        <td className="num">{show(d.left)}</td>
                        <td className="num">{show(d.right)}</td>
                        <td className="num">{d.difference !== undefined ? money(d.difference) : ""}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {([["only_in_left", "A", report.left_document.filename], ["only_in_right", "B", report.right_document.filename]] as const).map(([key, side, name]) =>
            report[key].length > 0 && (
              <section className="card" key={key} aria-label={`Only in ${side}`}>
                <div className="card-head"><h2 className="card-title">Only in {side}</h2><span className="muted small truncate" style={{ maxWidth: 320 }}>{name}</span></div>
                <div className="table-wrap">
                  <table className="t">
                    <tbody>
                      {report[key].map((r, i) => (
                        <tr key={`${r.invoice_number}-${i}`}>
                          <td className="mono">{r.invoice_number}</td>
                          <td>{r.supplier_name || <span className="muted">—</span>}</td>
                          <td className="num">{r.total != null ? money(r.total) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}

          {report.matched.length > 0 && (
            <section className="card card-pad">
              <div className="eyebrow" style={{ marginBottom: 8 }}>Matched ({report.matched.length})</div>
              <div className="chips">{report.matched.map((m) => <span key={m.invoice_number} className="tag mono">{m.invoice_number}</span>)}</div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
