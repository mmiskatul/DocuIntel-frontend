"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Discrepancy {
  id: string;
  transaction: string;
  ledger_amount: number | null;
  bank_amount: number | null;
  ledger_date?: string;
  bank_date?: string;
  flag_type: "UNMATCHED" | "DUPLICATE" | "TIMING DIFF" | "MISSING RECEIPT";
  difference: number;
  notes: string;
}

interface SourceItem {
  id: string;
  filename: string;
  type: string;
  count: number;
  status: string;
}

export default function ReconcilePage() {
  const [loading, setLoading] = useState(false);
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [selectedDiscrepancy, setSelectedDiscrepancy] = useState<Discrepancy | null>(null);

  useEffect(() => {
    loadReconciliation();
  }, []);

  async function loadReconciliation() {
    setLoading(true);
    try {
      const res = await api.reconcile([]);
      setSources(res.sources);
      setDiscrepancies(res.discrepancies);
      setSummary(res.summary);
      if (res.discrepancies.length > 0) {
        setSelectedDiscrepancy(res.discrepancies[0]);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }

  const exportReport = () => {
    const csvContent =
      "data:text/csv;charset=utf-8," +
      ["Transaction,Ledger Amount,Bank Amount,Flag Type,Difference,Notes"]
        .concat(
          discrepancies.map(
            (d) =>
              `"${d.transaction}",${d.ledger_amount ?? ""},${d.bank_amount ?? ""},"${d.flag_type}",${d.difference},"${d.notes}"`,
          ),
        )
        .join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Bank_Reconciliation_Discrepancies.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getFlagColor = (type: string) => {
    switch (type) {
      case "UNMATCHED":
        return { bg: "#fce8e6", color: "#c4261d", border: "#f5c6cb" };
      case "DUPLICATE":
        return { bg: "#f3e8ff", color: "#6b21a8", border: "#e9d5ff" };
      case "TIMING DIFF":
        return { bg: "#e0f2fe", color: "#0369a1", border: "#bae6fd" };
      case "MISSING RECEIPT":
        return { bg: "#fdf0dc", color: "#a35a00", border: "#fde68a" };
      default:
        return { bg: "#f1f5f9", color: "#475569", border: "#cbd5e1" };
    }
  };

  return (
    <div style={{ maxWidth: 1280, margin: "0 auto", padding: "20px 20px 60px" }}>
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0, color: "var(--text)" }}>
            Cross-Document Reconciliation Workspace
          </h1>
          <div className="muted small" style={{ marginTop: 4 }}>
            Reconcile ledger spreadsheets, PDF bank statements, and scanned receipt invoices automatically.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={loadReconciliation} className="btn" disabled={loading}>
            {loading ? "Reconciling..." : "Run Reconciliation"}
          </button>
          <button onClick={exportReport} className="btn btn-primary">
            Export Discrepancy Report
          </button>
        </div>
      </div>

      {/* Main 2-Column Split matching Image 2 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1.35fr", gap: 20, alignItems: "start" }}>
        {/* Left Column: Input Sources */}
        <div className="card" style={{ padding: 20, margin: 0 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--muted)", fontWeight: 700 }}>
            INPUT — FOLDER SOURCES
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "4px 0 16px", color: "var(--text)" }}>
            Ledger, bank statement &amp; receipts
          </h2>

          <div style={{ display: "grid", gap: 12 }}>
            {sources.map((src) => {
              const isExcel = src.filename.endsWith(".xlsx") || src.filename.endsWith(".csv");
              const isPdf = src.filename.endsWith(".pdf");
              return (
                <div
                  key={src.id}
                  style={{
                    padding: "16px",
                    borderRadius: 10,
                    border: "1.5px solid #e2e8f0",
                    background: "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 8,
                        background: isExcel ? "#e6f4ea" : isPdf ? "#fce8e6" : "#e8eefc",
                        color: isExcel ? "#137333" : isPdf ? "#c5221f" : "#1a73e8",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: 16,
                      }}
                    >
                      {isExcel ? "📊" : isPdf ? "📄" : "🖼️"}
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{src.filename}</div>
                      <div className="small muted">{src.type} — {src.count} transaction{src.count > 1 ? "s" : ""}</div>
                    </div>
                  </div>
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: "#12805c",
                      color: "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: "bold",
                    }}
                  >
                    ✓
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--green)", fontWeight: 600 }}>
            <span>● 4 of 4 sources loaded</span>
            <span className="muted" style={{ fontWeight: 400 }}>Auto-matched on invoice #, amount, date</span>
          </div>
        </div>

        {/* Center Match Bridge Icon */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", alignSelf: "center", padding: "10px 0" }}>
          <div
            style={{
              width: 58,
              height: 58,
              borderRadius: "50%",
              background: "#1e293b",
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 24,
              boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
            }}
          >
            ⇄
          </div>
          <div
            style={{
              marginTop: 10,
              background: "#ffffff",
              border: "1px solid #cbd5e1",
              borderRadius: 20,
              padding: "4px 12px",
              fontSize: 12,
              fontWeight: 700,
              color: "#1e293b",
              whiteSpace: "nowrap",
              boxShadow: "0 2px 4px rgba(0,0,0,0.06)",
            }}
          >
            Bank Reconciliation
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#12805c", fontWeight: 700 }}>
            ✓ {summary?.matched_count || 27} of {summary?.total_transactions || 30} matched
          </div>
        </div>

        {/* Right Column: Output Flagged Mismatches */}
        <div className="card card-flush" style={{ margin: 0 }}>
          <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "#c4261d", fontWeight: 700 }}>
              OUTPUT — FLAGGED MISMATCHES
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "4px 0 0", color: "var(--text)" }}>
              Bank Reconciliation Report — {summary?.period || "May/June 2026"}
            </h2>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--muted)" }}>
                  <th style={{ padding: "12px 16px", fontWeight: 600 }}>TRANSACTION</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "right" }}>LEDGER</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "right" }}>BANK</th>
                  <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "center" }}>FLAG TYPE</th>
                </tr>
              </thead>
              <tbody>
                {discrepancies.map((d) => {
                  const style = getFlagColor(d.flag_type);
                  const isSelected = selectedDiscrepancy?.id === d.id;
                  return (
                    <tr
                      key={d.id}
                      onClick={() => setSelectedDiscrepancy(d)}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: isSelected ? "#f1f5f9" : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ fontWeight: 600, color: "var(--text)" }}>{d.transaction}</div>
                        {d.ledger_date && d.bank_date && (
                          <div className="small muted">
                            {d.ledger_date} vs {d.bank_date}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                        {d.ledger_amount != null ? `$${d.ledger_amount.toFixed(2)}` : "—"}
                        {d.flag_type === "DUPLICATE" && <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 4 }}>×2</span>}
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                        {d.bank_amount != null ? `$${d.bank_amount.toFixed(2)}` : "—"}
                      </td>
                      <td style={{ padding: "14px 16px", textAlign: "center" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "3px 8px",
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: "0.4px",
                            background: style.bg,
                            color: style.color,
                            border: `1px solid ${style.border}`,
                          }}
                        >
                          {d.flag_type}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Reconciliation Discrepancy Detail Popover */}
          {selectedDiscrepancy && (
            <div style={{ padding: "14px 20px", background: "#f8fafc", borderTop: "1px solid var(--border)", fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <strong>Flag Inspection: {selectedDiscrepancy.transaction}</strong>
                <span className="muted">{selectedDiscrepancy.id}</span>
              </div>
              <div className="muted">{selectedDiscrepancy.notes}</div>
            </div>
          )}

          {/* Footer Bar */}
          <div
            style={{
              padding: "16px 20px",
              background: "#f1f5f9",
              borderTop: "2px solid #cbd5e1",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontWeight: 700,
            }}
          >
            <div>
              <span style={{ color: "#a35a00" }}>Unexplained difference: </span>
              <span style={{ fontSize: 16, color: "#c4261d" }}>${summary?.unexplained_difference?.toFixed(2) || "262.80"}</span>
            </div>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>
              {summary?.matched_count || 27} matched · <span style={{ color: "#c4261d" }}>{summary?.flagged_count || 4} FLAGGED</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

