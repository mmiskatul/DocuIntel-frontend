"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { CrossVerifyReport, DocumentOut } from "@/lib/types";

const VERDICT: Record<CrossVerifyReport["verdict"], { text: string; bg: string; fg: string }> = {
  match: { text: "All invoices match", bg: "#ecfdf5", fg: "#047857" },
  discrepancies_found: { text: "Discrepancies found", bg: "#fffbeb", fg: "#b45309" },
  no_comparable_invoices: { text: "No invoice numbers in common", bg: "#f1f5f9", fg: "#475569" },
};

export default function CrossVerifyPage() {
  const [docs, setDocs] = useState<DocumentOut[]>([]);
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [flag, setFlag] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<CrossVerifyReport | null>(null);

  useEffect(() => {
    api.listDocuments({ limit: 200 })
      .then((all) => setDocs(all.filter((d) => d.status === "completed" || d.status === "needs_review")))
      .catch((e) => setError(e.message));
  }, []);

  const run = async () => {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      setReport(await api.crossVerify(left, right, flag));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const options = (exclude: string) =>
    docs.filter((d) => d.id !== exclude).map((d) => (
      <option key={d.id} value={d.id}>{d.filename}</option>
    ));

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ fontSize: 22, margin: "0 0 4px 0" }}>Cross-Verification</h1>
      <p style={{ color: "#64748b", margin: "0 0 16px 0", fontSize: 14 }}>
        Compare two processed documents invoice by invoice: PDF against PDF, or a PDF against an Excel/CSV ledger.
        Invoices are matched by invoice number, then supplier, date, currency and amounts are compared.
      </p>

      <div className="card" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", alignItems: "end" }}>
        <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>
          Document A
          <select value={left} onChange={(e) => setLeft(e.target.value)} style={{ padding: 8 }}>
            <option value="">Select a document…</option>
            {options(right)}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 13, fontWeight: 600 }}>
          Document B
          <select value={right} onChange={(e) => setRight(e.target.value)} style={{ padding: 8 }}>
            <option value="">Select a document…</option>
            {options(left)}
          </select>
        </label>
        <div style={{ display: "grid", gap: 8 }}>
          <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={flag} onChange={(e) => setFlag(e.target.checked)} />
            Flag mismatching invoices for manual review
          </label>
          <button className="btn btn-primary" disabled={!left || !right || busy} onClick={run}>
            {busy ? "Comparing…" : "Cross-verify"}
          </button>
        </div>
      </div>

      {docs.length < 2 && !error && (
        <p style={{ color: "#64748b", fontSize: 14 }}>
          You need at least two processed documents. <Link href="/" className="btn-link">Upload documents</Link> first.
        </p>
      )}
      {error && (
        <div role="alert" style={{ color: "#b91c1c", background: "#fef2f2", border: "1px solid #fecaca", padding: 10, borderRadius: 8 }}>
          {error}
        </div>
      )}

      {report && (
        <div style={{ marginTop: 16 }}>
          <div style={{ background: VERDICT[report.verdict].bg, color: VERDICT[report.verdict].fg, padding: "10px 14px", borderRadius: 8, fontWeight: 700 }}>
            {VERDICT[report.verdict].text}
            <span style={{ fontWeight: 400, marginLeft: 10, fontSize: 13 }}>
              {report.summary.matched} matched · {report.summary.mismatched} mismatched · {report.summary.only_in_left} only in A · {report.summary.only_in_right} only in B
              {report.flagged_results > 0 && ` · ${report.flagged_results} flagged for review`}
            </span>
          </div>

          {report.mismatched.length > 0 && (
            <div className="card card-flush" style={{ marginTop: 14 }}>
              <div className="card-head"><strong>Mismatches</strong></div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: "left", background: "#f8fafc" }}>
                      <th style={{ padding: 8 }}>Invoice</th>
                      <th style={{ padding: 8 }}>Field</th>
                      <th style={{ padding: 8 }}>A: {report.left_document.filename}</th>
                      <th style={{ padding: 8 }}>B: {report.right_document.filename}</th>
                      <th style={{ padding: 8 }}>Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.mismatched.flatMap((m) => m.differences.map((d, i) => (
                      <tr key={`${m.invoice_number}-${d.field}-${i}`} style={{ borderTop: "1px solid #e2e8f0" }}>
                        <td style={{ padding: 8, fontWeight: 600 }}>{i === 0 ? m.invoice_number : ""}</td>
                        <td style={{ padding: 8 }}>{d.field.replace("_", " ")} {d.severity === "error" ? "🔴" : "🟡"}</td>
                        <td style={{ padding: 8 }}>{String(d.left ?? "—")}</td>
                        <td style={{ padding: 8 }}>{String(d.right ?? "—")}</td>
                        <td style={{ padding: 8 }}>{d.difference !== undefined ? d.difference.toFixed(2) : ""}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {([["only_in_left", `Only in A (${report.left_document.filename})`], ["only_in_right", `Only in B (${report.right_document.filename})`]] as const).map(([key, title]) =>
            report[key].length > 0 && (
              <div className="card" key={key} style={{ marginTop: 14 }}>
                <strong>{title}</strong>
                <ul style={{ margin: "8px 0 0 18px", fontSize: 13 }}>
                  {report[key].map((r, i) => (
                    <li key={`${r.invoice_number}-${i}`}>
                      {r.invoice_number}{r.supplier_name ? ` · ${r.supplier_name}` : ""}{r.total != null ? ` · ${r.total.toFixed(2)}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

          {report.matched.length > 0 && (
            <p style={{ fontSize: 13, color: "#475569" }}>
              ✔ Matched: {report.matched.map((m) => m.invoice_number).join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
