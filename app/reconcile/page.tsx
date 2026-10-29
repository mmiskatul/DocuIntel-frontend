"use client";

import Link from "next/link";
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
    void loadReconciliation();
  }, []);

  async function loadReconciliation() {
    setLoading(true);
    try {
      const res = await api.reconcile([]);
      setSources(res.sources || []);
      setDiscrepancies(res.discrepancies || []);
      setSummary(res.summary || null);
      if (res.discrepancies && res.discrepancies.length > 0) {
        setSelectedDiscrepancy(res.discrepancies[0]);
      } else {
        setSelectedDiscrepancy(null);
      }
    } catch {
      setSources([]);
      setDiscrepancies([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }

  const exportReport = () => {
    if (!discrepancies.length) return;
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
    link.setAttribute("download", `Reconciliation_Discrepancies_${Date.now()}.csv`);
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
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "10px 0 60px" }}>
      {/* Top Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1>Cross-Document Reconciliation</h1>
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Automated 2-way and 3-way matching across invoices, purchase orders, and ledger records.
          </p>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={loadReconciliation} className="btn" disabled={loading}>
            {loading ? "Reconciling..." : "🔄 Run Reconciliation"}
          </button>
          <button
            onClick={exportReport}
            className="btn btn-primary"
            disabled={!discrepancies.length}
          >
            📥 Export Report
          </button>
        </div>
      </div>

      {/* When no documents are loaded yet */}
      {sources.length === 0 ? (
        <div className="card" style={{ padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 38, marginBottom: 12 }}>⚖️</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: "0 0 8px" }}>
            No Documents to Reconcile
          </h2>
          <p className="muted" style={{ maxWidth: 460, margin: "0 auto 20px" }}>
            Please upload invoices, purchase orders, or spreadsheets on the Documents page. The system will automatically compare totals, detect price differences, and identify missing vouchers.
          </p>
          <Link href="/" className="btn btn-primary">
            Go to Documents & Upload
          </Link>
        </div>
      ) : (
        /* Main 2-Column Split matching enterprise workspace */
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1.35fr", gap: 20, alignItems: "start" }}>
          {/* Left Column: Input Sources */}
          <div className="card" style={{ padding: 20, margin: 0 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--muted)", fontWeight: 700 }}>
              INPUT — FOLDER SOURCES
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: "4px 0 16px", color: "var(--text)" }}>
              Uploaded Documents ({sources.length})
            </h2>

            <div style={{ display: "grid", gap: 12 }}>
              {sources.map((src) => {
                const isExcel = src.filename.endsWith(".xlsx") || src.filename.endsWith(".csv");
                const isPdf = src.filename.endsWith(".pdf");
                return (
                  <div
                    key={src.id}
                    style={{
                      padding: "14px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--surface)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
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
                        <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text)" }}>{src.filename}</div>
                        <div className="small muted">{src.type}</div>
                      </div>
                    </div>
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: "var(--green)",
                        color: "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: "bold",
                      }}
                    >
                      ✓
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "var(--green)", fontWeight: 600 }}>
              <span>● {sources.length} document source{sources.length === 1 ? "" : "s"} indexed</span>
              <span className="muted" style={{ fontWeight: 400 }}>Auto-matched on invoice #, amount, date</span>
            </div>
          </div>

          {/* Center Match Bridge Icon */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", alignSelf: "center", padding: "10px 0" }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: "#1e293b",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
              }}
            >
              ⇄
            </div>
            <div
              style={{
                marginTop: 8,
                background: "#ffffff",
                border: "1px solid #cbd5e1",
                borderRadius: 20,
                padding: "3px 10px",
                fontSize: 11.5,
                fontWeight: 700,
                color: "#1e293b",
                whiteSpace: "nowrap",
              }}
            >
              Reconciliation
            </div>
            <div style={{ marginTop: 4, fontSize: 11.5, color: "var(--green)", fontWeight: 700 }}>
              ✓ {summary?.matched_count ?? 0} of {summary?.total_transactions ?? sources.length} matched
            </div>
          </div>

          {/* Right Column: Output Flagged Mismatches */}
          <div className="card card-flush" style={{ margin: 0 }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.5px", color: discrepancies.length > 0 ? "var(--red)" : "var(--green)", fontWeight: 700 }}>
                OUTPUT — {discrepancies.length > 0 ? "FLAGGED DISCREPANCIES" : "ALL MATCHED"}
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, margin: "4px 0 0", color: "var(--text)" }}>
                Reconciliation Report — {summary?.period || "Current"}
              </h2>
            </div>

            {discrepancies.length === 0 ? (
              <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
                ✓ No discrepancies detected across the indexed documents.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc", borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--muted)" }}>
                      <th style={{ padding: "10px 14px", fontWeight: 600 }}>TRANSACTION</th>
                      <th style={{ padding: "10px 14px", fontWeight: 600, textAlign: "right" }}>DOCUMENT</th>
                      <th style={{ padding: "10px 14px", fontWeight: 600, textAlign: "right" }}>VERIFIED</th>
                      <th style={{ padding: "10px 14px", fontWeight: 600, textAlign: "center" }}>FLAG TYPE</th>
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
                          <td style={{ padding: "12px 14px" }}>
                            <div style={{ fontWeight: 600, color: "var(--text)" }}>{d.transaction}</div>
                            {d.ledger_date && (
                              <div className="small muted">
                                {d.ledger_date}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "12px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                            {d.ledger_amount != null ? `$${d.ledger_amount.toFixed(2)}` : "—"}
                          </td>
                          <td style={{ padding: "12px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                            {d.bank_amount != null ? `$${d.bank_amount.toFixed(2)}` : "—"}
                          </td>
                          <td style={{ padding: "12px 14px", textAlign: "center" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 7px",
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 700,
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
            )}

            {/* Reconciliation Discrepancy Detail Popover */}
            {selectedDiscrepancy && (
              <div style={{ padding: "14px 20px", background: "#f8fafc", borderTop: "1px solid var(--border)", fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <strong>Discrepancy Details: {selectedDiscrepancy.transaction}</strong>
                  <span className="muted">{selectedDiscrepancy.id}</span>
                </div>
                <div className="muted">{selectedDiscrepancy.notes}</div>
              </div>
            )}

            {/* Footer Bar */}
            <div
              style={{
                padding: "14px 20px",
                background: "#f1f5f9",
                borderTop: "2px solid #cbd5e1",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              <div>
                <span style={{ color: "#a35a00" }}>Total Difference: </span>
                <span style={{ fontSize: 15, color: (summary?.unexplained_difference ?? 0) > 0 ? "var(--red)" : "var(--green)" }}>
                  ${(summary?.unexplained_difference ?? 0).toFixed(2)}
                </span>
              </div>
              <div style={{ color: "var(--muted)", fontSize: 12.5 }}>
                {summary?.matched_count ?? 0} matched ·{" "}
                <span style={{ color: (summary?.flagged_count ?? 0) > 0 ? "var(--red)" : "var(--green)" }}>
                  {summary?.flagged_count ?? 0} FLAGGED
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
